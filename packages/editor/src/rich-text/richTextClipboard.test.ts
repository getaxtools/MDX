import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceEditor, type SourceEditor } from '../createSourceEditor';

let editor: SourceEditor | undefined;

function openRichText(text: string) {
  const parent = document.createElement('div');
  document.body.append(parent);
  editor = createSourceEditor({
    parent,
    text,
    label: 'Source',
    phrases: {},
    onChange: vi.fn(),
    editingMode: 'richText',
  });
  const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>('.cm-editor') ?? parent);
  if (!view) throw new Error('The editor view was not created');
  // CodeMirror copies only while the page's selection is in the editor.
  view.focus();
  return view;
}

/** A copy or cut event with a clipboard that records what the editor puts on it. */
function clipboardEvent(type: 'copy' | 'cut') {
  const written = new Map<string, string>();
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      clearData: () => written.clear(),
      setData: (format: string, value: string) => written.set(format, value),
      getData: (format: string) => written.get(format) ?? '',
    },
  });
  return { event, written };
}

describe('the clipboard in Rich text', () => {
  afterEach(() => {
    editor?.destroy();
    editor = undefined;
    document.body.innerHTML = '';
  });

  it('copy of a line with bold text gives its markers', () => {
    const view = openRichText('Use **bold** here\n\nEnd');
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });
    view.dispatch({ selection: EditorSelection.single(0, 'Use **bold** here'.length) });
    const { event, written } = clipboardEvent('copy');

    view.contentDOM.dispatchEvent(event);

    expect(written.get('text/plain')).toBe('Use **bold** here');
  });

  it('cut of a link gives its Markdown and removes it', () => {
    const view = openRichText('See [the guide](guide.md) now');
    view.dispatch({ selection: EditorSelection.single('See '.length, 'See [the guide](guide.md)'.length) });
    const { event, written } = clipboardEvent('cut');

    view.contentDOM.dispatchEvent(event);

    expect(written.get('text/plain')).toBe('[the guide](guide.md)');
    expect(view.state.doc.toString()).toBe('See  now');
  });
});
