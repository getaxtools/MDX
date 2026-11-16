import { describe, expect, it } from 'vitest';
import { renderedFormulaAt } from './renderedFormulaAt';

function article(html: string): HTMLElement {
  const element = document.createElement('article');
  element.innerHTML = html;
  return element;
}

describe('renderedFormulaAt', () => {
  it('names the formula by its place in the document and its source', () => {
    const shown = article(
      '<p><span class="mdx-math-inline">a</span> and <span class="mdx-math-inline" aria-label="b^2"><b>typeset</b></span></p>' +
        '<div class="mdx-math-display">c</div>',
    );

    expect(renderedFormulaAt(shown.querySelector('b'), shown)).toEqual({ index: 1, source: 'b^2' });
    expect(renderedFormulaAt(shown.querySelector('div'), shown)).toEqual({ index: 2, source: 'c' });
  });

  it('is nothing away from a formula', () => {
    const shown = article('<p>text</p>');

    expect(renderedFormulaAt(shown.querySelector('p'), shown)).toBeUndefined();
  });
});
