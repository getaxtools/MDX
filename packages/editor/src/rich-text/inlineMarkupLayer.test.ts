import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { parseWholeDocument } from './parseWholeDocument';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceEditor, type SourceEditor } from '../createSourceEditor';
import type { EditingMode } from '../editing-mode/editingMode';
import { inlineMarkupLayer } from './inlineMarkupLayer';

/** Parsing 3,000 lines takes seconds under coverage on a busy machine. */
const LARGE_DOCUMENT_TIMEOUT_MS = 30_000;

let editor: SourceEditor | undefined;

function openEditor(text: string, editingMode: EditingMode = 'richText') {
  const parent = document.createElement('div');
  document.body.append(parent);
  const onChange = vi.fn();
  editor = createSourceEditor({ parent, text, label: 'Source', phrases: {}, onChange, editingMode });
  const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>('.cm-editor') ?? parent);
  if (!view) throw new Error('The editor view was not created');
  parseWholeDocument(view);
  return { view, onChange };
}

function shownLines(view: EditorView): string[] {
  return [...view.contentDOM.querySelectorAll('.cm-line')].map((line) => line.textContent);
}

function placeCaret(view: EditorView, position: number): void {
  view.dispatch({ selection: EditorSelection.cursor(position) });
}

function press(view: EditorView, key: string): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('Rich text inline markup', () => {
  afterEach(() => {
    editor?.destroy();
    editor = undefined;
    document.body.innerHTML = '';
  });

  it('bold markers hidden away from the caret', () => {
    const { view } = openEditor('Use **ready** here\n\nAnother paragraph');

    placeCaret(view, view.state.doc.length);

    expect(shownLines(view)[0]).toBe('Use ready here');
  });

  it('markers shown when the caret touches the element', () => {
    const { view } = openEditor('Use **ready** here\n\nAnother paragraph');
    const boldStart = 'Use '.length;
    const boldEnd = 'Use **ready**'.length;

    placeCaret(view, boldStart);
    const atStart = shownLines(view)[0];
    placeCaret(view, boldEnd);
    const atEnd = shownLines(view)[0];
    placeCaret(view, boldStart + 3);

    expect(atStart).toBe('Use **ready** here');
    expect(atEnd).toBe('Use **ready** here');
    expect(shownLines(view)[0]).toBe('Use **ready** here');
  });

  it('two cursors reveal two elements', () => {
    const text = 'A **bold** word, an _odd_ one and a [link](guide.md).\n\nElsewhere';
    const { view } = openEditor(text);

    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(text.indexOf('bold')),
        EditorSelection.cursor(text.indexOf('link')),
      ]),
    });

    expect(shownLines(view)[0]).toBe('A **bold** word, an odd one and a [link](guide.md).');
  });

  it('decorations only for visible lines', { timeout: LARGE_DOCUMENT_TIMEOUT_MS }, () => {
    const lines = Array.from({ length: 3000 }, (_, index) => `Line **${String(index)}** with a [link](a.md)`);
    const { view } = openEditor(lines.join('\n'));
    placeCaret(view, 0);
    const lastVisible = Math.max(...view.visibleRanges.map((range) => range.to));

    const decorations = view.plugin(inlineMarkupLayer)?.decorations;
    const starts: number[] = [];
    decorations?.between(0, view.state.doc.length, (from) => void starts.push(from));

    expect(lastVisible).toBeLessThan(view.state.doc.length / 2);
    expect(starts.length).toBeGreaterThan(0);
    expect(Math.max(...starts)).toBeLessThanOrEqual(lastVisible);
  });

  it('heading line uses the heading size', () => {
    const { view } = openEditor('## Results\n\nText below');

    placeCaret(view, view.state.doc.length);
    const heading = view.contentDOM.querySelector('.cm-line');

    expect(heading?.textContent).toBe('Results');
    expect(heading?.classList.contains('cm-rich-heading-2')).toBe(true);
  });

  it('a heading shows its number signs while the caret is on it', () => {
    const { view } = openEditor('# Results #\n\nText below');

    placeCaret(view, 4);

    expect(shownLines(view)[0]).toBe('# Results #');
  });

  it('a setext heading hides its underline', () => {
    const { view } = openEditor('Results\n=======\n\nText below');

    placeCaret(view, view.state.doc.length);

    expect(shownLines(view).slice(0, 2)).toEqual(['Results', '']);
    expect(view.contentDOM.querySelector('.cm-line')?.classList.contains('cm-rich-heading-1')).toBe(true);
  });

  it('links show only their styled text, autolinks lose their angle brackets', () => {
    const { view } = openEditor(
      'See [the guide](guide.md "Guide"), [the plan][plan] and <https://example.com>.\n\n[plan]: plan.md\n\nEnd',
    );

    placeCaret(view, view.state.doc.length);
    const linkTexts = [...view.contentDOM.querySelectorAll('.cm-rich-link')].map((link) => link.textContent);

    expect(shownLines(view)[0]).toBe('See the guide, the plan and https://example.com.');
    expect(linkTexts).toEqual(['the guide', 'the plan', 'https://example.com']);
  });

  it('a lone bracketed word that names no address keeps its brackets', () => {
    const { view } = openEditor('Press [Enter] to go on\n\nEnd');

    placeCaret(view, view.state.doc.length);

    expect(shownLines(view)[0]).toBe('Press [Enter] to go on');
  });

  it('strikethrough, inline code and escapes hide their markers', () => {
    const { view } = openEditor('A ~~gone~~ word, `code` and \\*stars\\*\n\nEnd');

    placeCaret(view, view.state.doc.length);

    expect(shownLines(view)[0]).toBe('A gone word, code and *stars*');
    expect(view.contentDOM.querySelector('.cm-rich-inline-code')?.textContent).toBe('code');
  });

  it('arrow keys reach every character', () => {
    const { view } = openEditor('**a**\n\nEnd');
    placeCaret(view, 0);

    for (let step = 0; step < 5; step += 1) press(view, 'ArrowRight');

    expect(view.state.selection.main.head).toBe(5);
  });

  it('Source shows every marker', () => {
    const { view } = openEditor('## Use **ready** and [a link](a.md)\n\nEnd', 'source');

    placeCaret(view, view.state.doc.length);

    expect(shownLines(view)[0]).toBe('## Use **ready** and [a link](a.md)');
    expect(view.contentDOM.querySelector('.cm-rich-heading')).toBeNull();
  });

  it('switching to Source shows the markers again', () => {
    const { view } = openEditor('Use **ready** here\n\nEnd');
    placeCaret(view, view.state.doc.length);

    editor?.setEditingMode('source');

    expect(shownLines(view)[0]).toBe('Use **ready** here');
  });
});
