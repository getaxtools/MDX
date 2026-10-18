import type { MessageKey, Translator } from '@mdx/i18n';

type Modifier = 'ctrl' | 'shift' | 'alt';

export interface KeyboardShortcut {
  /** Alternative key combinations, each a list of modifiers followed by one key. */
  readonly combinations: readonly (readonly string[])[];
  readonly actionKey: MessageKey;
}

export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcut[] = [
  { combinations: [['ctrl', 'O']], actionKey: 'menu.file.open' },
  {
    combinations: [
      ['ctrl', 'W'],
      ['ctrl', 'F4'],
    ],
    actionKey: 'menu.file.closeTab',
  },
  { combinations: [['ctrl', 'shift', 'T']], actionKey: 'tabs.reopenClosed' },
  {
    combinations: [
      ['ctrl', 'Tab'],
      ['ctrl', 'shift', 'Tab'],
    ],
    actionKey: 'shortcuts.switchTab',
  },
  { combinations: [['ctrl', '1–9']], actionKey: 'shortcuts.tabByNumber' },
  {
    combinations: [
      ['ctrl', 'shift', 'PageUp'],
      ['ctrl', 'shift', 'PageDown'],
    ],
    actionKey: 'shortcuts.moveTab',
  },
  { combinations: [['ctrl', 'D']], actionKey: 'favourites.toggle' },
  { combinations: [['ctrl', 'F']], actionKey: 'menu.edit.find' },
  { combinations: [['F3'], ['shift', 'F3']], actionKey: 'shortcuts.findNext' },
  { combinations: [['ctrl', 'P']], actionKey: 'menu.file.print' },
  { combinations: [['ctrl', 'U']], actionKey: 'menu.view.toggleSource' },
  { combinations: [['ctrl', '=']], actionKey: 'menu.view.zoomIn' },
  { combinations: [['ctrl', '-']], actionKey: 'menu.view.zoomOut' },
  { combinations: [['ctrl', '0']], actionKey: 'menu.view.resetZoom' },
  { combinations: [['ctrl', 'B']], actionKey: 'menu.view.toggleSidebar' },
  { combinations: [['ctrl', 'shift', 'O']], actionKey: 'menu.view.toggleOutline' },
  { combinations: [['F2']], actionKey: 'shortcuts.renameFavourite' },
  {
    combinations: [
      ['alt', '↑'],
      ['alt', '↓'],
    ],
    actionKey: 'shortcuts.moveFavourite',
  },
  { combinations: [['shift', 'F10']], actionKey: 'shortcuts.contextMenu' },
  { combinations: [['F1']], actionKey: 'menu.help.keyboardShortcuts' },
];

const MODIFIER_LABELS: Readonly<Record<Modifier, MessageKey>> = {
  ctrl: 'keys.ctrl',
  shift: 'keys.shift',
  alt: 'keys.alt',
};

export function describeCombination(combination: readonly string[], translator: Translator): string {
  return combination
    .map((part) =>
      Object.hasOwn(MODIFIER_LABELS, part) ? translator.translate(MODIFIER_LABELS[part as Modifier]) : part,
    )
    .join('+');
}
