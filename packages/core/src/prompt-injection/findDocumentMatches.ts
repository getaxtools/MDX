import type { DocumentStructure, SourceRange } from './DocumentStructure';
import { analyzeHtml, type HtmlAnalysis } from './html/analyzeHtml';
import {
  findAlwaysLoadedRules,
  findBroadToolGrants,
  findDescriptionInstructions,
  findExternalImports,
  findSelfPropagation,
} from './matchers/findAgentFileRisks';
import { findConfusableCommands, findPipeToShell } from './matchers/findCommandRisks';
import { findEncodedBlobs } from './matchers/findEncodedBlobs';
import { findExfiltrationUrls } from './matchers/findExfiltrationUrls';
import { findHiddenHtmlComments, findHiddenMarkdownComments } from './matchers/findHiddenComments';
import { findHiddenHtml } from './matchers/findHiddenHtml';
import {
  findEmptyLinks,
  findFrontMatter,
  findHiddenTitlesAndDescriptions,
  findUnusedReferences,
} from './matchers/findHiddenMarkdown';
import {
  findInstructionPhrases,
  findInstructionPhrasesInPayloads,
  type DecodedPayload,
} from './matchers/findInstructionPhrases';
import { findOffScreenText } from './matchers/findOffScreenText';
import type { DocumentMatcher, DocumentRuleInput, RuleMatch } from './matchers/RuleMatch';
import { numberParameter, type Ruleset } from './Ruleset';
import { SortedRanges } from './SortedRanges';
import type { StructureLookup } from './StructureLookup';
import type { TextPositions } from './TextPositions';

const DOCUMENT_MATCHERS: readonly DocumentMatcher[] = [
  findHiddenHtmlComments,
  findHiddenMarkdownComments,
  findHiddenHtml,
  findHiddenTitlesAndDescriptions,
  findUnusedReferences,
  findFrontMatter,
  findOffScreenText,
  findEmptyLinks,
  findExfiltrationUrls,
  findInstructionPhrases,
  findPipeToShell,
  findConfusableCommands,
];
const AGENT_FILE_MATCHERS: readonly DocumentMatcher[] = [
  findExternalImports,
  findBroadToolGrants,
  findDescriptionInstructions,
  findSelfPropagation,
  findAlwaysLoadedRules,
];

export interface DocumentCheckInput {
  readonly text: string;
  readonly structure: DocumentStructure;
  readonly lookup: StructureLookup;
  readonly positions: TextPositions;
  readonly isAgentFile: boolean;
}

function hiddenRegionsOf(structure: DocumentStructure, html: HtmlAnalysis): SortedRanges {
  const unusedDefinitions = structure.segments.flatMap((segment) =>
    segment.kind === 'referenceDefinition' && !segment.isUsed ? [segment.range] : [],
  );
  const ranges: SourceRange[] = [
    ...html.hiddenContents.map((hidden) => hidden.content),
    ...html.comments,
    ...unusedDefinitions,
  ];
  return SortedRanges.of(ranges);
}

/** Builds what the structure rules share: the raw HTML read once and the regions a reader cannot see. */
export function documentRuleInputOf(input: DocumentCheckInput, ruleset: Ruleset): DocumentRuleInput {
  const cssRule = ruleset.rule('hidden-css');
  const styleThresholds = {
    minFontSizePx: numberParameter(cssRule, 'minFontSizePx'),
    offScreenOffsetPx: numberParameter(cssRule, 'offScreenOffsetPx'),
  };
  const html = analyzeHtml(input.text, input.structure, { ruleset, styleThresholds });
  return { ...input, ruleset, html, hiddenRegions: hiddenRegionsOf(input.structure, html) };
}

function payloadsOf(matches: readonly RuleMatch[]): DecodedPayload[] {
  return matches.flatMap((match) =>
    match.decoded === undefined
      ? []
      : [{ range: { from: match.from, to: match.to }, decoded: match.decoded }],
  );
}

/**
 * Runs the structure, address, phrase and command rules, and the agent-file rules in agent files. Text
 * decoded from hidden payloads, in the character matches or in encoded blocks, is checked once more.
 */
export function findDocumentMatches(
  input: DocumentRuleInput,
  characterMatches: readonly RuleMatch[],
): RuleMatch[] {
  const matchers = input.isAgentFile ? [...DOCUMENT_MATCHERS, ...AGENT_FILE_MATCHERS] : DOCUMENT_MATCHERS;
  const documentMatches = matchers.flatMap((matcher) => matcher(input));
  const encodedBlobs = findEncodedBlobs(input);
  const payloads = payloadsOf([...characterMatches, ...encodedBlobs]);
  return [...documentMatches, ...encodedBlobs, ...findInstructionPhrasesInPayloads(input, payloads)];
}
