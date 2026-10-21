import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';

export type PseudoStyle = 'accented' | 'rightToLeft';

const ACCENTED_LETTERS: Readonly<Record<string, string>> = {
  a: 'á',
  e: 'é',
  i: 'í',
  o: 'ó',
  u: 'ú',
  y: 'ý',
  c: 'ç',
  n: 'ñ',
  A: 'Å',
  E: 'É',
  I: 'Î',
  O: 'Ö',
  U: 'Û',
  C: 'Ç',
  N: 'Ñ',
};
const EXPANSION_RATIO = 0.4;
const EXPANSION_MARK = '~';
const RIGHT_TO_LEFT_OVERRIDE = '‮';
const POP_DIRECTIONAL_FORMATTING = '‬';

/** A fake translation of every message that keeps placeholders, plurals and selects working. */
export function pseudoLocalize<Key extends string>(
  catalog: Readonly<Record<Key, string>>,
  style: PseudoStyle,
): Record<Key, string> {
  const entries = Object.entries<string>(catalog).map(([key, message]) => [
    key,
    pseudoLocalizeMessage(message, style),
  ]);
  return Object.fromEntries(entries) as Record<Key, string>;
}

export function pseudoLocalizeMessage(message: string, style: PseudoStyle): string {
  if (style === 'rightToLeft') return `${RIGHT_TO_LEFT_OVERRIDE}${message}${POP_DIRECTIONAL_FORMATTING}`;
  const padding = EXPANSION_MARK.repeat(Math.ceil(message.length * EXPANSION_RATIO));
  return `[${accentedLiterals(message)}${padding}]`;
}

/** Accents only the plain text of a message, found by the parser, so its ICU syntax stays as it is. */
function accentedLiterals(message: string): string {
  const spans = literalSpansOf(parse(message, { captureLocation: true })).sort(
    (first, second) => second.start - first.start,
  );
  let accented = message;
  for (const { start, end } of spans) {
    accented = accented.slice(0, start) + accentedText(accented.slice(start, end)) + accented.slice(end);
  }
  return accented;
}

interface TextSpan {
  readonly start: number;
  readonly end: number;
}

function literalSpansOf(elements: readonly MessageFormatElement[]): TextSpan[] {
  return elements.flatMap((element): TextSpan[] => {
    if (element.type === TYPE.literal && element.location) {
      return [{ start: element.location.start.offset, end: element.location.end.offset }];
    }
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      return Object.values(element.options).flatMap((option) => literalSpansOf(option.value));
    }
    return [];
  });
}

function accentedText(text: string): string {
  return Array.from(text, (character) => ACCENTED_LETTERS[character] ?? character).join('');
}
