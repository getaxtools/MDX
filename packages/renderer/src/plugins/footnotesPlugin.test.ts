import fc from 'fast-check';
import MarkdownIt, { type MarkdownIt as MarkdownParser } from 'markdown-it';
import footnotes from 'markdown-it-footnote';
import { describe, expect, it } from 'vitest';
import { footnotesPlugin } from './footnotesPlugin';

const PROPERTY_TEST_TIMEOUT_MS = 30_000;
const MANY_FOOTNOTES = 20_000;
/** Far above what appending in place takes, far below what copying the token list each time took. */
const MANY_FOOTNOTES_BUDGET_MS = 5_000;

const withPluginRule = new MarkdownIt().use(footnotes);
const withOwnRule = new MarkdownIt().use(footnotesPlugin);

function tokensOf(markdown: MarkdownParser, source: string): string {
  return JSON.stringify(markdown.parse(source, {}));
}

const blockOf = fc.constantFrom(
  'A claim.[^a]',
  'Two claims.[^a] [^b]',
  'An inline note.^[Written in place.]',
  '[^a]: The first note.',
  '[^b]: The second note\n\n    with a second paragraph.',
  '[^c]: A note nobody refers to.',
  '[^a]: The first note, defined again.',
  '- A list with a note.[^b]',
  '> A quote with a note.[^c]',
  'Plain text.',
);

describe('footnotesPlugin', () => {
  it(
    'gives the same tokens as the footnote plugin itself',
    () => {
      fc.assert(
        fc.property(fc.array(blockOf, { maxLength: 12 }), (blocks) => {
          const source = blocks.join('\n\n');

          expect(tokensOf(withOwnRule, source)).toBe(tokensOf(withPluginRule, source));
        }),
      );
    },
    PROPERTY_TEST_TIMEOUT_MS,
  );

  it('moves thousands of footnotes to the end quickly', () => {
    const notes = Array.from(
      { length: MANY_FOOTNOTES },
      (_, index) => `Claim ${String(index)}.[^${String(index)}]`,
    );
    const definitions = notes.map((_, index) => `[^${String(index)}]: Note ${String(index)}.`);
    const startedAt = performance.now();

    const tokens = withOwnRule.parse([...notes, ...definitions].join('\n\n'), {});

    expect(performance.now() - startedAt).toBeLessThan(MANY_FOOTNOTES_BUDGET_MS);
    expect(tokens.filter((token) => token.type === 'footnote_open')).toHaveLength(MANY_FOOTNOTES);
  });
});
