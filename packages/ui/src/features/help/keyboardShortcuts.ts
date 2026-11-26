import type { CtrlWheelAction } from '@mdx/core';
import { EDITOR_SHORTCUTS } from '@mdx/editor/shortcuts';
import type { MessageKey, Translator } from '@mdx/i18n';
import { COMMAND_SHORTCUTS, type CommandShortcut } from '../shortcuts/commandShortcuts';
import { describeCombination, type KeyCombination } from '../shortcuts/describeCombination';

export interface KeyboardShortcut {
  readonly combinations: readonly KeyCombination[];
  readonly actionKey: MessageKey;
}

export const SHORTCUTS_HANDLED_IN_PLACE: readonly KeyboardShortcut[] = [
  { combinations: [['ctrl', 'C']], actionKey: 'menu.edit.copy' },
  { combinations: [['ctrl', 'A']], actionKey: 'menu.edit.selectAll' },
  { combinations: [['ctrl', 'shift', 'V']], actionKey: 'menu.edit.pastePlainText' },
  { combinations: [['ctrl', '1–9']], actionKey: 'shortcuts.tabByNumber' },
  { combinations: [['F3'], ['shift', 'F3']], actionKey: 'shortcuts.findNext' },
  { combinations: [['F2']], actionKey: 'shortcuts.renameFavourite' },
  {
    combinations: [
      ['alt', 'ArrowUp'],
      ['alt', 'ArrowDown'],
    ],
    actionKey: 'shortcuts.moveFavourite',
  },
  { combinations: [['shift', 'F10']], actionKey: 'shortcuts.contextMenu' },
  { combinations: [['F6'], ['shift', 'F6']], actionKey: 'shortcuts.moveBetweenRegions' },
  { combinations: [['alt', 'F4']], actionKey: 'menu.file.exit' },
  { combinations: [['ctrl', 'Z']], actionKey: 'menu.edit.undo' },
  { combinations: [['ctrl', 'Y']], actionKey: 'menu.edit.redo' },
  { combinations: [['ctrl', 'H']], actionKey: 'menu.edit.replace' },
  { combinations: [['ctrl', 'G']], actionKey: 'menu.edit.goToLine' },
  {
    combinations: [
      ['ctrl', 'alt', 'ArrowUp'],
      ['ctrl', 'alt', 'ArrowDown'],
      ['alt', 'click'],
    ],
    actionKey: 'shortcuts.addCursor',
  },
  { combinations: [['alt', 'shift', 'drag']], actionKey: 'shortcuts.columnSelection' },
  { combinations: [['ctrl', 'shift', 'L']], actionKey: 'shortcuts.selectAllOccurrences' },
];

export const EDITOR_FORMATTING_SHORTCUTS: readonly KeyboardShortcut[] = EDITOR_SHORTCUTS.map(
  ({ action, combination }) => ({ combinations: [combination], actionKey: `editor.action.${action}` }),
);

const CTRL_WITH_WHEEL: KeyCombination = ['ctrl', 'wheel'];
const MOVE_BETWEEN_FILES: MessageKey = 'shortcuts.moveBetweenFiles';

/**
 * Every shortcut the Help list shows, with the keys each command has now, one row per action.
 * Ctrl with the mouse wheel is listed with what the setting makes it do.
 */
export function keyboardShortcutsWith(
  commandShortcuts: readonly CommandShortcut[] = COMMAND_SHORTCUTS,
  ctrlWheelAction: CtrlWheelAction = 'moveBetweenFiles',
): readonly KeyboardShortcut[] {
  const commandRows = rowPerAction(commandShortcuts).map((row) =>
    ctrlWheelAction === 'moveBetweenFiles' && row.actionKey === MOVE_BETWEEN_FILES
      ? { ...row, combinations: [...row.combinations, CTRL_WITH_WHEEL] }
      : row,
  );
  const wheelZoomRows: KeyboardShortcut[] =
    ctrlWheelAction === 'zoom'
      ? [{ combinations: [CTRL_WITH_WHEEL], actionKey: 'shortcuts.zoomWithWheel' }]
      : [];
  return [...commandRows, ...wheelZoomRows, ...SHORTCUTS_HANDLED_IN_PLACE, ...EDITOR_FORMATTING_SHORTCUTS];
}

/** Commands that share an action, such as the two directions of the file arc, share a row. */
function rowPerAction(commandShortcuts: readonly CommandShortcut[]): KeyboardShortcut[] {
  const rows = new Map<MessageKey, KeyCombination[]>();
  for (const { actionKey, combinations } of commandShortcuts)
    rows.set(actionKey, [...(rows.get(actionKey) ?? []), ...combinations]);
  return [...rows].map(([actionKey, combinations]) => ({ actionKey, combinations }));
}

/** The shortcuts whose action or keys contain the query, such as "save" or "ctrl+s". */
export function matchingShortcuts(
  query: string,
  translator: Translator,
  shortcuts: readonly KeyboardShortcut[] = keyboardShortcutsWith(),
): readonly KeyboardShortcut[] {
  const needle = query.trim().toLocaleLowerCase().replaceAll(' ', '');
  if (needle.length === 0) return shortcuts;
  return shortcuts.filter((shortcut) => {
    const action = translator.translate(shortcut.actionKey).toLocaleLowerCase().replaceAll(' ', '');
    const keys = shortcut.combinations.map((combination) =>
      describeCombination(combination, translator).toLocaleLowerCase(),
    );
    return action.includes(needle) || keys.some((key) => key.includes(needle));
  });
}
