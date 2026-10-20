import { EDITOR_SHORTCUTS } from '@mdx/editor/shortcuts';
import type { MessageKey } from '@mdx/i18n';
import { COMMAND_SHORTCUTS } from '../shortcuts/commandShortcuts';
import type { KeyCombination } from '../shortcuts/describeCombination';

export interface KeyboardShortcut {
  readonly combinations: readonly KeyCombination[];
  readonly actionKey: MessageKey;
}

const SHORTCUTS_HANDLED_IN_PLACE: readonly KeyboardShortcut[] = [
  { combinations: [['ctrl', 'C']], actionKey: 'menu.edit.copy' },
  { combinations: [['ctrl', 'A']], actionKey: 'menu.edit.selectAll' },
  { combinations: [['ctrl', '1–9']], actionKey: 'shortcuts.tabByNumber' },
  { combinations: [['F3'], ['shift', 'F3']], actionKey: 'shortcuts.findNext' },
  { combinations: [['ctrl', 'wheel']], actionKey: 'shortcuts.zoomWithWheel' },
  { combinations: [['F2']], actionKey: 'shortcuts.renameFavourite' },
  {
    combinations: [
      ['alt', '↑'],
      ['alt', '↓'],
    ],
    actionKey: 'shortcuts.moveFavourite',
  },
  { combinations: [['shift', 'F10']], actionKey: 'shortcuts.contextMenu' },
  { combinations: [['alt', 'F4']], actionKey: 'menu.file.exit' },
  { combinations: [['ctrl', 'Z']], actionKey: 'menu.edit.undo' },
  { combinations: [['ctrl', 'Y']], actionKey: 'menu.edit.redo' },
  { combinations: [['ctrl', 'H']], actionKey: 'menu.edit.replace' },
  { combinations: [['ctrl', 'G']], actionKey: 'menu.edit.goToLine' },
];

const EDITOR_FORMATTING_SHORTCUTS: readonly KeyboardShortcut[] = EDITOR_SHORTCUTS.map(
  ({ action, combination }) => ({ combinations: [combination], actionKey: `editor.action.${action}` }),
);

export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcut[] = [
  ...COMMAND_SHORTCUTS.map(({ combinations, actionKey }) => ({ combinations, actionKey })),
  ...SHORTCUTS_HANDLED_IN_PLACE,
  ...EDITOR_FORMATTING_SHORTCUTS,
];
