import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmbedResolver } from './embeds';
import {
  fakeRichTextRendering,
  openRichTextEditor,
  placeCaret,
  shownLines,
  type TestEditor,
} from './richTextTestEditor';

const EMBED_LINE = /^!\[\[([^\]\n]+)\]\]$/;

function fakeResolver(
  notes: Readonly<Record<string, string>>,
): EmbedResolver & { readonly opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    targetOf: (source) => EMBED_LINE.exec(source.trim())?.[1],
    resolve: (target) => Promise.resolve(notes[target]),
    open: (target) => void opened.push(target),
    labels: {
      region: (target) => `Embedded note ${target}`,
      notFound: (target) => `Not found: ${target}`,
    },
  };
}

let opened: TestEditor | undefined;

function open(text: string, resolver: EmbedResolver, renderBlock?: (markdown: string) => string): TestEditor {
  opened = openRichTextEditor(text, {
    embedResolver: resolver,
    richTextRendering: fakeRichTextRendering(renderBlock ? { renderBlock } : {}),
  });
  return opened;
}

function embedNamed(editor: TestEditor, name: string): HTMLElement | undefined {
  return [...editor.view.contentDOM.querySelectorAll<HTMLElement>('[role="region"]')].find(
    (region) => region.getAttribute('aria-label') === name,
  );
}

describe('Rich text embeds', () => {
  afterEach(() => {
    opened?.close();
    opened = undefined;
  });

  it('region named after the target', () => {
    const editor = open('![[Plan]]\n\nEnd', fakeResolver({ Plan: '# Plan' }));

    expect(embedNamed(editor, 'Embedded note Plan')).toBeDefined();
  });

  it('shows the target rendered by the app, read-only', async () => {
    const renderBlock = vi.fn((markdown: string) => `<p class="embedded">${markdown}</p>`);
    const editor = open('![[Plan]]\n\nEnd', fakeResolver({ Plan: 'Book the venue.' }), renderBlock);

    await vi.waitFor(() => expect(editor.view.contentDOM.querySelector('.embedded')).not.toBeNull());

    expect(renderBlock).toHaveBeenCalledWith('Book the venue.');
    expect(editor.view.state.doc.toString()).toBe('![[Plan]]\n\nEnd');
  });

  it('unresolved embed shows Not found with the target', async () => {
    const editor = open('![[Missing]]\n\nEnd', fakeResolver({}));

    await vi.waitFor(() =>
      expect(embedNamed(editor, 'Embedded note Missing')?.textContent).toBe('Not found: Missing'),
    );
  });

  it('embed source shows at the caret', () => {
    const editor = open('![[Plan]]\n\nEnd', fakeResolver({ Plan: '# Plan' }));

    placeCaret(editor.view, 3);

    expect(embedNamed(editor, 'Embedded note Plan')).toBeUndefined();
    expect(shownLines(editor.view)[0]).toContain('[[Plan]]');
  });

  it('a click shows the embed source', () => {
    const resolver = fakeResolver({ Plan: '# Plan' });
    const editor = open('Intro\n\n![[Plan]]\n\nEnd', resolver);

    embedNamed(editor, 'Embedded note Plan')?.dispatchEvent(
      new MouseEvent('click', { button: 0, bubbles: true, cancelable: true }),
    );

    expect(embedNamed(editor, 'Embedded note Plan')).toBeUndefined();
    expect(editor.view.state.selection.main.head).toBe('Intro\n\n'.length);
    expect(resolver.opened).toEqual([]);
    placeCaret(editor.view, 0);
    expect(embedNamed(editor, 'Embedded note Plan')).toBeDefined();
  });

  it('Enter opens the target', () => {
    const resolver = fakeResolver({ Plan: '# Plan' });
    const editor = open('![[Plan]]\n\nEnd', resolver);

    embedNamed(editor, 'Embedded note Plan')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );

    expect(resolver.opened).toEqual(['Plan']);
    expect(editor.view.state.doc.toString()).toBe('![[Plan]]\n\nEnd');
  });

  it('Open Link with the caret on the embed opens the target', () => {
    const resolver = fakeResolver({ Plan: '# Plan' });
    const editor = open('Intro\n\n![[Plan]]\n\nEnd', resolver);
    placeCaret(editor.view, 'Intro\n\n![['.length);

    editor.editor.run('openLink');

    expect(resolver.opened).toEqual(['Plan']);
  });

  it('Ctrl+click opens the target', () => {
    const resolver = fakeResolver({ Plan: '# Plan' });
    const editor = open('![[Plan]]\n\nEnd', resolver);

    embedNamed(editor, 'Embedded note Plan')?.dispatchEvent(
      new MouseEvent('click', { ctrlKey: true, button: 0, bubbles: true, cancelable: true }),
    );

    expect(resolver.opened).toEqual(['Plan']);
  });

  it('a paragraph that is not an embed stays text', () => {
    const editor = open('See ![[Plan]] here.\n\nEnd', fakeResolver({ Plan: '# Plan' }));

    expect(editor.view.contentDOM.querySelector('[role="region"]')).toBeNull();
  });

  it('stays text in a workspace whose kind has no embeds', () => {
    opened = openRichTextEditor('![[Plan]]\n\nEnd');

    expect(opened.view.contentDOM.querySelector('[role="region"]')).toBeNull();
  });
});
