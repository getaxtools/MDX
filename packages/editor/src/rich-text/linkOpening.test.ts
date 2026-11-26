import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { parseWholeDocument } from './parseWholeDocument';
import { ensureSyntaxTree } from '@codemirror/language';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceEditor, type SourceEditor, type SourceEditorOptions } from '../createSourceEditor';
import { markdownSyntax } from '../syntax/markdownSyntax';
import { linkAt, type WrittenLink } from './linkTargets';

let editor: SourceEditor | undefined;

function openRichText(text: string, options: Partial<SourceEditorOptions> = {}) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const onOpenLink = vi.fn();
  editor = createSourceEditor({
    parent,
    text,
    label: 'Source',
    phrases: {},
    onChange: vi.fn(),
    editingMode: 'richText',
    onOpenLink,
    ...options,
  });
  const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>('.cm-editor') ?? parent);
  if (!view) throw new Error('The editor view was not created');
  parseWholeDocument(view);
  return { editor, view, onOpenLink };
}

function linkAtWord(text: string, word: string): WrittenLink | undefined {
  const state = EditorState.create({ doc: text, extensions: [markdownSyntax()] });
  ensureSyntaxTree(state, text.length, 1000);
  return linkAt(state, text.indexOf(word));
}

function ctrlClick(element: Element | null | undefined): void {
  element?.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }),
  );
}

describe('opening links from Rich text', () => {
  afterEach(() => {
    editor?.destroy();
    editor = undefined;
    document.body.innerHTML = '';
  });

  it('Ctrl+click adds no cursor', () => {
    const { view, onOpenLink } = openRichText('Read [the guide](guide.md) first.\n\nEnd');
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });

    ctrlClick(view.contentDOM.querySelector('.cm-rich-link'));

    expect(onOpenLink).toHaveBeenCalledWith({ destination: 'guide.md', form: 'destination' });
    expect(view.state.selection.ranges).toHaveLength(1);
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it('Ctrl+click while an input method composes opens nothing', () => {
    const { view, onOpenLink } = openRichText('Read [the guide](guide.md) first.\n\nEnd');
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });

    // The click goes on to CodeMirror, which measures text positions that jsdom does not lay out.
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 0, 0, 0),
    });

    view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    ctrlClick(view.contentDOM.querySelector('.cm-rich-link'));
    Reflect.deleteProperty(Range.prototype, 'getClientRects');
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');

    expect(onOpenLink).not.toHaveBeenCalled();
  });

  it('Open Link opens the link at the caret, its destination as written', () => {
    const { editor: opened, view, onOpenLink } = openRichText('Read [the guide](<my guide.md>) first.');
    view.dispatch({ selection: EditorSelection.cursor('Read [the'.length) });

    opened.run('openLink');

    expect(onOpenLink).toHaveBeenCalledWith({ destination: '<my guide.md>', form: 'destination' });
  });

  it('reports whether the caret is in a link, in Rich text only', () => {
    const onCaretInLinkChange = vi.fn();
    const { editor: opened, view } = openRichText('Read [the guide](guide.md) first.', {
      onCaretInLinkChange,
    });

    view.dispatch({ selection: EditorSelection.cursor('Read [the'.length) });
    view.dispatch({ selection: EditorSelection.cursor(1) });
    view.dispatch({ selection: EditorSelection.cursor('Read [the'.length) });
    opened.setEditingMode('source');

    expect(onCaretInLinkChange.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('a reference link opens the destination of its definition', () => {
    const text =
      'See [the plan][Next Steps], [the plan again][] and [guide].\n\n[next   steps]: plan.md\n[the plan again]: <again.md>\n[GUIDE]: guide.md';

    expect(linkAtWord(text, 'plan]')).toEqual({ destination: 'plan.md', form: 'destination' });
    expect(linkAtWord(text, 'again]')).toEqual({ destination: '<again.md>', form: 'destination' });
    expect(linkAtWord(text, 'guide]')).toEqual({ destination: 'guide.md', form: 'destination' });
  });

  it('autolinks and bare addresses are given in the form the preview links them from', () => {
    const text =
      'Mail <someone@example.com>, visit https://medium.com/@author or <https://example.com/a>, not www.example.com.';

    expect(linkAtWord(text, 'someone')).toEqual({ destination: 'someone@example.com', form: 'autolink' });
    expect(linkAtWord(text, 'medium')).toEqual({ destination: 'https://medium.com/@author', form: 'text' });
    expect(linkAtWord(text, 'www.')).toBeUndefined();
    expect(linkAtWord(text, 'example.com/a')).toEqual({
      destination: 'https://example.com/a',
      form: 'autolink',
    });
  });

  it('a destination keeps its escapes and entities for the app to read as the preview does', () => {
    expect(linkAtWord('A [file](caf&eacute;\\_notes.md).', 'file')?.destination).toBe(
      'caf&eacute;\\_notes.md',
    );
  });

  it('text outside links, an undefined reference and a footnote have no link', () => {
    const text = 'Press [Enter] in ![a picture](picture.png) and [^1].\n\n[^1]: A note.';

    expect(linkAtWord(text, 'Press')).toBeUndefined();
    expect(linkAtWord(text, 'Enter')).toBeUndefined();
    expect(linkAtWord(text, 'picture]')).toBeUndefined();
    expect(linkAtWord(text, '^1]')).toBeUndefined();
  });

  it('a defined shortcut reference is styled as a link, an undefined one keeps its brackets', () => {
    const { view } = openRichText('See [guide] and [nothing].\n\n[guide]: guide.md\n\nEnd');
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });

    const firstLine = view.contentDOM.querySelector('.cm-line');

    expect(firstLine?.textContent).toBe('See guide and [nothing].');
    expect(firstLine?.querySelector('.cm-rich-link')?.textContent).toBe('guide');
  });
});
