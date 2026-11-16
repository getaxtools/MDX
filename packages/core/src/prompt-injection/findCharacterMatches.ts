import type { DocumentStructure } from './DocumentStructure';
import {
  findBidiMarksInCode,
  findBidiOverrides,
  findUnbalancedBidiControls,
} from './matchers/findBidiControls';
import { findControlCharacters } from './matchers/findControlCharacters';
import { findEncodedInvisibleCharacters } from './matchers/findEncodedInvisibleCharacters';
import { findInvisibleFillers } from './matchers/findInvisibleFillers';
import { findPrivateUseCharacters } from './matchers/findPrivateUseCharacters';
import { findTagCharacters } from './matchers/findTagCharacters';
import { findVariationSelectorPayloads } from './matchers/findVariationSelectorPayloads';
import { findZeroWidthCharacters } from './matchers/findZeroWidthCharacters';
import type { CharacterMatcher, RuleMatch } from './matchers/RuleMatch';
import { hiddenCharactersOf, scanHiddenCharacters } from './matchers/scanHiddenCharacters';
import type { Ruleset } from './Ruleset';
import { StructureLookup } from './StructureLookup';
import type { TextPositions } from './TextPositions';

const CHARACTER_MATCHERS: readonly CharacterMatcher[] = [
  findTagCharacters,
  findVariationSelectorPayloads,
  findBidiOverrides,
  findUnbalancedBidiControls,
  findBidiMarksInCode,
  findZeroWidthCharacters,
  findInvisibleFillers,
  findControlCharacters,
  findPrivateUseCharacters,
  findEncodedInvisibleCharacters,
];

export interface CharacterCheckInput {
  readonly text: string;
  readonly structure: DocumentStructure;
  readonly positions: TextPositions;
}

export interface CharacterMatches {
  readonly matches: readonly RuleMatch[];
  readonly isPartial: boolean;
}

/** Runs every `char-*` rule over the raw text; the structure only says where code, math and links are. */
export function findCharacterMatches(input: CharacterCheckInput, ruleset: Ruleset): CharacterMatches {
  const scan = scanHiddenCharacters(input.text, hiddenCharactersOf(ruleset));
  const ruleInput = {
    text: input.text,
    ruleset,
    structure: StructureLookup.of(input.structure),
    positions: input.positions,
    hiddenCharacters: scan.characters,
  };
  return { matches: CHARACTER_MATCHERS.flatMap((matcher) => matcher(ruleInput)), isPartial: scan.isPartial };
}
