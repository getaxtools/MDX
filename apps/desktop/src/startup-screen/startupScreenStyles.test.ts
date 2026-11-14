import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const INDEX_HTML = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');
const STARTUP_STYLES = INDEX_HTML.slice(INDEX_HTML.indexOf('<style>'), INDEX_HTML.indexOf('</style>'));
const DESIGN_TOKENS = readFileSync(
  join(import.meta.dirname, ...['..', '..', '..', '..', 'packages', 'ui', 'src', 'tokens', 'tokens.css']),
  'utf8',
);
const LIGHT_BLOCK_START = ':root {';
const DARK_BLOCK_START = '@media (prefers-color-scheme: dark) {';

function blockAfter(styles: string, blockStart: string): string {
  const start = styles.indexOf(blockStart);
  return start === -1 ? '' : styles.slice(start, styles.indexOf('}', start));
}

function customPropertiesOf(block: string): Map<string, string> {
  const declarations = block.matchAll(/(--[\w-]+):\s*([^;]+);/g);
  return new Map(
    [...declarations].map(([, name = '', value = '']) => [name, value.replace(/\s+/g, ' ').trim()]),
  );
}

function differencesFromTokens(blockStart: string): string[] {
  const tokens = customPropertiesOf(blockAfter(DESIGN_TOKENS, blockStart));
  const copies = customPropertiesOf(blockAfter(STARTUP_STYLES, blockStart));
  return [...copies].filter(([name, value]) => tokens.get(name) !== value).map(([name]) => name);
}

describe('start-up screen styles', () => {
  it('copies the light design tokens exactly', () => {
    expect(customPropertiesOf(blockAfter(STARTUP_STYLES, LIGHT_BLOCK_START)).size).toBeGreaterThan(0);

    expect(differencesFromTokens(LIGHT_BLOCK_START)).toEqual([]);
  });

  it('copies the dark design tokens exactly', () => {
    expect(customPropertiesOf(blockAfter(STARTUP_STYLES, DARK_BLOCK_START)).size).toBeGreaterThan(0);

    expect(differencesFromTokens(DARK_BLOCK_START)).toEqual([]);
  });

  it('shows the screen at once when the page opens on it', () => {
    const openedOnScreen = blockAfter(STARTUP_STYLES, '.startup-screen:target .startup-screen-content {');

    expect(openedOnScreen).toContain('animation: none');
    expect(openedOnScreen).toContain('opacity: 1');
  });

  it('turns off every animation when reduced motion is asked for', () => {
    const reducedMotion = STARTUP_STYLES.slice(
      STARTUP_STYLES.indexOf('@media (prefers-reduced-motion: reduce)'),
    );

    expect(reducedMotion).toContain('.startup-screen-mark-arrow');
    expect(reducedMotion).toContain('.startup-screen-progress-fill::after');
    expect(reducedMotion).toContain('transition: none');
  });
});
