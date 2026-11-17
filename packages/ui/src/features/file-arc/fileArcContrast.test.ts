import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileArcLayout, THEME_COLOR_SCHEMES, type ThemePreference } from '@mdx/core';
import { describe, expect, it } from 'vitest';
import { KIND_COLOUR_TOKENS } from '../control-wheel/kindPresentation';

type AppTheme = Exclude<ThemePreference, 'system'>;
type Rgb = readonly [number, number, number];

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];
const MIN_TEXT_CONTRAST = 4.5;
const MIN_GRAPHIC_CONTRAST = 3;
/** The app theme whose surfaces are always drawn opaque. */
const OPAQUE_SURFACE_THEME: AppTheme = 'highContrast';
const APP_THEMES = Object.keys(THEME_COLOR_SCHEMES) as AppTheme[];
const TOKENS_CSS = readFileSync(join(import.meta.dirname, '..', '..', 'tokens', 'tokens.css'), 'utf8')
  .replaceAll(/\/\*[\s\S]*?\*\//g, '')
  .replaceAll(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '');
const ARC_SOURCE = readFileSync(join(import.meta.dirname, 'FileArc.svelte'), 'utf8');

/** The custom properties a theme ends up with: the light base, the dark base for dark themes, then its own. */
function tokensOf(theme: AppTheme): Map<string, string> {
  const selectors = [':root'];
  if (THEME_COLOR_SCHEMES[theme] === 'dark') selectors.push(":root[data-color-scheme='dark']");
  selectors.push(`:root[data-theme='${theme}']`);
  const tokens = new Map<string, string>();
  for (const [, prelude = '', body = ''] of TOKENS_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!prelude.split(',').some((part) => selectors.includes(part.trim()))) continue;
    for (const [, name = '', value = ''] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g))
      tokens.set(name, value.trim());
  }
  return tokens;
}

function rgbOf(value: string | undefined): Rgb {
  const digits = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value ?? '');
  if (!digits) throw new Error(`not a hex colour: ${String(value)}`);
  return [1, 2, 3].map((group) => Number.parseInt(digits[group] ?? '', 16)) as unknown as Rgb;
}

function laidOver(colour: Rgb, opacity: number, backdrop: Rgb): Rgb {
  return colour.map(
    (channel, index) => channel * opacity + (backdrop[index] ?? 0) * (1 - opacity),
  ) as unknown as Rgb;
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const luminance = (rgb: Rgb) => {
    const [red = 0, green = 0, blue = 0] = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [lighter = 0, darker = 0] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The dial as it looks over pure black and pure white content. */
function dialsOf(theme: AppTheme): Rgb[] {
  const tokens = tokensOf(theme);
  const opacity =
    theme === OPAQUE_SURFACE_THEME ? 1 : Number.parseFloat(tokens.get('--wheel-surface-opacity') ?? '') / 100;
  return [BLACK, WHITE].map((backdrop) =>
    laidOver(rgbOf(tokens.get('--color-wheel-surface')), opacity, backdrop),
  );
}

describe('file arc contrast', () => {
  it('draws names, details and the hint only in the text colour, and marks with the kind colour', () => {
    const colours = [...ARC_SOURCE.matchAll(/[\s;{]color: var\((--[\w-]+)\)/g)].map((match) => match[1]);

    expect(new Set(colours)).toEqual(new Set(['--color-text', '--kind']));
  });

  it('names stay readable over a white page in the dark theme', () => {
    const text = rgbOf(tokensOf('dark').get('--color-text'));

    for (const dial of dialsOf('dark'))
      expect(contrastRatio(text, dial)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it('keeps names, details and the hint at 4.5:1 over black and white content in every app theme', () => {
    for (const theme of APP_THEMES) {
      const text = rgbOf(tokensOf(theme).get('--color-text'));
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
      const text = rgbOf(tokensOf(theme).get('--color-text'));
      for (const dial of dialsOf(theme))
        expect(contrastRatio(laidOver(text, faintest, dial), dial), theme).toBeGreaterThanOrEqual(
          MIN_TEXT_CONTRAST,
        );
    }
  });

  it('keeps the kind colour of the outline and icon at 3:1 on the card in every app theme', () => {
    for (const theme of APP_THEMES) {
      const tokens = tokensOf(theme);
      const card = rgbOf(tokens.get('--color-wheel-tile'));
      for (const kindToken of Object.values(KIND_COLOUR_TOKENS)) {
        const kind = rgbOf(tokens.get(kindToken));
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
