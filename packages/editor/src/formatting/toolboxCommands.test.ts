import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import type { ToolboxAction } from '../editorShortcuts';
import { BUILT_IN_SLASH_ITEMS } from '../slash-menu/slashMenuItems';
import { markdownSyntax } from '../syntax/markdownSyntax';
import { runToolboxAction } from './toolboxCommands';

function textAfterToolbox(action: ToolboxAction, doc: string, caret: number): string {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(caret),
      extensions: [markdownSyntax()],
    }),
  });
  runToolboxAction(view, action);
  const text = view.state.doc.toString();
  view.destroy();
  return text;
}

function textFromInsertMenu(itemId: string): string {
  const item = BUILT_IN_SLASH_ITEMS.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error(`No insert menu item ${itemId}`);
  const state = EditorState.create({ doc: '/', extensions: [markdownSyntax()] });
  return state.update(item.insert(state, { from: 0, to: 1 })).state.doc.toString();
}

describe('toolbox commands', () => {
  it.each(['table', 'inlineMath', 'displayMath'] as const)(
    'the %s button inserts what the insert menu item of the same name inserts',
    (action) => {
      expect(textAfterToolbox(action, '', 0)).toBe(textFromInsertMenu(action));
    },
  );

  it('Paragraph turns a heading back into text', () => {
    expect(textAfterToolbox('paragraph', '## Results', 4)).toBe('Results');
  });

  it('a button with a key runs the same command as the key', () => {
    expect(textAfterToolbox('heading2', 'Results', 0)).toBe('## Results');
  });
});
