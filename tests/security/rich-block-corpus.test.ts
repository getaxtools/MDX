import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMarkdownRenderer, createRichBlockRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';

const CORPUS_FOLDER = join(import.meta.dirname, '..', 'fixtures', 'malicious');
const FORBIDDEN_ELEMENTS =
  'script, iframe, object, embed, form, base, meta, link, textarea, button, foreignObject, ' +
  '.mdx-math-inline a, .mdx-math-display a';
const SCRIPT_CAPABLE_URL = /^\s*(javascript|vbscript|data:text\/html|file):/i;
const URL_ATTRIBUTES = ['href', 'src', 'xlink:href', 'action', 'formaction'];

const corpusFiles = readdirSync(CORPUS_FOLDER).filter((file) => file.endsWith('.md') && file !== 'README.md');
const markdownRenderer = createMarkdownRenderer({ window });
const richBlocks = createRichBlockRenderer({ window });

async function renderWithMath(file: string): Promise<HTMLElement> {
  const article = document.createElement('article');
  article.innerHTML = markdownRenderer.render(readFileSync(join(CORPUS_FOLDER, file), 'utf8')).html;
  await richBlocks.renderInto(article, { isStillShown: () => true });
  return article;
}

describe('rich block corpus', () => {
  describe.each(corpusFiles)('%s with math typeset', (file) => {
    it('contains no executable or embedding elements, and no links in math', async () => {
      const article = await renderWithMath(file);

      expect([...article.querySelectorAll(FORBIDDEN_ELEMENTS)].map((element) => element.outerHTML)).toEqual(
        [],
      );
    });

    it('contains no event handlers or script-capable URLs', async () => {
      const elements = [...(await renderWithMath(file)).querySelectorAll('*')];

      const offending = elements.flatMap((element) =>
        element
          .getAttributeNames()
          .filter(
            (name) =>
              name.toLowerCase().startsWith('on') ||
              (URL_ATTRIBUTES.includes(name) && SCRIPT_CAPABLE_URL.test(element.getAttribute(name) ?? '')),
          ),
      );

      expect(offending).toEqual([]);
    });

    it('loads no remote resources from the styles KaTeX adds', async () => {
      const article = await renderWithMath(file);

      const remoteStyles = [...article.querySelectorAll('[style]')]
        .map((element) => element.getAttribute('style') ?? '')
        .filter((style) => /url\(/i.test(style));

      expect(remoteStyles).toEqual([]);
    });
  });
});
