import { createTranslator } from '@mdx/i18n';
import type { CodeHighlighter } from '@mdx/renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COPY_FEEDBACK_MS, enhanceCodeBlocks, type CodeBlockOptions } from './enhanceCodeBlocks';

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

  it('adds only one copy button when run again on the same blocks', async () => {
    const article = articleWith('<pre><code>a</code></pre>');

    await enhanceCodeBlocks(article, options());
    await enhanceCodeBlocks(article, options());

    expect(article.querySelectorAll('button')).toHaveLength(1);
  });
});
