import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio, rgbOf } from './contrastRatio';
import { APP_THEMES, ThemeTokenSheet } from './ThemeTokenSheet';

const TOKENS = ThemeTokenSheet.parse(readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8'));
const PRIMARY_FILLS = ['--color-accent', '--color-accent-hover', '--color-accent-pressed'];
const MIN_PRIMARY_TEXT_CONTRAST = 7;
const ACCENT_TOKENS = ['--color-accent-text', ...PRIMARY_FILLS];

describe('accent fills', () => {
  it('primary text passes in every theme: it reaches 7:1 on every fill', () => {
    const shortfalls = APP_THEMES.flatMap((theme) => {
      const text = rgbOf(TOKENS.tokenOf(theme, '--color-accent-text'));
      return PRIMARY_FILLS.map((fill) => ({
        theme,
        fill,
        ratio: contrastRatio(text, rgbOf(TOKENS.tokenOf(theme, fill))),
      })).filter(({ ratio }) => ratio < MIN_PRIMARY_TEXT_CONTRAST);
    });

    expect(shortfalls).toEqual([]);
  });

  it('gives the system dark theme the same accent as the dark theme', () => {
    const systemDark = TOKENS.declarationsFor('@media (prefers-color-scheme: dark)', [
      ':root:not([data-color-scheme])',
    ]);

    for (const token of ACCENT_TOKENS) {
      expect(systemDark.get(token), token).toBe(TOKENS.tokenOf('dark', token));
    }
  });
});
