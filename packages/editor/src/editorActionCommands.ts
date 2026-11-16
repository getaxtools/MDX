import type { StateCommand } from '@codemirror/state';
import type { Command } from '@codemirror/view';
import { choosePictureFiles } from './attachments/pictureRequests';
import { moveBlockCommand } from './blocks/moveBlocks';
import { HEADING_LEVELS, type EditorAction } from './editorShortcuts';
import { insertCodeBlock, insertHorizontalRule, insertLink } from './formatting/insertBlocks';
import { toggleHeading, toggleLinePrefix } from './formatting/lineFormatting';
import { toggleInlineFormat } from './formatting/inlineFormatting';
import { startFormula } from './formulas/formulaRequests';

/** What each editing key does in the source editor. */
export const EDITOR_ACTION_COMMANDS: Readonly<Record<EditorAction, Command>> = {
  bold: toggleInlineFormat('strong'),
  italic: toggleInlineFormat('emphasis'),
  strikethrough: toggleInlineFormat('strikethrough'),
  inlineCode: toggleInlineFormat('inlineCode'),
  link: insertLink,
  ...headingCommands(),
  bulletList: toggleLinePrefix('bulletList'),
  numberedList: toggleLinePrefix('numberedList'),
  taskList: toggleLinePrefix('taskList'),
  quote: toggleLinePrefix('quote'),
  codeBlock: insertCodeBlock,
  horizontalRule: insertHorizontalRule,
  insertImage: choosePictureFiles,
  inlineMath: startFormula('inline'),
  displayMath: startFormula('display'),
  moveBlockUp: moveBlockCommand('up'),
  moveBlockDown: moveBlockCommand('down'),
};

type HeadingAction = Extract<EditorAction, `heading${string}`>;

function headingCommands(): Record<HeadingAction, StateCommand> {
  const entries = HEADING_LEVELS.map((level) => [`heading${String(level)}`, toggleHeading(level)]);
  return Object.fromEntries(entries) as Record<HeadingAction, StateCommand>;
}
