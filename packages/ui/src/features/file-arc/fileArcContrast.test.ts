import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileArcLayout } from '@mdx/core';
import { describe, expect, it } from 'vitest';
import { BLACK, contrastRatio, laidOver, rgbOf, WHITE, type Rgb } from '../../tokens/contrastRatio';
import { APP_THEMES, ThemeTokenSheet, type AppTheme } from '../../tokens/ThemeTokenSheet';
import { KIND_COLOUR_TOKENS } from '../control-wheel/kindPresentation';

const MIN_TEXT_CONTRAST = 4.5;
const MIN_GRAPHIC_CONTRAST = 3;
/** The app theme whose surfaces are always drawn opaque. */
const OPAQUE_SURFACE_THEME: AppTheme = 'highContrast';
const TOKENS = ThemeTokenSheet.parse(
  readFileSync(join(import.meta.dirname, '..', '..', 'tokens', 'tokens.css'), 'utf8'),
);
const ARC_SOURCE = readFileSync(join(import.meta.dirname, 'FileArc.svelte'), 'utf8');

function colourOf(theme: AppTheme, token: string): Rgb {
  return rgbOf(TOKENS.tokenOf(theme, token));
}

/** The dial as it looks over pure black and pure white content. */
function dialsOf(theme: AppTheme): Rgb[] {
  const opacity =
    theme === OPAQUE_SURFACE_THEME
      ? 1
      : Number.parseFloat(TOKENS.tokenOf(theme, '--wheel-surface-opacity')) / 100;
  return [BLACK, WHITE].map((backdrop) =>
    laidOver(colourOf(theme, '--color-wheel-surface'), opacity, backdrop),
  );
}

describe('file arc contrast', () => {
  it('draws names, details and the hint only in the text colour, and marks with the kind colour', () => {
    const colours = [...ARC_SOURCE.matchAll(/[\s;{]color: var\((--[\w-]+)\)/g)].map((match) => match[1]);

    expect(new Set(colours)).toEqual(new Set(['--color-text', '--kind']));
  });

  it('names stay readable over a white page in the dark theme', () => {
    const text = colourOf('dark', '--color-text');

    for (const dial of dialsOf('dark'))
      expect(contrastRatio(text, dial)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it('keeps names, details and the hint at 4.5:1 over black and white content in every app theme', () => {
    for (const theme of APP_THEMES) {
      const text = colourOf(theme, '--color-text');
      for (const dial of dialsOf(theme))
        expect(contrastRatio(text, dial), theme).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it('keeps even the faintest name at 4.5:1 over black and white content in every app theme', () => {
    const { names } = fileArcLayout({
      listLength: 40,
      highlighted: 20,
      areaWidth: 1200,
      areaHeight: 900,
      direction: 'ltr',
    });
    const faintest = Math.min(...names.map((name) => name.opacity));

    for (const theme of APP_THEMES) {
      const text = colourOf(theme, '--color-text');
      for (const dial of dialsOf(theme))
        expect(contrastRatio(laidOver(text, faintest, dial), dial), theme).toBeGreaterThanOrEqual(
          MIN_TEXT_CONTRAST,
        );
    }
  });

  it('keeps the kind colour of the outline and icon at 3:1 on the card in every app theme', () => {
    for (const theme of APP_THEMES) {
      const card = colourOf(theme, '--color-wheel-tile');
      for (const kindToken of Object.values(KIND_COLOUR_TOKENS)) {
        const kind = colourOf(theme, kindToken);
        expect(contrastRatio(kind, card), `${kindToken} in ${theme}`).toBeGreaterThanOrEqual(
          MIN_GRAPHIC_CONTRAST,
        );
      }
    }
  });

  it('outlines the dots on the dial in the text colour, which keeps 3:1 where the kind colour may not', () => {
    expect(ARC_SOURCE).toMatch(/\.dot\.here \{[^}]*box-shadow: 0 0 0 1\.5px var\(--color-text\)/);
    expect(ARC_SOURCE).toMatch(/\.open-dot \{[^}]*box-shadow: 0 0 0 1px var\(--color-text\)/);
  });
});
