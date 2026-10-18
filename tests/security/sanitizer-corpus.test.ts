import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';

const CORPUS_FOLDER = join(import.meta.dirname, '..', 'fixtures', 'malicious');
const FORBIDDEN_ELEMENTS =
  'script, iframe, object, embed, form, style, base, meta, link, textarea, button, foreignObject';
const SCRIPT_CAPABLE_URL = /^\s*(javascript|vbscript|data:text\/html|file):/i;
const URL_ATTRIBUTES = ['href', 'src', 'xlink:href', 'action', 'formaction'];

const corpusFiles = readdirSync(CORPUS_FOLDER).filter((file) => file.endsWith('.md') && file !== 'README.md');
const renderer = createMarkdownRenderer({
  window,
  resolveResourceUrl: (relativeUrl) => `asset://docs/${relativeUrl}`,
});

function renderCorpusFile(file: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderer.render(readFileSync(join(CORPUS_FOLDER, file), 'utf8')).html;
  return container;
}

describe('sanitizer corpus', () => {
  it('has corpus files to check', () => {
    expect(corpusFiles.length).toBeGreaterThan(0);
  });

  describe.each(corpusFiles)('%s', (file) => {
    const elements = () => [...renderCorpusFile(file).querySelectorAll('*')];

    it('contains no executable or embedding elements', () => {
      expect(renderCorpusFile(file).querySelectorAll(FORBIDDEN_ELEMENTS)).toHaveLength(0);
    });

    it('contains no event handler attributes', () => {
      const handlers = elements().flatMap((element) =>
        element.getAttributeNames().filter((name) => name.toLowerCase().startsWith('on')),
      );

      expect(handlers).toEqual([]);
    });

    it('contains no script-capable URLs', () => {
      const dangerousUrls = elements().flatMap((element) =>
        URL_ATTRIBUTES.map((name) => element.getAttribute(name) ?? '').filter((value) =>
          SCRIPT_CAPABLE_URL.test(value),
        ),
      );

      expect(dangerousUrls).toEqual([]);
    });

    it('contains no inline styles, srcset or remote image sources', () => {
      const offending = elements().filter(
        (element) =>
          element.hasAttribute('style') ||
          element.hasAttribute('srcset') ||
          /^(https?:)?\/\//i.test(element.getAttribute('src') ?? ''),
      );

      expect(offending.map((element) => element.outerHTML)).toEqual([]);
    });

    it('contains no clobbering names or unprefixed ids', () => {
      const offending = elements().filter(
        (element) => element.hasAttribute('name') || (element.id !== '' && !element.id.startsWith('mdx-')),
      );

      expect(offending.map((element) => element.outerHTML)).toEqual([]);
    });

    it('contains only disabled checkboxes as inputs', () => {
      const inputs = [...renderCorpusFile(file).querySelectorAll('input')];

      expect(inputs.every((input) => input.type === 'checkbox' && input.disabled)).toBe(true);
    });
  });
});
