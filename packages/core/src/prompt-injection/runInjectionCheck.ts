import { EMPTY_DOCUMENT_STRUCTURE, type DocumentStructure } from './DocumentStructure';
import { escalateSeverity, PLAIN_FINDING_CONTEXT } from './escalateSeverity';
import { findCharacterMatches } from './findCharacterMatches';
import { documentRuleInputOf, findDocumentMatches } from './findDocumentMatches';
import type { InjectionCheckRequest, InjectionCheckResult, InjectionFinding } from './InjectionCheck';
import { severityRank, type InjectionSeverity } from './injectionSeverity';
import { isAgentFileLocation } from './isAgentFileLocation';
import type { RuleMatch } from './matchers/RuleMatch';
import { Ruleset } from './Ruleset';
import { safeExcerpt } from './safeExcerpt';
import { StructureLookup } from './StructureLookup';
import { TextPositions } from './TextPositions';

/** More findings than this are not listed; the result is then marked partial. */
export const MAX_LISTED_FINDINGS = 1_000;

interface FindingSource {
  readonly text: string;
  readonly positions: TextPositions;
  readonly ruleset: Ruleset;
  readonly isAgentFile: boolean;
}

interface RatedMatch {
  readonly match: RuleMatch;
  readonly severity: InjectionSeverity;
}

function rate(source: FindingSource, match: RuleMatch): RatedMatch | undefined {
  const rule = source.ruleset.rule(match.ruleId);
  if (rule.appliesTo === 'agentFiles' && !source.isAgentFile) return undefined;
  const context = { ...PLAIN_FINDING_CONTEXT, ...match.context, isAgentFile: source.isAgentFile };
  return { match, severity: escalateSeverity(match.severity, rule.escalation, context) };
}

function toFinding(source: FindingSource, { match, severity }: RatedMatch): InjectionFinding {
  const { line, column } = source.positions.positionOf(match.from);
  return {
    ruleId: match.ruleId,
    severity,
    from: match.from,
    to: match.to,
    line,
    column,
    excerpt: safeExcerpt(source, match),
    ...(match.decoded === undefined ? {} : { decoded: match.decoded }),
    messageArguments: match.messageArguments ?? {},
  };
}

function highestSeverityFirst(left: RatedMatch, right: RatedMatch): number {
  return severityRank(right.severity) - severityRank(left.severity) || left.match.from - right.match.from;
}

function inDocumentOrder({ match: left }: RatedMatch, { match: right }: RatedMatch): number {
  return left.from - right.from || left.to - right.to || left.ruleId.localeCompare(right.ruleId);
}

interface CheckedMatches {
  readonly matches: readonly RuleMatch[];
  readonly isPartial: boolean;
}

function resultOf(source: FindingSource, { matches, isPartial }: CheckedMatches): InjectionCheckResult {
  const ratedMatches = matches.flatMap((match) => rate(source, match) ?? []);
  const listedMatches = ratedMatches
    .sort(highestSeverityFirst)
    .slice(0, MAX_LISTED_FINDINGS)
    .sort(inDocumentOrder);
  return {
    rulesetVersion: source.ruleset.version,
    findings: listedMatches.map((ratedMatch) => toFinding(source, ratedMatch)),
    isAgentFile: source.isAgentFile,
    ignoredCount: 0,
    isPartial: isPartial || ratedMatches.length > MAX_LISTED_FINDINGS,
  };
}

function findingSourceOf(request: InjectionCheckRequest, ruleset: Ruleset): FindingSource {
  const isAgentFile = request.isAgentContext === true || isAgentFileLocation(request.location, ruleset);
  return { text: request.text, positions: TextPositions.of(request.text), ruleset, isAgentFile };
}

/** Checks one document; the structure, from the renderer, says where code, links and hidden content are. */
export function runInjectionCheck(
  request: InjectionCheckRequest,
  structure: DocumentStructure = EMPTY_DOCUMENT_STRUCTURE,
  ruleset: Ruleset = Ruleset.bundled(),
): InjectionCheckResult {
  const source = findingSourceOf(request, ruleset);
  const { text, positions, isAgentFile } = source;
  const lookup = StructureLookup.of(structure);
  const characterMatches = findCharacterMatches({ text, lookup, positions }, ruleset);
  const documentInput = documentRuleInputOf({ text, structure, lookup, positions, isAgentFile }, ruleset);
  return resultOf(source, {
    matches: [...characterMatches.matches, ...findDocumentMatches(documentInput, characterMatches.matches)],
    isPartial: characterMatches.isPartial,
  });
}

/**
 * Runs only the character rules, for documents too large to parse in time. The structure, phrase and
 * address rules are left out, so the result is always partial.
 */
export function runCharacterCheck(
  request: InjectionCheckRequest,
  ruleset: Ruleset = Ruleset.bundled(),
): InjectionCheckResult {
  const source = findingSourceOf(request, ruleset);
  const lookup = StructureLookup.of(EMPTY_DOCUMENT_STRUCTURE);
  const { matches } = findCharacterMatches(
    { text: source.text, lookup, positions: source.positions },
    ruleset,
  );
  return resultOf(source, { matches, isPartial: true });
}
