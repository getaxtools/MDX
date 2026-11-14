import type { StateCommand } from '@codemirror/state';
import type { Command } from '@codemirror/view';
import { moveBlockCommand } from './blocks/moveBlocks';
import { HEADING_LEVELS, type EditorAction } from './editorShortcuts';
import { insertCodeBlock, insertHorizontalRule, insertLink } from './formatting/insertBlocks';
import { toggleHeading, toggleLinePrefix } from './formatting/lineFormatting';
import { toggleInlineMarker } from './formatting/toggleInlineMarker';

/** What each editing key does in the source editor. */
export const EDITOR_ACTION_COMMANDS: Readonly<Record<EditorAction, Command>> = {
  bold: toggleInlineMarker('**'),
  italic: toggleInlineMarker('*'),
  strikethrough: toggleInlineMarker('~~'),
  inlineCode: toggleInlineMarker('`'),
  link: insertLink,
  ...headingCommands(),
  bulletList: toggleLinePrefix('bulletList'),
  numberedList: toggleLinePrefix('numberedList'),
  taskList: toggleLinePrefix('taskList'),
  quote: toggleLinePrefix('quote'),
  codeBlock: insertCodeBlock,
  horizontalRule: insertHorizontalRule,
  moveBlockUp: moveBlockCommand('up'),
  moveBlockDown: moveBlockCommand('down'),
};

type HeadingAction = Extract<EditorAction, `heading${string}`>;

function headingCommands(): Record<HeadingAction, StateCommand> {
  const entries = HEADING_LEVELS.map((level) => [`heading${String(level)}`, toggleHeading(level)]);
  return Object.fromEntries(entries) as Record<HeadingAction, StateCommand>;
}
