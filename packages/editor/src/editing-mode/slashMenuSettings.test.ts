import { completionStatus, currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceEditor, type SourceEditor, type SourceEditorOptions } from '../createSourceEditor';

let editor: SourceEditor | undefined;

function openEditor(options: Partial<SourceEditorOptions>) {
  const parent = document.createElement('div');
  document.body.append(parent);
  editor = createSourceEditor({
    parent,
    text: '',
    label: 'Source',
    phrases: {},
    onChange: vi.fn(),
    ...options,
  });
  const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>('.cm-editor') ?? parent);
  if (!view) throw new Error('The editor view was not created');
  return { editor, view };
}

/** Types a slash at the start of a line and asks for completions, as typing does after a pause. */
async function isInsertMenuOpenedBySlash(view: EditorView): Promise<boolean> {
  view.dispatch({
    changes: { from: view.state.doc.length, insert: '\n/' },
    selection: EditorSelection.cursor(view.state.doc.length + 2),
    userEvent: 'input.type',
  });
  if (!startCompletion(view)) return false;
  await vi.waitFor(() => expect(completionStatus(view.state)).not.toBe('pending'));
  return currentCompletions(view.state).length > 0;
}

const APP_DEFAULTS = { isInRichText: true, isInSource: false };

describe('the insert menu in each editing mode', () => {
  afterEach(() => {
    editor?.destroy();
    editor = undefined;
    document.body.innerHTML = '';
  });

  it('slash opens the menu in Rich text by default', async () => {
    const { view } = openEditor({ editingMode: 'richText', slashMenu: APP_DEFAULTS });

    expect(await isInsertMenuOpenedBySlash(view)).toBe(true);
  });

  it('turning the Rich text setting off stops the menu in Rich text only', async () => {
    const { editor: opened, view } = openEditor({
      editingMode: 'richText',
      slashMenu: { isInRichText: true, isInSource: true },
    });

    opened.setSlashMenuSettings({ isInRichText: false, isInSource: true });
    const isOpenInRichText = await isInsertMenuOpenedBySlash(view);
    opened.setEditingMode('source');

    expect(isOpenInRichText).toBe(false);
    expect(await isInsertMenuOpenedBySlash(view)).toBe(true);
  });

  it('switching mode reconfigures the insert menu', async () => {
    const { editor: opened, view } = openEditor({ editingMode: 'richText', slashMenu: APP_DEFAULTS });

    opened.setEditingMode('source');
    const isOpenInSource = await isInsertMenuOpenedBySlash(view);
    opened.setEditingMode('richText');

    expect(isOpenInSource).toBe(false);
    expect(await isInsertMenuOpenedBySlash(view)).toBe(true);
  });
});
