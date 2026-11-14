import { indentWithTab } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { isInFieldMode, snippetFields, snippetInsertion, type SnippetExpander } from './snippetFields';

const OWNER_AND_TITLE: SnippetExpander = () => ({
  text: 'title by owner',
  fields: [
    { from: 0, to: 5 },
    { from: 9, to: 14 },
  ],
});

let view: EditorView | undefined;

function openView(doc = '') {
  const parent = document.createElement('div');
  document.body.append(parent);
  view = new EditorView({
    parent,
    state: EditorState.create({ doc, extensions: [snippetFields(), keymap.of([indentWithTab])] }),
  });
  return view;
}

function press(target: EditorView, key: string, modifiers: KeyboardEventInit = {}) {
  target.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
  );
}

const selected = (target: EditorView) =>
  target.state.sliceDoc(target.state.selection.main.from, target.state.selection.main.to);

describe('snippet fields', () => {
  afterEach(() => {
    view?.destroy();
    document.body.innerHTML = '';
  });

  it('first field selected after insert', () => {
    const editor = openView();

    editor.dispatch(snippetInsertion(editor.state, { from: 0, to: 0 }, OWNER_AND_TITLE));

    expect(editor.state.doc.toString()).toBe('title by owner');
    expect(selected(editor)).toBe('title');
    expect(isInFieldMode(editor.state)).toBe(true);
  });

  it('Tab moves to the next field, which follows typing in the first', () => {
    const editor = openView();
    editor.dispatch(snippetInsertion(editor.state, { from: 0, to: 0 }, OWNER_AND_TITLE));
    editor.dispatch(editor.state.replaceSelection('Plan'));

    press(editor, 'Tab');

    expect(editor.state.doc.toString()).toBe('Plan by owner');
    expect(selected(editor)).toBe('owner');
  });

  it('Tab after the last field indents', () => {
    const editor = openView();
    editor.dispatch(snippetInsertion(editor.state, { from: 0, to: 0 }, OWNER_AND_TITLE));
    press(editor, 'Tab');
    editor.dispatch({ selection: EditorSelection.cursor(editor.state.doc.length) });

    press(editor, 'Tab');

    expect(isInFieldMode(editor.state)).toBe(false);
    expect(editor.state.doc.toString()).toBe('  title by owner');
  });

  it('Escape ends field mode', () => {
    const editor = openView();
    editor.dispatch(snippetInsertion(editor.state, { from: 0, to: 0 }, OWNER_AND_TITLE));

    press(editor, 'Escape');

    expect(isInFieldMode(editor.state)).toBe(false);
  });

  it('a snippet without fields puts the caret after it and uses the selected text', () => {
    const editor = openView('pick');
    editor.dispatch({ selection: EditorSelection.single(0, 4) });

    editor.dispatch(
      snippetInsertion(editor.state, { from: 0, to: 4 }, (selection) => ({
        text: `**${selection}**`,
        fields: [],
      })),
    );

    expect(editor.state.doc.toString()).toBe('**pick**');
    expect(editor.state.selection.main.head).toBe(8);
  });
});
