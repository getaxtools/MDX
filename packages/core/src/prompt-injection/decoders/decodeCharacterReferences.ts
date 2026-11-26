import { parseCodePointNotation } from '../CodePointSet';
import characterReferenceData from '../rules/character-references.json' with { type: 'json' };

export interface CharacterReference {
  readonly from: number;
  readonly to: number;
  readonly codePoint: number;
}

const CHARACTER_REFERENCE = /&(?:#[xX]([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([A-Za-z][A-Za-z0-9]{1,31}));/g;
const HEXADECIMAL = 16;
const DECIMAL = 10;
const MAX_CODE_POINT = 0x10ffff;
const NAMED_REFERENCES: ReadonlyMap<string, number> = new Map(
  Object.entries(characterReferenceData.named).flatMap(([name, notation]) => {
    const codePoint = parseCodePointNotation(notation);
    return codePoint === undefined ? [] : [[name, codePoint] as const];
  }),
);

function codePointOf(match: RegExpExecArray): number | undefined {
  const [, hexadecimal, decimal, name] = match;
  if (name !== undefined) return NAMED_REFERENCES.get(name);
  const codePoint =
    hexadecimal === undefined
      ? Number.parseInt(decimal ?? '', DECIMAL)
      : Number.parseInt(hexadecimal, HEXADECIMAL);
  return Number.isNaN(codePoint) || codePoint > MAX_CODE_POINT ? undefined : codePoint;
}

/** Numeric references, and the named ones for invisible characters; other names are not known here. */
export function findCharacterReferences(text: string): CharacterReference[] {
  const references: CharacterReference[] = [];
  for (const match of text.matchAll(CHARACTER_REFERENCE)) {
    const codePoint = codePointOf(match);
    if (codePoint !== undefined)
      references.push({ from: match.index, to: match.index + match[0].length, codePoint });
  }
  return references;
}

export function decodeCharacterReferences(text: string): string {
  let decoded = '';
  let copiedUpTo = 0;
  for (const reference of findCharacterReferences(text)) {
    decoded += text.slice(copiedUpTo, reference.from) + String.fromCodePoint(reference.codePoint);
    copiedUpTo = reference.to;
  }
  return decoded + text.slice(copiedUpTo);
}
