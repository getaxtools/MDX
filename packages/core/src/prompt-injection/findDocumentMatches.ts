import type { DocumentStructure, SourceRange } from './DocumentStructure';
import { analyzeHtml, type HtmlAnalysis } from './html/analyzeHtml';
import { findExfiltrationUrls } from './matchers/findExfiltrationUrls';
import { findHiddenHtmlComments, findHiddenMarkdownComments } from './matchers/findHiddenComments';
import { findHiddenHtml } from './matchers/findHiddenHtml';
import {
  findEmptyLinks,
  findFrontMatter,
  findHiddenTitlesAndDescriptions,
  findUnusedReferences,
} from './matchers/findHiddenMarkdown';
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

/** Runs the `hidden-*` and `exfil-*` rules and the address look-alike rule over the parsed structure. */
export function findDocumentMatches(input: DocumentRuleInput): RuleMatch[] {
  return DOCUMENT_MATCHERS.flatMap((matcher) => matcher(input));
}
