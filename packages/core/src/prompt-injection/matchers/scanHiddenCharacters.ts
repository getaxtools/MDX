import { CodePointSet } from '../CodePointSet';
import { codePointLength } from '../codePoints';
import type { Ruleset } from '../Ruleset';

export interface HiddenCharacter {
  readonly from: number;
  readonly to: number;
  readonly codePoint: number;
}

export interface HiddenCharacterScan {
  /** In document order. */
  readonly characters: readonly HiddenCharacter[];
  readonly isPartial: boolean;
}

/** Above this many hidden characters the rest of the document is not scanned and the result is marked partial. */
export const MAX_HIDDEN_CHARACTERS = 100_000;

const HIDDEN_CHARACTER_SETS = [
  'tagCharacters',
  'variationSelectors',
  'bidiControls',
  'bidiMarks',
  'zeroWidthCharacters',
  'invisibleFillers',
  'controlCharacters',
  'privateUseCharacters',
];
const FIRST_NON_ASCII = 0x80;
const FIRST_PRINTABLE_ASCII = 0x20;
const DELETE = 0x7f;

const hiddenCharactersByRuleset = new WeakMap<Ruleset, CodePointSet>();

/** Every code point a character rule looks at. */
export function hiddenCharactersOf(ruleset: Ruleset): CodePointSet {
  let hiddenCharacters = hiddenCharactersByRuleset.get(ruleset);
  if (!hiddenCharacters) {
    hiddenCharacters = CodePointSet.union(HIDDEN_CHARACTER_SETS.map((name) => ruleset.codepointSet(name)));
    hiddenCharactersByRuleset.set(ruleset, hiddenCharacters);
  }
  return hiddenCharacters;
}

function isPlainAscii(charCode: number): boolean {
  return charCode >= FIRST_PRINTABLE_ASCII && charCode < DELETE;
}

/** Finds every code point that the character rules look at, in one pass with a fast path for plain ASCII. */
export function scanHiddenCharacters(text: string, hiddenCharacters: CodePointSet): HiddenCharacterScan {
  const characters: HiddenCharacter[] = [];
  let offset = 0;
  while (offset < text.length) {
    const charCode = text.charCodeAt(offset);
    if (isPlainAscii(charCode) || (charCode < FIRST_NON_ASCII && !hiddenCharacters.has(charCode))) {
      offset += 1;
      continue;
    }
    const codePoint = text.codePointAt(offset) ?? charCode;
    const to = offset + codePointLength(codePoint);
    if (hiddenCharacters.has(codePoint)) {
      if (characters.length === MAX_HIDDEN_CHARACTERS) return { characters, isPartial: true };
      characters.push({ from: offset, to, codePoint });
    }
    offset = to;
  }
  return { characters, isPartial: false };
}

/** Splits characters into runs that touch each other in the text. */
export function adjacentRuns(characters: readonly HiddenCharacter[]): HiddenCharacter[][] {
  const runs: HiddenCharacter[][] = [];
  for (const character of characters) {
    const run = runs.at(-1);
    if (run && run.at(-1)?.to === character.from) run.push(character);
    else runs.push([character]);
  }
  return runs;
}
