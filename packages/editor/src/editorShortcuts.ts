export type EditorAction =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inlineCode'
  | 'link'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'bulletList'
  | 'numberedList'
  | 'taskList'
  | 'quote'
  | 'codeBlock'
  | 'horizontalRule';

export interface EditorShortcut {
  readonly action: EditorAction;
  /** The key in CodeMirror's notation, where `Mod` is Ctrl, or Cmd on macOS. */
  readonly key: string;
  /** The same key for display, in the app's shortcut table notation. */
  readonly combination: readonly string[];
}

const MAX_HEADING_LEVEL = 6;

export const HEADING_LEVELS: readonly number[] = Array.from(
  { length: MAX_HEADING_LEVEL },
  (_, index) => index + 1,
);

/**
 * The formatting keys of the source editor. The help dialog lists them from here, so this module
 * stays free of CodeMirror and the editor itself loads only when a document is edited.
 */
export const EDITOR_SHORTCUTS: readonly EditorShortcut[] = [
  { action: 'bold', key: 'Mod-b', combination: ['ctrl', 'B'] },
  { action: 'italic', key: 'Mod-i', combination: ['ctrl', 'I'] },
  { action: 'strikethrough', key: 'Mod-Shift-x', combination: ['ctrl', 'shift', 'X'] },
  { action: 'inlineCode', key: 'Mod-e', combination: ['ctrl', 'E'] },
  { action: 'link', key: 'Mod-k', combination: ['ctrl', 'K'] },
  ...HEADING_LEVELS.map((level) => ({
    action: `heading${String(level)}` as EditorAction,
    key: `Mod-${String(level)}`,
    combination: ['ctrl', String(level)],
  })),
  { action: 'bulletList', key: 'Mod-Shift-8', combination: ['ctrl', 'shift', '8'] },
  { action: 'numberedList', key: 'Mod-Shift-7', combination: ['ctrl', 'shift', '7'] },
  { action: 'taskList', key: 'Mod-Shift-9', combination: ['ctrl', 'shift', '9'] },
  { action: 'quote', key: 'Mod-Shift-.', combination: ['ctrl', 'shift', '.'] },
  { action: 'codeBlock', key: 'Mod-Shift-c', combination: ['ctrl', 'shift', 'C'] },
  { action: 'horizontalRule', key: 'Mod-Shift--', combination: ['ctrl', 'shift', '-'] },
];
