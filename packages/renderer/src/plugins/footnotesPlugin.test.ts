import fc from 'fast-check';
import MarkdownIt, { type MarkdownIt as MarkdownParser, type Token } from 'markdown-it';
import footnotes from 'markdown-it-footnote';
import { describe, expect, it } from 'vitest';
import { footnotesPlugin } from './footnotesPlugin';

const PROPERTY_TEST_TIMEOUT_MS = 30_000;
const LARGE_DOCUMENT_TIMEOUT_MS = 120_000;
const MANY_FOOTNOTES = 10_000;
/**
 * How many times longer the footnotes may take than the same text without them. Appending in place
 * stays near 2, copying the token list each time took more than 20. A ratio holds on a busy machine, a
 * time does not.
 */
const MAX_SLOWDOWN_OVER_PLAIN_TEXT = 10;

const withPluginRule = new MarkdownIt().use(footnotes);
const withOwnRule = new MarkdownIt().use(footnotesPlugin);

function tokensOf(markdown: MarkdownParser, source: string): string {
  return JSON.stringify(markdown.parse(source, {}));
}

function timedParse(source: string): { tokens: Token[]; ms: number } {
  const startedAt = performance.now();
  const tokens = withOwnRule.parse(source, {});
  return { tokens, ms: performance.now() - startedAt };
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

  it(
    'moves thousands of footnotes to the end quickly',
    () => {
      const claims = Array.from({ length: MANY_FOOTNOTES }, (_, index) => `Claim ${String(index)}.`);
      const notes = claims.map((_, index) => `Note ${String(index)}.`);
      const plainText = [...claims, ...notes].join('\n\n');
      const withFootnotes = [
        ...claims.map((claim, index) => `${claim}[^${String(index)}]`),
        ...notes.map((note, index) => `[^${String(index)}]: ${note}`),
      ].join('\n\n');
      timedParse(plainText);

      const plainTextParse = timedParse(plainText);
      const footnotesParse = timedParse(withFootnotes);

      expect(footnotesParse.ms / plainTextParse.ms).toBeLessThan(MAX_SLOWDOWN_OVER_PLAIN_TEXT);
      const footnoteOpens = footnotesParse.tokens.filter((token) => token.type === 'footnote_open');
      expect(footnoteOpens).toHaveLength(MANY_FOOTNOTES);
    },
    LARGE_DOCUMENT_TIMEOUT_MS,
  );
});
