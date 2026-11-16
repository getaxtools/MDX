import type { FindingContext } from '../escalateSeverity';
import type { FindingMessageArguments } from '../InjectionCheck';
import type { InjectionSeverity } from '../injectionSeverity';
import type { Ruleset } from '../Ruleset';
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
