import type { SourceRange } from '../DocumentStructure';
import { numberParameter, severityParameter, type Ruleset } from '../Ruleset';
import { findUrlData, type UrlDataLimits } from '../urls/findUrlData';
import { isDeceptiveHost } from '../urls/isDeceptiveHost';
import { isHostIn, readRemoteUrl, withoutWww, type RemoteUrl } from '../urls/readRemoteUrl';
import type { DocumentRuleInput, RuleMatch } from './RuleMatch';

const IMAGE_DATA_RULE_ID = 'exfil-image-url-data';
const REMOTE_IMAGE_RULE_ID = 'exfil-remote-image';
const LINK_DATA_RULE_ID = 'exfil-link-url-data';
const COLLECTOR_RULE_ID = 'exfil-collector-host';
const MISMATCH_RULE_ID = 'exfil-link-mismatch';
const CONFUSABLE_RULE_ID = 'char-confusable-url';
const DOMAIN_LIKE_TEXT = /^(?:https?:\/\/)?((?:[\p{L}\p{N}-]+\.)+([\p{L}]{2,}))(?:[/:?#]\S*)?$/u;

interface UrlOccurrence {
  readonly kind: 'image' | 'link';
  readonly remote: RemoteUrl;
  readonly range: SourceRange;
  /** The visible text of a Markdown link that is not an autolink. */
  readonly linkText?: string;
}

export function urlDataLimitsOf(ruleset: Ruleset, ruleId: string): UrlDataLimits {
  const rule = ruleset.rule(ruleId);
  return {
    maxValueLength: numberParameter(rule, 'maxValueLength'),
    minEncodedLength: numberParameter(rule, 'minEncodedLength'),
    minHexLength: numberParameter(rule, 'minHexLength'),
    minDataValueLength: numberParameter(rule, 'minDataValueLength'),
    dataParameterNames: ruleset.list('dataParameterNames'),
    trackingParameterPrefixes: ruleset.list('trackingParameterPrefixes'),
  };
}

interface WrittenAddress {
  readonly written: string;
  readonly range: SourceRange;
  readonly linkText?: string | undefined;
}

function occurrence(
  kind: UrlOccurrence['kind'],
  { written, range, linkText }: WrittenAddress,
): UrlOccurrence[] {
  const remote = readRemoteUrl(written);
  if (!remote) return [];
  return [{ kind, remote, range, ...(linkText === undefined ? {} : { linkText }) }];
}

function urlOccurrencesOf(input: DocumentRuleInput): UrlOccurrence[] {
  const fromMarkdown = input.structure.segments.flatMap((segment) => {
    if (segment.kind === 'image')
      return occurrence('image', { written: segment.source, range: segment.range });
    if (segment.kind !== 'link') return [];
    return occurrence('link', {
      written: segment.destination,
      range: segment.range,
      linkText: segment.isAutolink ? undefined : segment.text,
    });
  });
  const fromHtml = [
    ...input.html.images.flatMap((image) => occurrence('image', { written: image.url, range: image.tag })),
    ...input.html.links.flatMap((link) => occurrence('link', { written: link.url, range: link.tag })),
  ];
  return [...fromMarkdown, ...fromHtml].sort((left, right) => left.range.from - right.range.from);
}

function isBadge(ruleset: Ruleset, remote: RemoteUrl): boolean {
  if (isHostIn(remote.host, ruleset.list('badgeHosts'))) return true;
  const path = remote.url.pathname.toLowerCase();
  return (
    isHostIn(remote.host, ruleset.list('badgePathHosts')) &&
    ruleset.list('badgePathMarkers').some((marker) => path.includes(marker))
  );
}

function matchAt(input: DocumentRuleInput, found: UrlOccurrence, ruleId: string): RuleMatch {
  return {
    ruleId,
    ...found.range,
    severity: input.ruleset.rule(ruleId).severity,
    context: { isHidden: input.hiddenRegions.contains(found.range.from) },
    messageArguments: { address: found.remote.host },
  };
}

function collectorMatches(input: DocumentRuleInput, found: UrlOccurrence): RuleMatch[] {
  if (!isHostIn(found.remote.host, input.ruleset.list('collectorHosts'))) return [];
  const match = matchAt(input, found, COLLECTOR_RULE_ID);
  if (found.kind === 'link') return [match];
  return [{ ...match, severity: severityParameter(input.ruleset.rule(COLLECTOR_RULE_ID), 'imageSeverity') }];
}

function dataMatches(input: DocumentRuleInput, found: UrlOccurrence): RuleMatch[] {
  if (found.kind === 'link') {
    const linkData = findUrlData(found.remote.url, urlDataLimitsOf(input.ruleset, LINK_DATA_RULE_ID));
    return linkData.hasData ? [matchAt(input, found, LINK_DATA_RULE_ID)] : [];
  }
  const imageData = findUrlData(found.remote.url, urlDataLimitsOf(input.ruleset, IMAGE_DATA_RULE_ID));
  const isReported = imageData.hasPlaceholder || (imageData.hasData && !isBadge(input.ruleset, found.remote));
  return isReported ? [matchAt(input, found, IMAGE_DATA_RULE_ID)] : [];
}

/** The host a link's text shows, when the text looks like an address rather than a file name. */
function shownHostOf(input: DocumentRuleInput, linkText: string): string | undefined {
  const match = DOMAIN_LIKE_TEXT.exec(linkText.trim());
  const topLevel = match?.[2]?.toLowerCase();
  if (!match?.[1] || topLevel === undefined) return undefined;
  if (input.ruleset.list('fileExtensions').includes(topLevel)) return undefined;
  return readRemoteUrl(`https://${match[1]}`)?.host;
}

function mismatchMatches(input: DocumentRuleInput, found: UrlOccurrence): RuleMatch[] {
  if (found.linkText === undefined) return [];
  const shownHost = shownHostOf(input, found.linkText);
  if (shownHost === undefined || withoutWww(shownHost) === withoutWww(found.remote.host)) return [];
  const rule = input.ruleset.rule(MISMATCH_RULE_ID);
  const isRedirector = isHostIn(found.remote.host, input.ruleset.list('redirectorHosts'));
  const match = matchAt(input, found, MISMATCH_RULE_ID);
  return [
    {
      ...match,
      severity: isRedirector ? severityParameter(rule, 'redirectorSeverity') : rule.severity,
      messageArguments: { url: shownHost, address: found.remote.host },
    },
  ];
}

function confusableMatches(input: DocumentRuleInput, found: UrlOccurrence): RuleMatch[] {
  const latinLookalikes = input.ruleset.codepointSet('latinLookalikes');
  return isDeceptiveHost(found.remote.writtenHost, latinLookalikes)
    ? [matchAt(input, found, CONFUSABLE_RULE_ID)]
    : [];
}

/** Images other than badges, one finding per host: each one tells its host that someone opened the text. */
function remoteImageMatches(input: DocumentRuleInput, occurrences: readonly UrlOccurrence[]): RuleMatch[] {
  const imagesByHost = new Map<string, UrlOccurrence[]>();
  for (const found of occurrences) {
    if (found.kind !== 'image' || isBadge(input.ruleset, found.remote)) continue;
    const images = imagesByHost.get(found.remote.host);
    if (images) images.push(found);
    else imagesByHost.set(found.remote.host, [found]);
  }
  return [...imagesByHost.values()].flatMap(([first, ...others]) => {
    if (!first) return [];
    const match = matchAt(input, first, REMOTE_IMAGE_RULE_ID);
    return [{ ...match, messageArguments: { address: first.remote.host, count: others.length + 1 } }];
  });
}

export function findExfiltrationUrls(input: DocumentRuleInput): RuleMatch[] {
  const occurrences = urlOccurrencesOf(input);
  return [
    ...occurrences.flatMap((found) => [
      ...collectorMatches(input, found),
      ...dataMatches(input, found),
      ...mismatchMatches(input, found),
      ...confusableMatches(input, found),
    ]),
    ...remoteImageMatches(input, occurrences),
  ];
}
