import type { SourceEditor } from '@mdx/editor';
import { createTranslator } from '@mdx/i18n';
import { createMarkdownRenderer, createRichBlockRenderer } from '@mdx/renderer';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRichTextRendering } from './richTextRendering';
import SourceEditorPane from './SourceEditorPane.svelte';

const EDITOR_LOAD_WAIT = { timeout: 5_000 };
const preview = createMarkdownRenderer({ window });
let documentNumber = 0;

/** The pane in Rich text, rendering its widgets through the preview's real renderer and sanitizer. */
async function renderRichText(text: string) {
  documentNumber += 1;
  const translator = createTranslator();
  const renderMarkdown = vi.fn(
    (markdown: string) =>
      preview.render(markdown, { resolveResourceUrl: (source) => `https://asset.localhost/${source}` }).html,
  );
  let shownEditor: SourceEditor | undefined;
  const onChange = vi.fn();
  render(SourceEditorPane, {
    canonicalKey: `c:\\docs\\widgets-${String(documentNumber)}.md`,
    fileName: 'Widgets.md',
    text,
    zoomPercent: 100,
    translator,
    onChange,
    richTextRendering: createRichTextRendering({
      documentKey: `widgets-${String(documentNumber)}`,
      renderMarkdown,
      richBlocks: createRichBlockRenderer({ window }),
      translator,
    }),
    onReady: (editor: SourceEditor | undefined) => (shownEditor = editor),
  });
  const textBox = await screen.findByRole('textbox', { name: 'Source of Widgets.md' }, EDITOR_LOAD_WAIT);
  const editor = await vi.waitFor(
    () => shownEditor ?? Promise.reject(new Error('The editor is not ready')),
    EDITOR_LOAD_WAIT,
  );
  editor.setEditingMode('richText');
  editor.revealLine(text.split('\n').length - 1);
  return { textBox, onChange, renderMarkdown };
}

/** Anything in rendered HTML that could run code or load from elsewhere. */
function unsafeContentIn(element: Element): string[] {
  const unsafe = [...element.querySelectorAll('script, iframe, object, embed, form')].map(
    (found) => found.tagName,
  );
  for (const found of element.querySelectorAll('*')) {
    for (const attribute of found.attributes) {
      if (attribute.name.startsWith('on')) unsafe.push(attribute.name);
      if (/^\s*javascript:/i.test(attribute.value)) unsafe.push(attribute.value);
    }
  }
  return unsafe;
}

describe('Rich text widgets rendered by the preview', () => {
  beforeAll(async () => {
    await import('@mdx/editor');
  }, 60_000);

  // CodeMirror measures text positions, which jsdom does not lay out.
  beforeEach(() => {
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [new DOMRect(0, 0, 1, 1)],
    });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 0, 1, 1),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(Range.prototype, 'getClientRects');
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  });

  it('an HTML block widget drops scripts and event handlers', async () => {
    const { textBox } = await renderRichText(
      '<div onclick="alert(1)">Hello<script>alert(2)</script><img src="x.png" onerror="alert(3)"></div>\n\nEnd',
    );

    const htmlBlock = await vi.waitFor(
      () => textBox.querySelector('.cm-rich-html') ?? Promise.reject(new Error()),
    );

    expect(htmlBlock.textContent).toContain('Hello');
    expect(unsafeContentIn(htmlBlock)).toEqual([]);
  });

  it('every widget kind goes through the sanitizer', async () => {
    const table = '| A | B |\n|---|---|\n| <img src=x onerror=alert(1)> | [x](javascript:alert(2)) |';
    const html = '<p onmouseover="alert(3)">Block</p><iframe src="https://example.com"></iframe>';
    const picture = '![Logo <script>alert(4)</script>](logo.png)';
    const { textBox, renderMarkdown } = await renderRichText(`${table}\n\n${html}\n\nSee ${picture}\n\nEnd`);

    const widgets = await vi.waitFor(() => {
      const shown = [...textBox.querySelectorAll('.cm-rich-table, .cm-rich-html, .cm-rich-image')];
      return shown.length === 3 ? shown : Promise.reject(new Error('Not every widget is shown'));
    });

    expect(widgets.flatMap(unsafeContentIn)).toEqual([]);
    expect(renderMarkdown.mock.calls.map(([markdown]) => markdown)).toEqual(
      expect.arrayContaining([table, html, picture]),
    );
  });

  it("remote image makes no request and shows the preview's placeholder", async () => {
    const { textBox } = await renderRichText('See ![Logo](https://example.com/logo.png) here.\n\nEnd');

    const picture = await vi.waitFor(
      () => textBox.querySelector('.cm-rich-image') ?? Promise.reject(new Error()),
    );

    expect(picture.querySelector('img')?.hasAttribute('src')).toBe(false);
    expect(picture.querySelector('.blocked-remote-image')?.textContent).toContain(
      'https://example.com/logo.png',
    );
  });

  it('image named by its alternative text', async () => {
    await renderRichText('See ![Team photo](team.png) here.\n\nEnd');

    const picture = await screen.findByRole('img', { name: 'Team photo' }, EDITOR_LOAD_WAIT);

    expect(picture.getAttribute('src')).toBe('https://asset.localhost/team.png');
  });

  it('broken image shows its address as text', async () => {
    const { textBox } = await renderRichText('See ![Team photo](team.png) here.\n\nEnd');
    const picture = await screen.findByRole('img', { name: 'Team photo' }, EDITOR_LOAD_WAIT);

    picture.dispatchEvent(new Event('error'));

    expect(textBox.querySelector('.cm-rich-image')?.textContent.trim()).toBe('team.png');
  });

  it('a details block opens without editing the file', async () => {
    const { textBox, onChange } = await renderRichText(
      '<details><summary>More</summary>Hidden text</details>\n\nEnd',
    );
    const summary = await vi.waitFor(() => textBox.querySelector('summary') ?? Promise.reject(new Error()));

    await userEvent.click(summary);

    expect(textBox.querySelector('details')?.open).toBe(true);
    expect(textBox.querySelector('.cm-rich-html')).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('table widget named by its rows and columns', async () => {
    await renderRichText('| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\nEnd');

    const table = await screen.findByRole('table', { name: 'Table, 3 rows, 2 columns' }, EDITOR_LOAD_WAIT);

    expect(table.getAttribute('tabindex')).toBeNull();
  });

  it('a rendered link takes no Tab stop of its own', async () => {
    const { textBox } = await renderRichText('<p><a href="guide.md">Guide</a></p>\n\nEnd');

    const link = await vi.waitFor(
      () => textBox.querySelector('.cm-rich-html a') ?? Promise.reject(new Error()),
    );

    expect(link.getAttribute('tabindex')).toBe('-1');
  });

  it('a callout shows the translated title of its type', async () => {
    const { textBox } = await renderRichText('> [!WARNING]\n> Mind the gap.\n\nEnd');

    await vi.waitFor(() =>
      expect(textBox.querySelector('.cm-rich-callout-title')?.textContent).toBe('Warning'),
    );
  });

  it('front matter collapses to a chip that counts its properties', async () => {
    const { textBox } = await renderRichText('---\ntitle: Plan\ntags: [a]\n---\n\nText');

    await vi.waitFor(() =>
      expect(textBox.querySelector('.cm-rich-properties')?.textContent).toBe('2 properties'),
    );
  });
});
