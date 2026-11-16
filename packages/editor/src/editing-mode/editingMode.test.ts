import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceEditor, type SourceEditor, type SourceEditorOptions } from '../createSourceEditor';
import { editingModeOf } from './editingMode';

let editor: SourceEditor | undefined;

function openEditor(options: Partial<SourceEditorOptions> = {}) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const onChange = vi.fn();
  editor = createSourceEditor({
    parent,
    text: 'One two three four',
    label: 'Source of Guide.md',
    phrases: {},
    onChange,
    ...options,
  });
  const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>('.cm-editor') ?? parent);
  if (!view) throw new Error('The editor view was not created');
  return { editor, view, onChange };
}

describe('the editing mode', () => {
  afterEach(() => {
    editor?.destroy();
    document.body.innerHTML = '';
  });

  it('starts in Source unless told otherwise', () => {
    expect(openEditor().editor.editingMode()).toBe('source');
    editor?.destroy();
    expect(openEditor({ editingMode: 'richText' }).editor.editingMode()).toBe('richText');
  });

  it('switching modes dispatches no document change', () => {
    const { editor: opened, view, onChange } = openEditor();
    const documentBefore = view.state.doc;

    opened.setEditingMode('richText');
    opened.setEditingMode('source');

    expect(view.state.doc).toBe(documentBefore);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switching modes keeps the selection and the undo history', () => {
    const { editor: opened, view } = openEditor();
    view.dispatch({ changes: { from: 3, insert: ' new' }, userEvent: 'input.type' });
    view.dispatch({ selection: EditorSelection.single(8, 12) });

    opened.setEditingMode('richText');

    expect(view.state.selection.main).toMatchObject({ anchor: 8, head: 12 });
    opened.run('undo');
    expect(opened.text()).toBe('One two three four');
  });

  it('the mode facet reports Rich text after a switch', () => {
    const onEditingModeChange = vi.fn();
    const { editor: opened, view } = openEditor({ onEditingModeChange });

    opened.setEditingMode('richText');
    opened.setEditingMode('richText');

    expect(editingModeOf(view.state)).toBe('richText');
    expect(opened.editingMode()).toBe('richText');
    expect(onEditingModeChange.mock.calls).toEqual([['richText']]);
  });
});
