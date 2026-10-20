import { createMarkdownRenderer } from '@mdx/renderer';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

const FORBIDDEN_ELEMENTS = 'script, iframe, object, embed, form, base, meta, link, textarea, button, style';
const SCRIPT_CAPABLE_URL = /^\s*(javascript|vbscript|data:text\/html|file):/i;
const URL_ATTRIBUTES = ['href', 'src', 'xlink:href', 'action', 'formaction', 'srcset'];
const RUNS = 300;
/** Hundreds of renders take a while, especially with coverage measurement on. */
const PROPERTY_TIMEOUT_MS = 60_000;

/** Pieces attackers combine; random text in between makes the parser see them in new contexts. */
const HOSTILE_FRAGMENTS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  '<iframe src="https://example.com"></iframe>',
  '<object data="x"></object>',
  '<embed src="x">',
  '<form action="https://example.com"><button>go</button></form>',
  '<base href="https://example.com/">',
  '<meta http-equiv="refresh" content="0;url=https://example.com">',
  '<link rel="stylesheet" href="https://example.com/a.css">',
  '<style>body{display:none}</style>',
  '<div style="background:url(javascript:alert(1))">x</div>',
  '[x](javascript:alert(1))',
  '[x](vbscript:msgbox(1))',
  '![x](javascript:alert(1))',
  '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '<details open ontoggle=alert(1)>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  '<input autofocus onfocus=alert(1)>',
  '<textarea>x</textarea>',
  '`<script>`',
  '```html\n<script>alert(1)</script>\n```',
];

const MARKDOWN_PIECES = [
  '\n',
  '\n\n',
  '# ',
  '> ',
  '- ',
  '1. ',
  '**',
  '*',
  '`',
  '[',
  ']',
  '(',
  ')',
  '|',
  '<',
  '>',
  '"',
];

const hostileMarkdown = fc
  .array(
    fc.oneof(
      fc.constantFrom(...HOSTILE_FRAGMENTS),
      fc.constantFrom(...MARKDOWN_PIECES),
      fc.string({ maxLength: 12 }),
    ),
    { maxLength: 24 },
  )
  .map((parts) => parts.join(''));

const renderer = createMarkdownRenderer({ window });

function renderToElement(markdown: string): HTMLElement {
  const article = document.createElement('article');
  article.innerHTML = renderer.render(markdown).html;
  return article;
}

function scriptCapableAttributes(article: HTMLElement): string[] {
  return [...article.querySelectorAll('*')].flatMap((element) =>
    element.getAttributeNames().filter((name) => {
      const value = element.getAttribute(name) ?? '';
      return name.startsWith('on') || (URL_ATTRIBUTES.includes(name) && SCRIPT_CAPABLE_URL.test(value));
    }),
  );
}

describe('sanitizer properties', { timeout: PROPERTY_TIMEOUT_MS }, () => {
  it('never lets executable or embedding elements through, whatever the input', () => {
    fc.assert(
      fc.property(hostileMarkdown, (markdown) => {
        expect(renderToElement(markdown).querySelectorAll(FORBIDDEN_ELEMENTS)).toHaveLength(0);
      }),
      { numRuns: RUNS },
    );
  });

  it('never keeps event handlers or script-capable URLs, whatever the input', () => {
    fc.assert(
      fc.property(hostileMarkdown, (markdown) => {
        expect(scriptCapableAttributes(renderToElement(markdown))).toEqual([]);
      }),
      { numRuns: RUNS },
    );
  });

  it('renders the same input to the same HTML every time', () => {
    fc.assert(
      fc.property(hostileMarkdown, (markdown) => {
        expect(renderer.render(markdown).html).toBe(renderer.render(markdown).html);
      }),
      { numRuns: RUNS },
    );
  });

  it('keeps every inline style out of the output', () => {
    fc.assert(
      fc.property(hostileMarkdown, (markdown) => {
        expect(renderToElement(markdown).querySelectorAll('[style]')).toHaveLength(0);
      }),
      { numRuns: RUNS },
    );
  });
});
