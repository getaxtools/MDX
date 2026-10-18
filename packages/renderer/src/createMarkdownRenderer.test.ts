import { describe, expect, it } from 'vitest';
import { createMarkdownRenderer } from './createMarkdownRenderer';

const renderer = createMarkdownRenderer({
  window,
  resolveResourceUrl: (relativeUrl) => `asset://docs/${relativeUrl}`,
});

function renderToElement(source: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderer.render(source).html;
  return container;
}

describe('createMarkdownRenderer', () => {
  describe('GitHub-flavored Markdown', () => {
    it('renders tables', () => {
      const element = renderToElement('| Name | Value |\n| --- | --- |\n| a | 1 |');

      expect(element.querySelectorAll('table td')).toHaveLength(2);
    });

    it('renders strikethrough', () => {
      expect(renderToElement('~~old~~').querySelector('s')?.textContent).toBe('old');
    });

    it('turns bare URLs into external links', () => {
      const link = renderToElement('See https://example.com today').querySelector('a');

      expect(link?.getAttribute('href')).toBe('https://example.com');
      expect(link?.dataset.mdxLink).toBe('external');
    });

    it('renders task lists as disabled checkboxes', () => {
      const element = renderToElement('- [x] done\n- [ ] todo\n- plain');
      const checkboxes = [...element.querySelectorAll('input')];

      expect(checkboxes.map((checkbox) => checkbox.checked)).toEqual([true, false]);
      expect(checkboxes.every((checkbox) => checkbox.disabled)).toBe(true);
      expect(element.querySelectorAll('li.task-list-item')).toHaveLength(2);
      expect(element.querySelector('li')?.textContent).toBe(' done');
    });
  });

  describe('headings and outline', () => {
    it('builds an outline with stable, unique anchors', () => {
      const { outline } = renderer.render('# Guide\n## Install `mdx`\n## Install `mdx`');

      expect(outline).toEqual([
        { level: 1, text: 'Guide', id: 'mdx-guide' },
        { level: 2, text: 'Install mdx', id: 'mdx-install-mdx' },
        { level: 2, text: 'Install mdx', id: 'mdx-install-mdx-1' },
      ]);
    });

    it('keeps letters and vowel signs of Indic scripts in anchors', () => {
      const { outline } = renderer.render('# नमस्ते दुनिया\n# తెలుగు');

      expect(outline.map((entry) => entry.id)).toEqual(['mdx-नमस्ते-दुनिया', 'mdx-తెలుగు']);
    });

    it('falls back to a generic anchor for headings without letters', () => {
      expect(renderer.render('# !!!').outline[0]?.id).toBe('mdx-section');
    });

    it('puts the anchor on the heading element', () => {
      expect(renderToElement('## Usage').querySelector('h2')?.id).toBe('mdx-usage');
    });
  });

  describe('front matter', () => {
    it('hides front matter from the body and returns it separately', () => {
      const rendered = renderer.render('---\ntitle: Guide\n---\n# Guide');

      expect(rendered.frontMatter).toBe('title: Guide');
      expect(rendered.html).not.toContain('title: Guide');
    });

    it('omits front matter when the document has none', () => {
      expect(renderer.render('# Guide')).not.toHaveProperty('frontMatter');
    });
  });

  describe('links and images', () => {
    it('classifies document and anchor links', () => {
      const links = [...renderToElement('[a](other.md) [b](#usage)').querySelectorAll('a')];

      expect(links.map((link) => link.dataset.mdxLink)).toEqual(['document', 'anchor']);
    });

    it('resolves relative images through the resource resolver', () => {
      const image = renderToElement('![diagram](images/flow.png)').querySelector('img');

      expect(image?.getAttribute('src')).toBe('asset://docs/images/flow.png');
      expect(image?.getAttribute('alt')).toBe('diagram');
    });

    it('drops relative images when no resolver is given', () => {
      const withoutResolver = createMarkdownRenderer({ window });
      const container = document.createElement('div');
      container.innerHTML = withoutResolver.render('![diagram](flow.png)').html;

      expect(container.querySelector('img')?.hasAttribute('src')).toBe(false);
    });

    it('blocks remote images and keeps their address for a placeholder', () => {
      const image = renderToElement('![logo](https://example.com/logo.png)').querySelector('img');

      expect(image?.hasAttribute('src')).toBe(false);
      expect(image?.dataset.mdxBlockedSrc).toBe('https://example.com/logo.png');
    });

    it('keeps inline data images', () => {
      const image = renderToElement('![dot](data:image/png;base64,iVBORw0KGgo=)').querySelector('img');

      expect(image?.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
    });
  });
});
