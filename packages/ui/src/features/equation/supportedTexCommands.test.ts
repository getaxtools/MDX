import { commandExample, matchingCommands } from '@mdx/editor';
import { createRichBlockRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_TEX_COMMANDS } from './supportedTexCommands';

/** Typesetting and sanitizing every command takes several seconds in jsdom. */
const WHOLE_LIST_TIMEOUT_MS = 60_000;

describe('supported TeX commands', () => {
  it('a backslash and fr suggest frac first', () => {
    expect(matchingCommands(SUPPORTED_TEX_COMMANDS, 'fr')[0]?.name).toBe('frac');
  });

  it(
    'every listed command typesets with the preview options',
    async () => {
      const renderer = createRichBlockRenderer({ window });

      const failing: string[] = [];
      for (const command of SUPPORTED_TEX_COMMANDS) {
        const preview = await renderer.previewFormula(commandExample(command), false);
        if (preview.kind !== 'typeset' || preview.html.includes('#cc0000')) failing.push(command.name);
      }

      expect(SUPPORTED_TEX_COMMANDS.length).toBeGreaterThan(800);
      expect(failing).toEqual([]);
    },
    WHOLE_LIST_TIMEOUT_MS,
  );

  it('commands that would link, run or define nothing typeset are not listed', () => {
    const names = new Set(SUPPORTED_TEX_COMMANDS.map(({ name }) => name));

    expect(
      ['href', 'url', 'includegraphics', 'htmlClass', 'def', 'message'].filter((name) => names.has(name)),
    ).toEqual([]);
  });
});
