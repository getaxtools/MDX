import { describe, expect, it } from 'vitest';
import { standaloneDocumentHtml } from './standaloneDocumentHtml';

const DOCUMENT = {
  title: 'Guide <draft>.md',
  locale: 'hi',
  typography: 'book',
  bodyHtml: '<h1>Guide</h1>',
} as const;

function parsed(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('standaloneDocumentHtml', () => {
  it('wraps the document in a complete page with its language, title and typography', () => {
    const page = parsed(standaloneDocumentHtml(DOCUMENT, '.rendered-document { color: red; }'));

    expect(page.documentElement.lang).toBe('hi');
    expect(page.title).toBe('Guide <draft>.md');
    expect(page.querySelector('article.rendered-document')?.getAttribute('data-typography')).toBe('book');
    expect(page.querySelector('article h1')?.textContent).toBe('Guide');
    expect(page.querySelector('style')?.textContent).toContain('color: red');
  });

  it('forbids scripts and network requests in the exported file', () => {
    const page = parsed(standaloneDocumentHtml(DOCUMENT, ''));
    const policy = page.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content');

    expect(policy).toContain("default-src 'none'");
    expect(policy).not.toContain('script-src');
  });

  it('cannot be broken out of by the styles or the title', () => {
    const html = standaloneDocumentHtml(
      { ...DOCUMENT, title: '</title><script>x()</script>' },
      '</style><script>',
    );

    expect(parsed(html).querySelectorAll('script')).toHaveLength(0);
  });
});
