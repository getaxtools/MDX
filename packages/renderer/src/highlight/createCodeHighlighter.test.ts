import { describe, expect, it } from 'vitest';
import { createCodeHighlighter, MAX_HIGHLIGHTED_CODE_LENGTH } from './createCodeHighlighter';

const highlighter = createCodeHighlighter();

describe('createCodeHighlighter', () => {
  it('splits code into tokens with light and dark theme colours', async () => {
    const lines = await highlighter.highlight("const greeting = 'hello';", 'typescript');

    const keyword = lines?.[0]?.find((token) => token.text === 'const');

    expect(
      lines
        ?.flat()
        .map((token) => token.text)
        .join(''),
    ).toBe("const greeting = 'hello';");
    expect(keyword?.lightColor).toMatch(/^#[0-9a-f]{6}/i);
    expect(keyword?.darkColor).toMatch(/^#[0-9a-f]{6}/i);
    expect(keyword?.lightColor).not.toBe(keyword?.darkColor);
  });

  it('understands common language aliases', async () => {
    const lines = await highlighter.highlight('echo hi', 'sh');

    expect(lines?.[0]?.length).toBeGreaterThan(1);
  });

  it('keeps one entry per line', async () => {
    const lines = await highlighter.highlight('a = 1\nb = 2\n', 'python');

    expect(lines).toHaveLength(3);
  });

  it('leaves unknown languages and very large blocks unhighlighted', async () => {
    expect(await highlighter.highlight('text', 'not-a-language')).toBeUndefined();
    expect(
      await highlighter.highlight('x'.repeat(MAX_HIGHLIGHTED_CODE_LENGTH + 1), 'typescript'),
    ).toBeUndefined();
  });
});
