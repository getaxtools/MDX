import type { CodePointSet } from '../CodePointSet';
import { decodePunycodeLabel } from './decodePunycode';

type ScriptName =
  'Latin' | 'Cyrillic' | 'Greek' | 'Armenian' | 'Han' | 'Hiragana' | 'Katakana' | 'Hangul' | 'Bopomofo';

const KNOWN_SCRIPTS: readonly ScriptName[] = [
  'Latin',
  'Cyrillic',
  'Greek',
  'Armenian',
  'Han',
  'Hiragana',
  'Katakana',
  'Hangul',
  'Bopomofo',
];
const SCRIPT_PATTERNS: ReadonlyMap<ScriptName, RegExp> = new Map(
  KNOWN_SCRIPTS.map((script) => [script, new RegExp(`^\\p{Script=${script}}$`, 'u')]),
);
const LETTER = /^\p{L}$/u;
const OTHER_SCRIPT = 'Other';
// Mixing these with Latin is how Japanese, Chinese and Korean are normally written (UTS #39, highly restrictive).
const ALLOWED_MIXES: readonly (readonly string[])[] = [
  ['Latin', 'Han', 'Hiragana', 'Katakana'],
  ['Latin', 'Han', 'Bopomofo'],
  ['Latin', 'Han', 'Hangul'],
];
const CONFUSABLE_SCRIPTS = new Set(['Cyrillic', 'Greek', 'Armenian']);

function scriptOf(letter: string): string {
  for (const [script, pattern] of SCRIPT_PATTERNS) if (pattern.test(letter)) return script;
  return OTHER_SCRIPT;
}

function isAllowedMix(scripts: ReadonlySet<string>): boolean {
  return (
    scripts.size <= 1 || ALLOWED_MIXES.some((mix) => [...scripts].every((script) => mix.includes(script)))
  );
}

/** A label that mixes scripts, or that uses only Cyrillic, Greek or Armenian letters that imitate Latin ones. */
export function isDeceptiveLabel(label: string, latinLookalikes: CodePointSet): boolean {
  const letters = Array.from(decodePunycodeLabel(label) ?? label).filter((character) =>
    LETTER.test(character),
  );
  const scripts = new Set(letters.map(scriptOf));
  if (!isAllowedMix(scripts)) return true;
  const [onlyScript] = scripts;
  return (
    onlyScript !== undefined &&
    CONFUSABLE_SCRIPTS.has(onlyScript) &&
    letters.every((letter) => latinLookalikes.has(letter.codePointAt(0) ?? 0))
  );
}

export function isDeceptiveHost(writtenHost: string, latinLookalikes: CodePointSet): boolean {
  return writtenHost
    .toLowerCase()
    .split('.')
    .some((label) => isDeceptiveLabel(label, latinLookalikes));
}
