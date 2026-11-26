import { WidgetType } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { openRichTextEditor, placeCaret, shownLines, type TestEditor } from './richTextTestEditor';
import type { RichTextBlockProvider } from './richTextProviders';

const TABLE = '| A | B |\n|---|---|\n| 1 | 2 |';
const DOCUMENT_WITH_TABLE = `Intro\n\n${TABLE}\n\nEnd`;
const HTML_BLOCK = '<div>\nhello\n</div>';
const DOCUMENT_WITH_HTML_BLOCK = `Intro\n\n${HTML_BLOCK}\n\nEnd`;
const HTML_BLOCK_START = 'Intro\n\n'.length;

let opened: TestEditor | undefined;

function open(...args: Parameters<typeof openRichTextEditor>): TestEditor {
  opened = openRichTextEditor(...args);
  return opened;
}

function press(opened: TestEditor, key: string): void {
  opened.view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
}

class MarkedWidget extends WidgetType {
  toDOM(): HTMLElement {
    const marker = document.createElement('div');
    marker.className = 'provided';
    return marker;
  }
}

const codeProvider: RichTextBlockProvider = {
  nodeNames: ['FencedCode'],
  widgetFor: () => new MarkedWidget(),
};

describe('Rich text block widgets', () => {
  afterEach(() => {
    opened?.close();
    opened = undefined;
  });

  it('widget replaced by source when the caret enters', () => {
    const { view } = open(DOCUMENT_WITH_HTML_BLOCK);
    const shownAway = view.contentDOM.querySelector('.cm-rich-html');

    placeCaret(view, HTML_BLOCK_START + 3);

    expect(shownAway?.textContent).toBe(`${String(HTML_BLOCK.length)} characters`);
    expect(view.contentDOM.querySelector('.cm-rich-html')).toBeNull();
    expect(shownLines(view)).toContain('hello');
  });

  it('arrow key into a widget lands in its source', () => {
    const editor = open(DOCUMENT_WITH_HTML_BLOCK);
    placeCaret(editor.view, HTML_BLOCK_START - 1);

    press(editor, 'ArrowRight');

    expect(editor.view.state.selection.main.head).toBe(HTML_BLOCK_START);
    expect(editor.view.contentDOM.querySelector('.cm-rich-html')).toBeNull();
    expect(shownLines(editor.view)).toContain('<div>');
  });

  it('widget is not redrawn when its source is unchanged', () => {
    const { view } = open(DOCUMENT_WITH_TABLE);
    const shownBefore = view.contentDOM.querySelector('.cm-rich-table');

    view.dispatch({ changes: { from: 0, insert: 'More ' }, userEvent: 'input.type' });
    placeCaret(view, view.state.doc.length);

    expect(view.contentDOM.querySelector('.cm-rich-table')).toBe(shownBefore);
  });

  it('a widget follows the table when text is typed above it', () => {
    const { view } = open(DOCUMENT_WITH_TABLE);

    view.dispatch({ changes: { from: 0, insert: 'New line\n' }, userEvent: 'input.type' });
    placeCaret(view, view.state.doc.length);

    expect(view.contentDOM.querySelectorAll('.cm-rich-table')).toHaveLength(1);
    expect(shownLines(view)).not.toContain('| 1 | 2 |');
  });

  it("a provider's widget follows the reveal rule", () => {
    const { view } = open('```js\nlet a;\n```\n\nEnd', { richTextProviders: { blocks: [codeProvider] } });
    const shownAway = view.contentDOM.querySelector('.provided');

    placeCaret(view, 3);

    expect(shownAway).not.toBeNull();
    expect(view.contentDOM.querySelector('.provided')).toBeNull();
    expect(shownLines(view)[1]).toBe('let a;');
  });

  it('a failing provider leaves the text shown', () => {
    const failing: RichTextBlockProvider = {
      nodeNames: ['FencedCode'],
      widgetFor: () => {
        throw new Error('The provider failed');
      },
    };

    const { view } = open('```js\nlet a;\n```\n\nEnd', { richTextProviders: { blocks: [failing] } });

    expect(shownLines(view).slice(0, 3)).toEqual(['```js', 'let a;', '```']);
  });

  it('providers are off in Source', () => {
    const { view } = open('```js\nlet a;\n```\n\nEnd', {
      richTextProviders: { blocks: [codeProvider] },
      editingMode: 'source',
    });

    expect(view.contentDOM.querySelector('.provided')).toBeNull();
    expect(view.contentDOM.querySelector('.cm-rich-table')).toBeNull();
  });

  it('without the rendering port every block stays text', () => {
    const { view } = open(DOCUMENT_WITH_TABLE, { hasRendering: false });

    expect(view.contentDOM.querySelector('.cm-rich-rendered')).toBeNull();
    expect(shownLines(view)).toContain('| 1 | 2 |');
  });

  it('a block inside a quote stays text', () => {
    const { view } = open(`> ${TABLE.replaceAll('\n', '\n> ')}\n\nEnd`);

    expect(view.contentDOM.querySelector('.cm-rich-table')).toBeNull();
  });

  it('a setext heading shows on one line until a selection touches it', () => {
    const { view } = open('Results\n=======\n\nText below');
    const away = shownLines(view);

    placeCaret(view, 2);

    expect(away).toEqual(['Results', '', 'Text below']);
    expect(shownLines(view)).toEqual(['Results', '=======', '', 'Text below']);
  });
});
