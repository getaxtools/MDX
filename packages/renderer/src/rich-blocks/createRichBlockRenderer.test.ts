import katex from 'katex';
import { describe, expect, it, vi } from 'vitest';
import { createMarkdownRenderer } from '../createMarkdownRenderer';
import { createRichBlockRenderer } from './createRichBlockRenderer';

const markdownRenderer = createMarkdownRenderer({ window });
const shown = { isStillShown: () => true };

function renderDocument(source: string): HTMLElement {
  const article = document.createElement('article');
  article.innerHTML = markdownRenderer.render(source).html;
  document.body.append(article);
  return article;
}

const withKatex = () => createRichBlockRenderer({ window, loadMathTypesetter: () => Promise.resolve(katex) });

describe('rich block renderer', () => {
  it('typesets inline and display math with KaTeX', async () => {
    const article = renderDocument('Inline $x^2$ and\n\n$$\n\\frac{a}{b}\n$$');

    await withKatex().renderInto(article, shown);

    expect(article.querySelector('.mdx-math-inline .katex')).not.toBeNull();
    expect(article.querySelector('.mdx-math-display .katex-display')).not.toBeNull();
    expect(article.querySelector('.mdx-math-inline')?.getAttribute('aria-label')).toBe('x^2');
  });

  it('never trusts commands that could link or run code', async () => {
    const article = renderDocument('$\\href{javascript:alert(1)}{click}$');

    await withKatex().renderInto(article, shown);

    expect(article.querySelector('a, [href], [xlink\\:href]')).toBeNull();
  });

  it('shows broken math as an error message instead of failing the document', async () => {
    const article = renderDocument('$\\frac{1}{$');

    await withKatex().renderInto(article, shown);

    expect(article.querySelector('.katex-error')).not.toBeNull();
  });

  it('typesets each formula once when asked again', async () => {
    const article = renderDocument('$x$');
    const renderer = withKatex();

    await renderer.renderInto(article, shown);
    await renderer.renderInto(article, shown);

    expect(article.querySelectorAll('.katex')).toHaveLength(1);
  });

  it('does not load KaTeX for a document without math', async () => {
    const loadMathTypesetter = vi.fn(() => Promise.resolve(katex));
    const renderer = createRichBlockRenderer({ window, loadMathTypesetter });

    await renderer.renderInto(renderDocument('# Plain\n\nNo maths, and a price of $5.'), shown);

    expect(loadMathTypesetter).not.toHaveBeenCalled();
  });

  it('keeps the readable source when KaTeX cannot load', async () => {
    const article = renderDocument('Math $x$');
    const renderer = createRichBlockRenderer({
      window,
      loadMathTypesetter: () => Promise.reject(new Error('blocked')),
    });

    await renderer.renderInto(article, shown);

    expect(article.querySelector('.mdx-math-inline')?.textContent).toBe('x');
  });

  it('stops when the document is no longer shown', async () => {
    const article = renderDocument('$x$');

    await withKatex().renderInto(article, { isStillShown: () => false });

    expect(article.querySelector('.katex')).toBeNull();
  });
});
