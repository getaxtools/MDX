import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { parseWholeDocument } from './parseWholeDocument';
import { ensureSyntaxTree } from '@codemirror/language';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceEditor, type SourceEditor, type SourceEditorOptions } from '../createSourceEditor';
import { markdownSyntax } from '../syntax/markdownSyntax';
import { linkAddressAt } from './linkTargets';

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

function addressAt(text: string, word: string): string | undefined {
  const state = EditorState.create({ doc: text, extensions: [markdownSyntax()] });
  ensureSyntaxTree(state, text.length, 1000);
  return linkAddressAt(state, text.indexOf(word));
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

    expect(onOpenLink).toHaveBeenCalledWith('guide.md');
    expect(view.state.selection.ranges).toHaveLength(1);
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it('Open Link opens the link at the caret', () => {
    const { editor: opened, view, onOpenLink } = openRichText('Read [the guide](<my guide.md>) first.');
    view.dispatch({ selection: EditorSelection.cursor('Read [the'.length) });

    opened.run('openLink');

    expect(onOpenLink).toHaveBeenCalledWith('my guide.md');
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

  it('a reference link opens the address of its definition', () => {
    const text =
      'See [the plan][Next Steps] and [the plan again][].\n\n[next   steps]: plan.md\n[the plan again]: <again.md>';

    expect(addressAt(text, 'plan]')).toBe('plan.md');
    expect(addressAt(text, 'again]')).toBe('again.md');
  });

  it('autolinks and bare addresses open as the preview links them', () => {
    const text = 'Mail <someone@example.com>, visit www.example.com or <https://example.com/a>.';

    expect(addressAt(text, 'someone')).toBe('mailto:someone@example.com');
    expect(addressAt(text, 'www.')).toBe('http://www.example.com');
    expect(addressAt(text, 'https')).toBe('https://example.com/a');
  });

  it('an escaped character in an address opens without its backslash', () => {
    expect(addressAt('A [file](my\\_notes.md).', 'file')).toBe('my_notes.md');
  });

  it('text outside links and a lone bracketed word have no address', () => {
    const text = 'Press [Enter] in ![a picture](picture.png).';

    expect(addressAt(text, 'Press')).toBeUndefined();
    expect(addressAt(text, 'Enter')).toBeUndefined();
    expect(addressAt(text, 'picture]')).toBeUndefined();
  });
});
