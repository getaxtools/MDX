import type { EditorView } from '@codemirror/view';
import { EDITOR_ACTION_COMMANDS } from '../editorActionCommands';
import type { EditorAction, ToolboxAction } from '../editorShortcuts';
import { startFormula } from '../formulas/formulaRequests';
import { insertMenuItemAtSelection } from '../slash-menu/slashMenuItems';
import { toParagraph } from './lineFormatting';

function isEditorAction(action: ToolboxAction): action is EditorAction {
  return Object.hasOwn(EDITOR_ACTION_COMMANDS, action);
}

/** Runs a Formatting toolbar control on the editor's selection. */
export function runToolboxAction(view: EditorView, action: ToolboxAction): void {
  if (action === 'table' || action === 'callout') insertMenuItemAtSelection(view, action);
  else if (action === 'formula') startFormula(undefined)(view);
  else if (isEditorAction(action)) EDITOR_ACTION_COMMANDS[action](view);
  else toParagraph(view);
}
