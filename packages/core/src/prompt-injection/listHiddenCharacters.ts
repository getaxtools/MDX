import { CodePointSet } from './CodePointSet';
import { EMPTY_DOCUMENT_STRUCTURE } from './DocumentStructure';
import { findCharacterMatches } from './findCharacterMatches';
import { HiddenCharacterNames, type HiddenCharacterName } from './HiddenCharacterNames';
import { scanHiddenCharacters } from './matchers/scanHiddenCharacters';
import { Ruleset } from './Ruleset';
import { SortedRanges } from './SortedRanges';
import { StructureLookup } from './StructureLookup';
import { TextPositions } from './TextPositions';

/** An invisible, control, direction or variation character, for markers that make it visible. */
export interface ListedHiddenCharacter extends HiddenCharacterName {
  /** UTF-16 offsets in the text. */
  readonly from: number;
  readonly to: number;
  readonly codePoint: number;
  /**
   * Part of a sequence that draws as one picture or keeps a word joined, such as an emoji family, a
   * flag or a Persian word. A marker inside it would break the drawing, so it is outlined instead.
   */
  readonly isInSequence: boolean;
}

const SEQUENCE_CHARACTER_SETS = ['zeroWidthJoiner', 'scriptJoiners', 'variationSelectors', 'tagCharacters'];

const sequenceCharactersByRuleset = new WeakMap<Ruleset, CodePointSet>();

function sequenceCharactersOf(ruleset: Ruleset): CodePointSet {
  let sequenceCharacters = sequenceCharactersByRuleset.get(ruleset);
  if (!sequenceCharacters) {
    sequenceCharacters = CodePointSet.union(
      SEQUENCE_CHARACTER_SETS.map((name) => ruleset.codepointSet(name)),
    );
    sequenceCharactersByRuleset.set(ruleset, sequenceCharacters);
  }
  return sequenceCharacters;
}

/**
 * Lists the named hidden characters in a stretch of text, such as one line. A joiner, selector or tag
 * that no character rule reports is taken as part of a legitimate sequence.
 */
export function listHiddenCharacters(
  text: string,
  ruleset: Ruleset = Ruleset.bundled(),
): ListedHiddenCharacter[] {
  const names = HiddenCharacterNames.bundled();
  const { characters } = scanHiddenCharacters(text, names.namedCodePoints());
  if (characters.length === 0) return [];
  const characterCheck = {
    text,
    lookup: StructureLookup.of(EMPTY_DOCUMENT_STRUCTURE),
    positions: TextPositions.of(text),
  };
  const reported = SortedRanges.of(findCharacterMatches(characterCheck, ruleset).matches);
  const sequenceCharacters = sequenceCharactersOf(ruleset);
  return characters.flatMap(({ from, to, codePoint }) => {
    const name = names.nameOf(codePoint);
    if (!name) return [];
    const isInSequence = sequenceCharacters.has(codePoint) && !reported.contains(from);
    return [{ from, to, codePoint, ...name, isInSequence }];
  });
}
