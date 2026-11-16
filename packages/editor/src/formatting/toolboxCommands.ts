import type { EditorView } from '@codemirror/view';
import { EDITOR_ACTION_COMMANDS } from '../editorActionCommands';
import type { EditorAction, ToolboxAction } from '../editorShortcuts';
import { BUILT_IN_SLASH_ITEMS } from '../slash-menu/slashMenuItems';
import { toParagraph } from './lineFormatting';

/** Toolbox inserts without a key of their own write exactly what the insert menu item of the same name writes. */
const INSERT_MENU_ITEMS: Readonly<Partial<Record<ToolboxAction, string>>> = {
  table: 'table',
  inlineMath: 'inlineMath',
  displayMath: 'displayMath',
};

function insertMenuItem(view: EditorView, itemId: string): void {
  const item = BUILT_IN_SLASH_ITEMS.find((candidate) => candidate.id === itemId);
  if (!item) return;
  const { from, to } = view.state.selection.main;
  view.dispatch(item.insert(view.state, { from, to }), { userEvent: 'input.format', scrollIntoView: true });
}

function isEditorAction(action: ToolboxAction): action is EditorAction {
  return Object.hasOwn(EDITOR_ACTION_COMMANDS, action);
}

/** Runs a Formatting toolbar control on the editor's selection. */
export function runToolboxAction(view: EditorView, action: ToolboxAction): void {
  const insertItemId = INSERT_MENU_ITEMS[action];
  if (insertItemId !== undefined) insertMenuItem(view, insertItemId);
  else if (isEditorAction(action)) EDITOR_ACTION_COMMANDS[action](view);
  else toParagraph(view);
}
