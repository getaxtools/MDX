import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ThemeTokenSheet } from './ThemeTokenSheet';

const TOKENS = ThemeTokenSheet.parse(readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8')).tokensOf(
  'light',
);
const TOOLBAR_STYLES = readFileSync(
  join(import.meta.dirname, '..', 'features/view/DocumentToolbar.svelte'),
  'utf8',
);
const VIEW_OPTIONS_STYLES = readFileSync(
  join(import.meta.dirname, '..', 'features/view/ViewOptions.svelte'),
  'utf8',
);

function pixelsOf(token: string): number {
  const value = (TOKENS.get(token) ?? '').replaceAll(
    /var\((--[\w-]+)\)/g,
    (_, name: string) => `${String(pixelsOf(name))}px`,
  );
  const difference = /^calc\((\d+)px - (\d+)px\)$/.exec(value);
  if (difference) return Number(difference[1]) - Number(difference[2]);
  const pixels = /^(\d+)px$/.exec(value);
  if (!pixels) throw new Error(`${token} is not a pixel length: ${value}`);
  return Number(pixels[1]);
}

function declarationsOf(selector: string, styles = TOOLBAR_STYLES, indentation = '  '): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\n${indentation}${escaped} \\{([^}]*)\\}`).exec(styles)?.[1] ?? '';
}

function forcedColorsStyles(): string {
  return /@media \(forced-colors: active\) \{([\s\S]*?)\n {2}\}/.exec(TOOLBAR_STYLES)?.[1] ?? '';
}

describe('island shape', () => {
  it('nested corner follows the island: an island with radius 12 and padding 4 draws its buttons with radius 8', () => {
    expect(pixelsOf('--island-radius')).toBe(12);
    expect(pixelsOf('--island-padding')).toBe(4);

    expect(pixelsOf('--island-button-radius')).toBe(8);
  });

  it('holds 32 px buttons', () => {
    expect(pixelsOf('--island-button-size')).toBe(32);
  });

  it('the document toolbar draws its islands and their buttons from the island tokens', () => {
    const island = declarationsOf('.island');
    const button = declarationsOf('button');

    expect(island).toMatch(/border-radius: var\(--island-radius\);/);
    expect(island).toMatch(/padding: var\(--island-padding\);/);
    expect(island).toMatch(/border: 1px solid var\(--color-border\);/);
    expect(button).toMatch(/border-radius: var\(--island-button-radius\);/);
    expect(button).toMatch(/height: var\(--island-button-size\);/);
  });

  it('the view options draw their menu buttons from the island tokens', () => {
    const menuButton = declarationsOf('button', VIEW_OPTIONS_STYLES);

    expect(menuButton).toMatch(/border-radius: var\(--island-button-radius\);/);
    expect(menuButton).toMatch(/height: var\(--island-button-size\);/);
  });

  it('pressed state not by colour alone: a pressed button changes its fill and its border, and in a contrast theme uses the system highlight', () => {
    const pressed = declarationsOf("button[aria-pressed='true']");
    const pressedInContrastTheme = declarationsOf(
      "button[aria-pressed='true'],\n    button[aria-pressed='true']:hover:not(:disabled)",
      forcedColorsStyles(),
      '    ',
    );

    expect(pressed).toMatch(/background: var\(--color-surface-selected\);/);
    expect(pressed).toMatch(/border-color: var\(--color-accent\);/);
    expect(pressedInContrastTheme).toMatch(/forced-color-adjust: none;/);
    expect(pressedInContrastTheme).toMatch(/background: Highlight;/);
    expect(pressedInContrastTheme).toMatch(/color: HighlightText;/);
  });

  it('in a contrast theme a pressed button keeps system colours when focused or disabled', () => {
    const focused = declarationsOf("button[aria-pressed='true']:focus-visible", forcedColorsStyles(), '    ');
    const disabled = declarationsOf("button[aria-pressed='true']:disabled", forcedColorsStyles(), '    ');

    expect(focused).toMatch(/outline-color: HighlightText;/);
    expect(disabled).toMatch(/border-color: GrayText;/);
    expect(disabled).toMatch(/background: Canvas;/);
    expect(disabled).toMatch(/color: GrayText;/);
  });
});
