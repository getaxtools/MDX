import { createTranslator } from '@mdx/i18n';
import type { CodeHighlighter } from '@mdx/renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COPY_FEEDBACK_MS,
  enhanceCodeBlocks,
  HIGHLIGHT_BATCH_MS,
  type CodeBlockOptions,
} from './enhanceCodeBlocks';

const KEYWORD = {
  text: 'const',
  lightColor: '#d73a49',
  darkColor: '#f97583',
  isItalic: false,
  isBold: false,
};
const PLAIN = { text: ' x = 1;', isItalic: false, isBold: false };

function articleWith(html: string): HTMLElement {
  const article = document.createElement('article');
  article.innerHTML = html;
  return article;
}

function options(overrides: Partial<CodeBlockOptions> = {}): CodeBlockOptions {
  const highlighter: CodeHighlighter = {
    highlight: (_code, language) => Promise.resolve(language === 'ts' ? [[KEYWORD, PLAIN], []] : undefined),
  };
  return {
    highlighter,
    translator: createTranslator(),
    isStillShown: () => true,
    writeClipboard: () => Promise.resolve(),
    ...overrides,
  };
}

describe('enhanceCodeBlocks', () => {
  afterEach(() => vi.useRealTimers());

  it('colours tokens for both themes and keeps the code text unchanged', async () => {
    const article = articleWith('<pre><code class="language-ts">const x = 1;\n</code></pre>');

    await enhanceCodeBlocks(article, options());

    const code = article.querySelector('code');
    const keyword = code?.querySelector('span');
    expect(code?.textContent).toBe('const x = 1;\n');
    expect(keyword?.style.getPropertyValue('--code-light')).toBe('#d73a49');
    expect(keyword?.style.getPropertyValue('--code-dark')).toBe('#f97583');
  });

  it('leaves code in an unknown language as plain text', async () => {
    const article = articleWith('<pre><code class="language-cobol">MOVE A TO B</code></pre>');

    await enhanceCodeBlocks(article, options());

    expect(article.querySelector('code span')).toBeNull();
  });

  it('ignores a highlight that finishes after another document was shown', async () => {
    const article = articleWith('<pre><code class="language-ts">const x = 1;\n</code></pre>');
    let isShown = true;
    const highlighter: CodeHighlighter = {
      highlight: () => {
        isShown = false;
        return Promise.resolve([[KEYWORD, PLAIN]]);
      },
    };

    await enhanceCodeBlocks(article, options({ highlighter, isStillShown: () => isShown }));

    expect(article.querySelector('code span')).toBeNull();
  });

  it('copies the code with its copy button and confirms briefly', async () => {
    vi.useFakeTimers();
    const writeClipboard = vi.fn(() => Promise.resolve());
    const article = articleWith('<pre><code>npm install\n</code></pre>');
    await enhanceCodeBlocks(article, options({ writeClipboard }));
    const button = article.querySelector('button');

    button?.click();
    await vi.waitFor(() => expect(button?.textContent).toBe('Copied'));
    vi.advanceTimersByTime(COPY_FEEDBACK_MS);

    expect(writeClipboard).toHaveBeenCalledWith('npm install\n');
    expect(button?.getAttribute('aria-label')).toBe('Copy code');
    expect(button?.textContent).toBe('Copy');
  });

  it('says so when the code could not be copied', async () => {
    vi.useFakeTimers();
    const writeClipboard = () => Promise.reject(new Error('Document is not focused.'));
    const article = articleWith('<pre><code>npm install\n</code></pre>');
    await enhanceCodeBlocks(article, options({ writeClipboard }));
    const button = article.querySelector('button');

    button?.click();
    await vi.waitFor(() => expect(button?.textContent).toBe("Couldn't copy"));
    vi.advanceTimersByTime(COPY_FEEDBACK_MS);

    expect(button?.textContent).toBe('Copy');
  });

  it('puts highlighted code in place in batches, so a long document is laid out once per batch', async () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const article = articleWith('<pre><code class="language-ts">a</code></pre>'.repeat(6));
    const highlightedWhenAsked: number[] = [];
    const highlighter: CodeHighlighter = {
      highlight: () => {
        highlightedWhenAsked.push(article.querySelectorAll('code.highlighted').length);
        vi.advanceTimersByTime(HIGHLIGHT_BATCH_MS / 2);
        return Promise.resolve([[KEYWORD, PLAIN]]);
      },
    };

    await enhanceCodeBlocks(article, options({ highlighter }));

    expect(highlightedWhenAsked).toEqual([0, 0, 0, 3, 3, 3]);
    expect(article.querySelectorAll('code.highlighted')).toHaveLength(6);
  });

  it('keeps batches full when laying out the last batch takes longer than a batch', async () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const article = articleWith('<pre><code class="language-ts">a</code></pre>'.repeat(12));
    const highlightedWhenAsked: number[] = [];
    const highlighter: CodeHighlighter = {
      highlight: () => {
        const highlighted = article.querySelectorAll('code.highlighted').length;
        const wasJustLaidOut = highlighted !== (highlightedWhenAsked.at(-1) ?? 0);
        highlightedWhenAsked.push(highlighted);
        vi.advanceTimersByTime(wasJustLaidOut ? HIGHLIGHT_BATCH_MS * 4 : HIGHLIGHT_BATCH_MS / 5);
        return Promise.resolve([[KEYWORD, PLAIN]]);
      },
    };

    await enhanceCodeBlocks(article, options({ highlighter }));

    expect(highlightedWhenAsked).toEqual([0, 0, 0, 0, 0, 0, 6, 6, 6, 6, 6, 6]);
  });

  it('leaves a batch out when another document was shown before it was put in place', async () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const article = articleWith('<pre><code class="language-ts">a</code></pre>'.repeat(4));
    let isShown = true;
    let asked = 0;
    const highlighter: CodeHighlighter = {
      highlight: () => {
        asked += 1;
        if (asked === 4) isShown = false;
        vi.advanceTimersByTime(HIGHLIGHT_BATCH_MS / 2);
        return Promise.resolve([[KEYWORD, PLAIN]]);
      },
    };

    await enhanceCodeBlocks(article, options({ highlighter, isStillShown: () => isShown }));

    expect(article.querySelectorAll('code.highlighted')).toHaveLength(3);
  });

  it('adds only one copy button when run again on the same blocks', async () => {
    const article = articleWith('<pre><code>a</code></pre>');

    await enhanceCodeBlocks(article, options());
    await enhanceCodeBlocks(article, options());

    expect(article.querySelectorAll('button')).toHaveLength(1);
  });
});
