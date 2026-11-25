import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ThemeTokenSheet } from './ThemeTokenSheet';

const TOKENS = ThemeTokenSheet.parse(readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8'));
const PACKAGES = join(import.meta.dirname, '..', '..', '..');
const STYLED_SOURCES = /\.(svelte|css|ts)$/;
const RADIUS_TOKEN = /--radius-[\da-z]+/g;

const RADII = new Map([...TOKENS.tokensOf('light')].filter(([name]) => name.startsWith('--radius-')));

function sourceFilesUnder(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((path) => STYLED_SOURCES.test(path) && !path.endsWith('.test.ts'))
    .map((path) => join(folder, path));
}

describe('radius scale', () => {
  it('the radius scale is 4, 8, 12, 16, 24 and full', () => {
    expect([...RADII.values()]).toEqual(['4px', '8px', '12px', '16px', '24px', '9999px']);
  });

  it('names only radius tokens the scale defines', () => {
    const unknown = ['ui', 'editor'].flatMap((name) =>
      sourceFilesUnder(join(PACKAGES, name, 'src')).flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(RADIUS_TOKEN)]
          .map(([token]) => token)
          .filter((token) => !RADII.has(token))
          .map((token) => `${relative(PACKAGES, file)}: ${token}`),
      ),
    );

    expect(unknown).toEqual([]);
  });
});
