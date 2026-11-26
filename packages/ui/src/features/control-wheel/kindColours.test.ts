import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORKSPACE_KINDS } from '@mdx/core';
import { describe, expect, it } from 'vitest';
import { BLACK, contrastRatio, laidOver, rgbOf, WHITE, type Rgb } from '../../tokens/contrastRatio';
import { APP_THEMES, ThemeTokenSheet, type AppTheme } from '../../tokens/ThemeTokenSheet';
import { KIND_COLOUR_TOKENS, KIND_COLOURS } from './kindPresentation';
import { RIM_RADIUS, RIM_WIDTH, RING_RADII } from './wheelDimensions';

const LIT_TILE_TINT = 0.16;
const ACTIVE_TILE_TINT = 0.1;
const MIN_GRAPHIC_CONTRAST = 3;
const MIN_TEXT_CONTRAST = 4.5;
const MIN_SURFACE_OPACITY = 0.9;
/** The app theme whose wheel surface is always drawn opaque. */
const OPAQUE_SURFACE_THEME: AppTheme = 'highContrast';
const SYSTEM_COLOURS = new Set([
  'Canvas',
  'CanvasText',
  'Highlight',
  'HighlightText',
  'ButtonText',
  'GrayText',
]);

const TOKENS = ThemeTokenSheet.parse(
  readFileSync(join(import.meta.dirname, '..', '..', 'tokens', 'tokens.css'), 'utf8'),
);
const CAPTION_SOURCE = readFileSync(join(import.meta.dirname, 'WheelCaption.svelte'), 'utf8');
/** Segments are drawn opaque, so what lies behind the wheel never shows through them. */
const TILE_OPACITY = 1;

function surfaceOpacityOf(theme: AppTheme): number {
  if (theme === OPAQUE_SURFACE_THEME) return 1;
  return Number.parseFloat(TOKENS.tokenOf(theme, '--wheel-surface-opacity')) / 100;
}

/** The colour token a rule in the caption's stylesheet uses for its text. */
function captionColourTokenOf(selector: string): string {
  const escapedSelector = selector.replaceAll('.', String.raw`\.`);
  const pattern = new RegExp(
    String.raw`(?:^|\s)${escapedSelector} \{[^}]*?[\s;]color: var\((--[\w-]+)\)`,
    'm',
  );
  const token = pattern.exec(CAPTION_SOURCE)?.[1];
  if (!token) throw new Error(`The caption's ${selector} has no colour token`);
  return token;
}

/** The wheel surface as it looks over black and over white content. */
function surfacesOverBlackAndWhite(theme: AppTheme): Rgb[] {
  const surface = rgbOf(TOKENS.tokenOf(theme, '--color-wheel-surface'));
  return [BLACK, WHITE].map((backdrop) => laidOver(surface, surfaceOpacityOf(theme), backdrop));
}

describe('kind colours', () => {
  it('gives every kind a colour for light and dark themes', () => {
    for (const kind of WORKSPACE_KINDS) {
      expect(KIND_COLOURS[kind.id].light).toMatch(/^#[\da-f]{6}$/);
      expect(KIND_COLOURS[kind.id].dark).toMatch(/^#[\da-f]{6}$/);
    }
  });

  it('never gives two kinds the same colour', () => {
    for (const theme of APP_THEMES) {
      const colours = WORKSPACE_KINDS.map((kind) =>
        TOKENS.tokenOf(theme, KIND_COLOUR_TOKENS[kind.id]).toLowerCase(),
      );

      expect(new Set(colours).size).toBe(WORKSPACE_KINDS.length);
    }
  });

  it('exposes the kind colours as tokens in light and dark themes', () => {
    const systemDark = TOKENS.declarationsFor('@media (prefers-color-scheme: dark)', [
      ':root:not([data-color-scheme])',
    ]);

    for (const kind of WORKSPACE_KINDS) {
      const token = KIND_COLOUR_TOKENS[kind.id];
      expect(TOKENS.tokenOf('light', token)).toBe(KIND_COLOURS[kind.id].light);
      expect(TOKENS.tokenOf('dark', token)).toBe(KIND_COLOURS[kind.id].dark);
      expect(systemDark.get(token)).toBe(KIND_COLOURS[kind.id].dark);
    }
  });

  it('keeps every kind icon at 3:1 or more on its segment, lit or not, in every app theme', () => {
    for (const theme of APP_THEMES) {
      const tile = rgbOf(TOKENS.tokenOf(theme, '--color-wheel-tile'));
      for (const kind of WORKSPACE_KINDS) {
        const colour = rgbOf(TOKENS.tokenOf(theme, KIND_COLOUR_TOKENS[kind.id]));
        const tiles = [tile, laidOver(colour, LIT_TILE_TINT, tile), laidOver(colour, ACTIVE_TILE_TINT, tile)];

        for (const background of tiles)
          expect(contrastRatio(colour, background), `${kind.id} in ${theme}`).toBeGreaterThanOrEqual(
            MIN_GRAPHIC_CONTRAST,
          );
      }
    }
  });

  it('keeps kind names at 4.5:1 or more on the caption surface over black and white in every app theme', () => {
    for (const theme of APP_THEMES) {
      const text = rgbOf(TOKENS.tokenOf(theme, '--color-text'));

      for (const surface of surfacesOverBlackAndWhite(theme))
        expect(contrastRatio(text, surface), theme).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it('keeps kind descriptions at 4.5:1 or more on the caption surface over black and white in every app theme', () => {
    const descriptionToken = captionColourTokenOf('.description');

    for (const theme of APP_THEMES) {
      const description = rgbOf(TOKENS.tokenOf(theme, descriptionToken));

      for (const surface of surfacesOverBlackAndWhite(theme))
        expect(contrastRatio(description, surface), theme).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it('keeps the number key cap at 4.5:1 or more on the caption surface over black and white in every app theme', () => {
    const keyCapToken = captionColourTokenOf('kbd');

    for (const theme of APP_THEMES) {
      const keyCap = rgbOf(TOKENS.tokenOf(theme, keyCapToken));

      for (const surface of surfacesOverBlackAndWhite(theme))
        expect(contrastRatio(keyCap, surface), theme).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it('draws the rim arc inside the opaque tile', () => {
    expect(RIM_RADIUS + RIM_WIDTH / 2).toBeLessThanOrEqual(RING_RADII.outer);
    expect(RIM_RADIUS - RIM_WIDTH / 2).toBeGreaterThan(RING_RADII.inner);
  });

  it('keeps every kind colour at 3:1 or more where the rim is drawn, over black and white, in every app theme', () => {
    for (const theme of APP_THEMES) {
      const tile = rgbOf(TOKENS.tokenOf(theme, '--color-wheel-tile'));
      for (const kind of WORKSPACE_KINDS) {
        const colour = rgbOf(TOKENS.tokenOf(theme, KIND_COLOUR_TOKENS[kind.id]));
        const activeTiles = [laidOver(colour, ACTIVE_TILE_TINT, tile), laidOver(colour, LIT_TILE_TINT, tile)];
        const rimBackgrounds = activeTiles.flatMap((activeTile) =>
          [BLACK, WHITE].map((backdrop) => laidOver(activeTile, TILE_OPACITY, backdrop)),
        );

        for (const background of rimBackgrounds)
          expect(contrastRatio(colour, background), `${kind.id} in ${theme}`).toBeGreaterThanOrEqual(
            MIN_GRAPHIC_CONTRAST,
          );
      }
    }
  });

  it('keeps the wheel surface at least 90% opaque in every app theme', () => {
    for (const theme of APP_THEMES)
      expect(surfaceOpacityOf(theme)).toBeGreaterThanOrEqual(MIN_SURFACE_OPACITY);
  });

  it('gives way to system colours in a contrast theme', () => {
    const forcedColours = TOKENS.declarationsFor('@media (forced-colors: active)', [':root']);

    for (const kind of WORKSPACE_KINDS)
      expect(SYSTEM_COLOURS.has(forcedColours.get(KIND_COLOUR_TOKENS[kind.id]) ?? '')).toBe(true);
    expect(forcedColours.get('--color-wheel-surface')).toBe('Canvas');
    expect(forcedColours.get('--shadow-wheel')).toBe('none');
  });
});
