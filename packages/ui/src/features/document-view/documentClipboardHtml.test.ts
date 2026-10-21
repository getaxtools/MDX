import { afterEach, describe, expect, it } from 'vitest';
import { documentClipboardHtml, documentExportHtml, documentPlainText } from './documentClipboardHtml';

function articleWith(html: string): HTMLElement {
  const article = document.createElement('article');
  article.innerHTML = html;
  document.body.append(article);
  return article;
}

function select(node: Node): Selection {
  const selection = globalThis.getSelection();
  if (!selection) throw new Error('jsdom has no selection');
  selection.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.addRange(range);
  return selection;
}

describe('documentClipboardHtml', () => {
  afterEach(() => {
    globalThis.getSelection()?.removeAllRanges();
    document.body.replaceChildren();
  });

  it('copies the whole document when nothing is selected', () => {
    const article = articleWith('<h1>Title</h1><p>Body with <strong>bold</strong></p>');

    expect(documentClipboardHtml(article, globalThis.getSelection())).toBe(
      '<h1>Title</h1><p>Body with <strong>bold</strong></p>',
    );
  });

  it('copies only the selected part of the document', () => {
    const article = articleWith('<h1>Title</h1><p id="body">Body with <strong>bold</strong></p>');
    const paragraph = article.querySelector('#body');
    if (!paragraph) throw new Error('missing paragraph');

    const html = documentClipboardHtml(article, select(paragraph));

    expect(html).toBe('Body with <strong>bold</strong>');
  });

  it('ignores a selection outside the document', () => {
    const article = articleWith('<p>Inside</p>');
    const outside = document.createElement('p');
    outside.textContent = 'Outside';
    document.body.append(outside);

    expect(documentClipboardHtml(article, select(outside))).toBe('<p>Inside</p>');
  });

  it('leaves out copy buttons, comments and the source line markers the app adds', () => {
    const article = articleWith(
      '<!----><pre data-source-line="3"><code class="language-js">let x;</code><button class="copy-code">Copy</button></pre>',
    );

    expect(documentClipboardHtml(article, null)).toBe('<pre><code class="language-js">let x;</code></pre>');
  });
});

describe('documentExportHtml', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('exports the whole document, keeping math as MathML only', () => {
    const article = articleWith(
      '<p>Area <span class="katex"><span class="katex-mathml"><math><mi>r</mi></math></span>' +
        '<span class="katex-html" aria-hidden="true">r</span></span></p><button>Copy</button>',
    );

    expect(documentExportHtml(article)).toBe(
      '<p>Area <span class="katex"><span class="katex-mathml"><math><mi>r</mi></math></span></span></p>',
    );
  });

  it('exports the text of the document', () => {
    const article = articleWith('<h1>Guide</h1><p>Body</p>');

    expect(documentPlainText(article)).toBe('GuideBody');
  });
});
