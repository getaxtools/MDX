import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ThemeTokenSheet } from './ThemeTokenSheet';

const UI_SOURCES = join(import.meta.dirname, '..');
const TOKENS = ThemeTokenSheet.parse(readFileSync(join(UI_SOURCES, 'tokens', 'tokens.css'), 'utf8'));
const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)';
const NO_PREFERENCE = '@media (prefers-reduced-motion: no-preference)';
const MOVING_PROPERTY =
  /\b(transform|translate|scale|rotate|top|left|right|bottom|width|height|inset[a-z-]*)\b/;
const MOTION_TOKEN = 'var(--motion-';

interface CssSegment {
  readonly openBlocks: readonly string[];
  readonly text: string;
}

function motionTokensOf(tokens: ReadonlyMap<string, string>): Map<string, string> {
  return new Map([...tokens].filter(([name]) => name.startsWith('--motion-')));
}

function segmentsOf(css: string): CssSegment[] {
  const segments: CssSegment[] = [];
  const openBlocks: string[] = [];
  for (const [, text = '', brace] of css.replaceAll(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)([{}])/g)) {
    if (brace === '{') {
      openBlocks.push(text.trim());
      continue;
    }
    segments.push({ openBlocks: [...openBlocks], text });
    openBlocks.pop();
  }
  return segments;
}

function movingKeyframesOf(segments: readonly CssSegment[]): Set<string> {
  return new Set(
    segments
      .filter(({ text }) => MOVING_PROPERTY.test(text))
      .flatMap(({ openBlocks }) => openBlocks.filter((block) => block.startsWith('@keyframes')))
      .map((block) => block.replace('@keyframes', '').trim()),
  );
}

function movesOnMotionToken(declaration: string, movingKeyframes: ReadonlySet<string>): boolean {
  const [property = '', ...rest] = declaration.split(':');
  const value = rest.join(':');
  if (!value.includes(MOTION_TOKEN)) return false;
  if (property.trim() === 'transition') return MOVING_PROPERTY.test(value);
  if (property.trim() !== 'animation') return false;
  return value.split(/[\s,]+/).some((word) => movingKeyframes.has(word));
}

function unguardedMovesIn(css: string): string[] {
  const segments = segmentsOf(css);
  const movingKeyframes = movingKeyframesOf(segments);
  return segments
    .filter(({ openBlocks }) => !openBlocks.includes(NO_PREFERENCE))
    .flatMap(({ text }) => text.split(';'))
    .filter((declaration) => movesOnMotionToken(declaration, movingKeyframes))
    .map((declaration) => declaration.trim());
}

function styledFilesUnder(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.(svelte|css)$/.test(path))
    .map((path) => join(folder, path));
}

describe('motion', () => {
  it('the motion scale is 120, 200 and 320 ms', () => {
    expect(Object.fromEntries(motionTokensOf(TOKENS.tokensOf('light')))).toEqual({
      '--motion-fast': '120ms',
      '--motion-medium': '200ms',
      '--motion-slow': '320ms',
    });
  });

  it('reduced motion keeps a fade and no transform: every speed becomes a 120 ms fade', () => {
    const reduced = motionTokensOf(TOKENS.declarationsFor(REDUCED_MOTION, [':root']));

    expect(Object.fromEntries(reduced)).toEqual({
      '--motion-fast': '120ms',
      '--motion-medium': '120ms',
      '--motion-slow': '120ms',
    });
  });

  it('reduced motion keeps a fade and no transform: only fades run on a motion speed unless motion is allowed', () => {
    const unguarded = styledFilesUnder(UI_SOURCES).flatMap((file) =>
      unguardedMovesIn(readFileSync(file, 'utf8')).map((move) => `${relative(UI_SOURCES, file)}: ${move}`),
    );

    expect(unguarded).toEqual([]);
  });

  it('finds a move left outside no-preference and accepts one inside it', () => {
    const css = `
      .open { animation: rise-in var(--motion-fast) ease; }
      .grow { transition: height var(--motion-fast) ease-out, color var(--motion-fast); }
      .tint { transition: background-color var(--motion-fast) ease-out; }
      @media (prefers-reduced-motion: no-preference) { .slide { transition: translate var(--motion-fast); } }
      @keyframes rise-in { from { opacity: 0; transform: scale(0.98); } }
    `;

    expect(unguardedMovesIn(css)).toEqual([
      'animation: rise-in var(--motion-fast) ease',
      'transition: height var(--motion-fast) ease-out, color var(--motion-fast)',
    ]);
  });
});
