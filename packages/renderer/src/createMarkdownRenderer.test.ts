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
  describe('images', () => {
    it('resolves relative images with the resolver given for this document', () => {
      const { html } = renderer.render('![Diagram](images/diagram.png)', {
        resolveResourceUrl: (relativeUrl) => `image://guide/${relativeUrl}`,
      });

      expect(html).toContain('src="image://guide/images/diagram.png"');
    });

    it('falls back to the renderer-wide resolver', () => {
      expect(renderer.render('![Logo](logo.png)').html).toContain('src="asset://docs/logo.png"');
    });

    it('never loads remote images', () => {
      const { html } = renderer.render('![Tracker](https://example.com/pixel.png)');

      expect(html).not.toMatch(/\ssrc=/);
      expect(html).toContain('data-mdx-blocked-src="https://example.com/pixel.png"');
    });
  });

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

    it('labels each task checkbox with its task text', () => {
      const element = renderToElement('- [x] Write the *guide*\n- [ ] Review it');
      const labels = [...element.querySelectorAll('li.task-list-item > label')];

      expect(labels.map((label) => label.textContent.trim())).toEqual(['Write the guide', 'Review it']);
      expect(labels.every((label) => label.querySelector('input[type="checkbox"]'))).toBe(true);
    });
  });

  describe('extended syntax', () => {
    it('renders footnotes whose links point at each other', () => {
      const element = renderToElement('Claim.[^1]\n\n[^1]: The source.');
      const reference = element.querySelector('sup.footnote-ref a');
      const footnote = element.querySelector('section.footnotes li');

      expect(reference?.getAttribute('href')).toBe(`#${footnote?.id ?? 'missing'}`);
      expect(footnote?.id).toMatch(/^mdx-fn/);
      expect(footnote?.querySelector('a.footnote-backref')?.getAttribute('href')).toBe(
        `#${reference?.id ?? ''}`,
      );
      expect(reference?.getAttribute('data-mdx-link')).toBe('anchor');
    });

    it('renders definition lists', () => {
      const element = renderToElement('Term\n: Definition');

      expect(element.querySelector('dl dt')?.textContent).toBe('Term');
      expect(element.querySelector('dl dd')?.textContent).toBe('Definition');
    });

    it('renders subscript, superscript and marked text', () => {
      const element = renderToElement('H~2~O, x^2^ and ==important==');

      expect(element.querySelector('sub')?.textContent).toBe('2');
      expect(element.querySelector('sup')?.textContent).toBe('2');
      expect(element.querySelector('mark')?.textContent).toBe('important');
    });

    it('explains abbreviations with a title', () => {
      const element = renderToElement('*[HTML]: Hyper Text Markup Language\n\nWrite HTML.');

      expect(element.querySelector('abbr')?.getAttribute('title')).toBe('Hyper Text Markup Language');
    });

    it('turns emoji shortcodes into emoji but leaves emoticons as typed', () => {
      const element = renderToElement(':rocket: :white_check_mark: :)');

      expect(element.textContent.trim()).toBe('🚀 ✅ :)');
    });

    it('renders GitHub alerts with a title', () => {
      const element = renderToElement('> [!WARNING]\n> Back up first.');
      const alert = element.querySelector('div.markdown-alert');

      expect(alert?.classList.contains('markdown-alert-warning')).toBe(true);
      expect(alert?.querySelector('p.markdown-alert-title')?.textContent).toBe('Warning');
      expect(alert?.textContent).toContain('Back up first.');
      expect(alert?.textContent).not.toContain('[!WARNING]');
    });

    it('names alerts in the language it is given', () => {
      const translated = createMarkdownRenderer({
        window,
        alertTitles: {
          note: 'नोट',
          tip: 'Tip',
          important: 'Important',
          warning: 'Warning',
          caution: 'Caution',
        },
      });

      expect(translated.render('> [!NOTE]\n> Text').html).toContain(
        '<p class="markdown-alert-title">नोट</p>',
      );
    });
  });

  describe('headings and outline', () => {
    it('builds an outline with stable, unique anchors', () => {
      const { outline } = renderer.render('# Guide\n## Install `mdx`\n## Install `mdx`');

      expect(outline).toEqual([
        { level: 1, text: 'Guide', id: 'mdx-guide', line: 0 },
        { level: 2, text: 'Install mdx', id: 'mdx-install-mdx', line: 1 },
        { level: 2, text: 'Install mdx', id: 'mdx-install-mdx-1', line: 2 },
      ]);
    });

    it('never gives two headings the same anchor, even when a heading already ends in a number', () => {
      const { outline } = renderer.render('# Intro\n# Intro\n# Intro 1\n# Intro-1');

      expect(outline.map((entry) => entry.id)).toEqual([
        'mdx-intro',
        'mdx-intro-1',
        'mdx-intro-1-1',
        'mdx-intro-1-2',
      ]);
    });

    it('keeps underscores in anchors, as GitHub does', () => {
      expect(renderer.render('## snake_case names').outline[0]?.id).toBe('mdx-snake_case-names');
    });

    it('keeps emoji and math in the outline text but not in the anchor', () => {
      const [entry] = renderer.render('## :tada: Release $x^2$').outline;

      expect(entry?.text).toBe('🎉 Release x^2');
      expect(entry?.id).toBe('mdx-release');
    });

    it('counts the hidden front matter lines in the outline', () => {
      const { outline } = renderer.render('---\ntitle: Guide\n---\n# Guide\n\n## Usage');

      expect(outline.map((entry) => entry.line)).toEqual([3, 5]);
    });

    it('lists the outline of a text without rendering it', () => {
      expect(renderer.outlineOf('---\ntitle: Guide\n---\n# Guide\n## Guide')).toEqual([
        { level: 1, text: 'Guide', id: 'mdx-guide', line: 3 },
        { level: 2, text: 'Guide', id: 'mdx-guide-1', line: 4 },
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

  describe('source lines', () => {
    function sourceLinesOf(source: string): string[] {
      const container = document.createElement('div');
      container.innerHTML = renderer.render(source, { includeSourceLines: true }).html;
      return [...container.querySelectorAll('[data-mdx-source-line]')].map(
        (element) => `${element.tagName.toLowerCase()}:${element.getAttribute('data-mdx-source-line') ?? ''}`,
      );
    }

    it('marks each block with the line it starts on', () => {
      expect(sourceLinesOf('# Title\n\nFirst paragraph\n\n- one\n- two')).toEqual([
        'h1:0',
        'p:2',
        'ul:4',
        'li:4',
        'li:5',
      ]);
    });

    it('counts the hidden front matter lines', () => {
      expect(sourceLinesOf('---\ntitle: Guide\n---\n# Title')).toEqual(['h1:3']);
    });

    it('adds no markers unless asked to', () => {
      expect(renderer.render('# Title').html).not.toContain('data-mdx-source-line');
    });
  });
});
