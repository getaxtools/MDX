import { describe, expect, it } from 'vitest';
import { ThemeTokenSheet } from './ThemeTokenSheet';

const SHEET = ThemeTokenSheet.parse(`
  /* --color-text: #ff0000; a comment is not a token */
  :root {
    --color-text: #111111;
    --color-surface: #ffffff;
    --font-body: 'Segoe UI', system-ui;
    --image-empty: url('data:image/svg+xml,x');
  }
  :root[data-color-scheme='dark'] {
    --color-text: #eeeeee;
    --color-surface: #1e1e1e;
  }
  :root[data-theme='sepia'] {
    --color-surface: #f4ecd8;
  }
  :root[data-theme='nord'],
  :root[data-theme='solarizedDark'] {
    --color-surface: #2e3440;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-color-scheme]) {
      --color-text: #dddddd;
    }
  }
  @media (forced-colors: active) {
    :root {
      --color-text: CanvasText;
    }
  }
`);

describe('ThemeTokenSheet', () => {
  it('gives a light theme the base tokens with its own on top', () => {
    const sepia = SHEET.tokensOf('sepia');

    expect(sepia.get('--color-text')).toBe('#111111');
    expect(sepia.get('--color-surface')).toBe('#f4ecd8');
  });

  it('gives a dark theme the dark base under its own tokens', () => {
    expect(SHEET.tokensOf('dark').get('--color-text')).toBe('#eeeeee');
    expect(SHEET.tokensOf('nord').get('--color-text')).toBe('#eeeeee');
    expect(SHEET.tokensOf('nord').get('--color-surface')).toBe('#2e3440');
  });

  it('leaves out tokens set only inside a media query or a comment', () => {
    expect(SHEET.tokensOf('light').get('--color-text')).toBe('#111111');
  });

  it('reads the rules inside a named media query', () => {
    const forcedColours = SHEET.declarationsFor('@media (forced-colors: active)', [':root']);

    expect(forcedColours.get('--color-text')).toBe('CanvasText');
  });

  it('keeps a value that holds a colon or a comma whole', () => {
    expect(SHEET.tokenOf('light', '--font-body')).toBe("'Segoe UI', system-ui");
    expect(SHEET.tokenOf('light', '--image-empty')).toBe("url('data:image/svg+xml,x')");
  });

  it('says which token a theme lacks', () => {
    expect(() => SHEET.tokenOf('light', '--color-accent')).toThrow('light has no --color-accent');
  });
});
