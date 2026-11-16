import type { DocumentSegment, LinkSegment } from '../DocumentStructure';
import { numberParameter, severityParameter } from '../Ruleset';
import { readRemoteUrl } from '../urls/readRemoteUrl';
import { isMarkdownComment } from './findHiddenComments';
import { urlDataLimitsOf } from './findExfiltrationUrls';
import { findUrlData } from '../urls/findUrlData';
import type { DocumentRuleInput, RuleMatch } from './RuleMatch';

const TITLE_RULE_ID = 'hidden-link-title';
const ALT_RULE_ID = 'hidden-image-alt';
const UNUSED_REFERENCE_RULE_ID = 'hidden-unused-reference';
const FRONT_MATTER_RULE_ID = 'hidden-front-matter';
const EMPTY_LINK_RULE_ID = 'hidden-empty-link';
const LINK_DATA_RULE_ID = 'exfil-link-url-data';
const INVISIBLE_OR_SPACE = /(?:[\s\p{Cf}\p{Cc}\u115F\u1160\u3164\uFFA0\u2800]|\u034F)/gu;

function match(input: DocumentRuleInput, ruleId: string, segment: DocumentSegment): RuleMatch {
  return { ruleId, ...segment.range, severity: input.ruleset.rule(ruleId).severity };
}

/** Titles show only on hover, and long image descriptions only when the image fails to load. */
export function findHiddenTitlesAndDescriptions(input: DocumentRuleInput): RuleMatch[] {
  const maxAltLength = numberParameter(input.ruleset.rule(ALT_RULE_ID), 'maxAltLength');
  const markdownMatches = input.structure.segments.flatMap((segment) => {
    const hasTitle =
      (segment.kind === 'link' || segment.kind === 'image') && (segment.title ?? '').trim() !== '';
    const hasLongAlt = segment.kind === 'image' && Array.from(segment.alt).length > maxAltLength;
    return [
      ...(hasTitle ? [match(input, TITLE_RULE_ID, segment)] : []),
      ...(hasLongAlt ? [match(input, ALT_RULE_ID, segment)] : []),
    ];
  });
  const htmlMatches = [...input.html.images, ...input.html.links].flatMap((resource) => {
    const hasTitle = (resource.title ?? '').trim() !== '';
    const hasLongAlt = Array.from(resource.alt ?? '').length > maxAltLength;
    return [
      ...(hasTitle
        ? [{ ruleId: TITLE_RULE_ID, ...resource.tag, severity: input.ruleset.rule(TITLE_RULE_ID).severity }]
        : []),
      ...(hasLongAlt
        ? [{ ruleId: ALT_RULE_ID, ...resource.tag, severity: input.ruleset.rule(ALT_RULE_ID).severity }]
        : []),
    ];
  });
  return [...markdownMatches, ...htmlMatches];
}

export function findUnusedReferences(input: DocumentRuleInput): RuleMatch[] {
  return input.structure.segments.flatMap((segment) =>
    segment.kind === 'referenceDefinition' && !segment.isUsed && !isMarkdownComment(input.ruleset, segment)
      ? [match(input, UNUSED_REFERENCE_RULE_ID, segment)]
      : [],
  );
}

export function findFrontMatter(input: DocumentRuleInput): RuleMatch[] {
  return input.structure.segments.flatMap((segment) =>
    segment.kind === 'frontMatter' && segment.range.to > segment.range.from
      ? [match(input, FRONT_MATTER_RULE_ID, segment)]
      : [],
  );
}

function isEmptyLink(link: LinkSegment): boolean {
  return !link.isAutolink && !link.hasImage && link.text.replaceAll(INVISIBLE_OR_SPACE, '') === '';
}

/** A link nobody can see or click on the page, which an agent can still follow. */
export function findEmptyLinks(input: DocumentRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(EMPTY_LINK_RULE_ID);
  const limits = urlDataLimitsOf(input.ruleset, LINK_DATA_RULE_ID);
  return input.structure.segments.flatMap((segment) => {
    if (segment.kind !== 'link' || !isEmptyLink(segment)) return [];
    const remote = readRemoteUrl(segment.destination);
    const isCarryingData = remote !== undefined && findUrlData(remote.url, limits).hasData;
    const severity = isCarryingData ? severityParameter(rule, 'dataSeverity') : rule.severity;
    return [{ ruleId: EMPTY_LINK_RULE_ID, ...segment.range, severity }];
  });
}
