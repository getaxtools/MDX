import { afterEach, describe, expect, it } from 'vitest';
import { findLinkedHeading } from './findLinkedHeading';

function showDocument(articleHtml: string, outsideHtml = ''): HTMLElement {
  document.body.innerHTML = `${outsideHtml}<article>${articleHtml}</article>`;
  const article = document.querySelector('article');
  if (!article) throw new Error('article missing');
  return article;
}

describe('findLinkedHeading', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('finds a heading from a GitHub-style fragment without the prefix', () => {
    const article = showDocument('<h2 id="mdx-install">Install</h2>');

    expect(findLinkedHeading(article, 'install')?.textContent).toBe('Install');
  });

  it('still finds a heading from a fragment that has the prefix', () => {
    const article = showDocument('<h2 id="mdx-install">Install</h2>');

    expect(findLinkedHeading(article, 'mdx-install')?.textContent).toBe('Install');
  });

  it('decodes percent-encoded fragments such as non-Latin headings', () => {
    const article = showDocument('<h1 id="mdx-नमस्ते">नमस्ते</h1>');

    expect(findLinkedHeading(article, encodeURIComponent('नमस्ते'))?.textContent).toBe('नमस्ते');
  });

  it('matches a fragment written with capital letters', () => {
    const article = showDocument('<h2 id="mdx-getting-started">Getting started</h2>');

    expect(findLinkedHeading(article, 'Getting-Started')?.textContent).toBe('Getting started');
  });

  it('keeps a malformed fragment as written instead of failing', () => {
    const article = showDocument('<h2 id="mdx-100%">100%</h2>');

    expect(findLinkedHeading(article, '100%')?.textContent).toBe('100%');
  });

  it('finds nothing for an unknown fragment', () => {
    const article = showDocument('<h2 id="mdx-install">Install</h2>');

    expect(findLinkedHeading(article, 'missing')).toBeUndefined();
  });

  it('never jumps to an element of the app outside the document', () => {
    const article = showDocument('<p>text</p>', '<h2 id="mdx-outline">Outline</h2>');

    expect(findLinkedHeading(article, 'outline')).toBeUndefined();
  });
});
