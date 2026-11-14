import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { createSourceEditor, type SourceEditor } from '../createSourceEditor';
import { EDITOR_ACTION_COMMANDS } from '../editorActionCommands';

let editor: SourceEditor | undefined;

function openEditor(text: string) {
  const parent = document.createElement('div');
  document.body.append(parent);
  editor = createSourceEditor({ parent, text, label: 'Source', phrases: {}, onChange: () => undefined });
  const view = EditorView.findFromDOM(parent);
  if (!view) throw new Error('no editor view');
  const textBox = parent.querySelector('[contenteditable="true"]') ?? parent;
  return { view, textBox };
}

function press(target: Element, key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
  target.dispatchEvent(event);
  return event;
}

describe('multiple cursors', () => {
  afterEach(() => {
    editor?.destroy();
    document.body.innerHTML = '';
  });

  it('keeps several selections at once', () => {
    const { view } = openEditor('one\ntwo\nthree');

    view.dispatch({
      selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(4)]),
    });

    expect(view.state.selection.ranges).toHaveLength(2);
  });

  it('Ctrl+Shift+L selects every occurrence', () => {
    const { view, textBox } = openEditor('one two one');
    view.dispatch({ selection: EditorSelection.single(0, 3) });

    press(textBox, 'l', { ctrlKey: true, shiftKey: true });

    expect(view.state.selection.ranges.map((range) => [range.from, range.to])).toEqual([
      [0, 3],
      [8, 11],
    ]);
  });

  it('Escape keeps the main cursor', () => {
    const { view, textBox } = openEditor('one\ntwo');
    view.dispatch({
      selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(4)], 1),
    });

    press(textBox, 'Escape');

    expect(view.state.selection.ranges.map((range) => range.head)).toEqual([4]);
  });

  it('Alt+click adds a range and Ctrl+click does not', () => {
    const { view } = openEditor('one');
    const addsRange = view.state.facet(EditorView.clickAddsSelectionRange);

    const altClick = new MouseEvent('mousedown', { altKey: true });
    const ctrlClick = new MouseEvent('mousedown', { ctrlKey: true });

    expect(addsRange.some((test) => test(altClick))).toBe(true);
    expect(addsRange.some((test) => test(ctrlClick))).toBe(false);
  });

  it('bold at three ranges is one undo step', () => {
    const { view } = openEditor('a b c');
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.range(0, 1),
        EditorSelection.range(2, 3),
        EditorSelection.range(4, 5),
      ]),
    });

    EDITOR_ACTION_COMMANDS.bold(view);
    expect(view.state.doc.toString()).toBe('**a** **b** **c**');
    editor?.run('undo');

    expect(view.state.doc.toString()).toBe('a b c');
  });

  it('code block insert acts on the main range', () => {
    const { view } = openEditor('one\n\ntwo');
    view.dispatch({
      selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(4)], 1),
    });

    EDITOR_ACTION_COMMANDS.codeBlock(view);

    expect(view.state.doc.toString()).toBe('one\n```\n\n```\ntwo');
  });
});
