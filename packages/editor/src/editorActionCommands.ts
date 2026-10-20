import type { StateCommand } from '@codemirror/state';
import { HEADING_LEVELS, type EditorAction } from './editorShortcuts';
import { insertCodeBlock, insertHorizontalRule, insertLink } from './formatting/insertBlocks';
import { toggleHeading, toggleLinePrefix } from './formatting/lineFormatting';
import { toggleInlineMarker } from './formatting/toggleInlineMarker';

/** What each formatting key does in the source editor. */
export const EDITOR_ACTION_COMMANDS: Readonly<Record<EditorAction, StateCommand>> = {
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
};

type HeadingAction = Extract<EditorAction, `heading${string}`>;

function headingCommands(): Record<HeadingAction, StateCommand> {
  const entries = HEADING_LEVELS.map((level) => [`heading${String(level)}`, toggleHeading(level)]);
  return Object.fromEntries(entries) as Record<HeadingAction, StateCommand>;
}
