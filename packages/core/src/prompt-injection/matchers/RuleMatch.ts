import type { DocumentStructure } from '../DocumentStructure';
import type { FindingContext } from '../escalateSeverity';
import type { HtmlAnalysis } from '../html/analyzeHtml';
import type { FindingMessageArguments } from '../InjectionCheck';
import type { InjectionSeverity } from '../injectionSeverity';
import type { Ruleset } from '../Ruleset';
import type { SortedRanges } from '../SortedRanges';
import type { StructureLookup } from '../StructureLookup';
import type { TextPositions } from '../TextPositions';
import type { HiddenCharacter } from './scanHiddenCharacters';

/** What a matcher found, before context escalation, positions and excerpts turn it into a finding. */
export interface RuleMatch {
  readonly ruleId: string;
  readonly from: number;
  readonly to: number;
  /** The rule's severity for this match, before the document context changes it. */
  readonly severity: InjectionSeverity;
  readonly context?: Partial<Omit<FindingContext, 'isAgentFile'>>;
  readonly decoded?: string;
  readonly messageArguments?: FindingMessageArguments;
}

export interface CharacterRuleInput {
  readonly text: string;
  readonly ruleset: Ruleset;
  readonly structure: StructureLookup;
  readonly positions: TextPositions;
  readonly hiddenCharacters: readonly HiddenCharacter[];
}

export type CharacterMatcher = (input: CharacterRuleInput) => RuleMatch[];

export function charactersIn(input: CharacterRuleInput, setName: string): HiddenCharacter[] {
  const set = input.ruleset.codepointSet(setName);
  return input.hiddenCharacters.filter((character) => set.has(character.codePoint));
}

export function spanOf(run: readonly HiddenCharacter[]): { readonly from: number; readonly to: number } {
  return { from: run[0]?.from ?? 0, to: run.at(-1)?.to ?? 0 };
}

/** What the structure, URL and phrase rules read: the raw text, the parser's structure and the raw HTML. */
export interface DocumentRuleInput {
  readonly text: string;
  readonly ruleset: Ruleset;
  readonly structure: DocumentStructure;
  readonly lookup: StructureLookup;
  readonly positions: TextPositions;
  readonly html: HtmlAnalysis;
  /** Content a reader does not see: hidden HTML, collapsed sections, comments and unused definitions. */
  readonly hiddenRegions: SortedRanges;
  readonly isAgentFile: boolean;
}

export type DocumentMatcher = (input: DocumentRuleInput) => RuleMatch[];

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const HTML_TAG = /<[^<>]*>/g;

/** Whether a stretch of the document has readable text once tags are left out. */
export function hasReadableText(text: string): boolean {
  return LETTER_OR_DIGIT.test(text.replaceAll(HTML_TAG, ''));
}
