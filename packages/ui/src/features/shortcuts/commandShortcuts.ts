import type { MessageKey, Translator } from '@mdx/i18n';
import type { DesktopPlatform, ViewerCommand } from '../viewer/viewerCommands';
import { describeCombination, isModifier, type KeyCombination } from './describeCombination';

export interface CommandShortcut {
  readonly command: ViewerCommand;
  readonly combinations: readonly KeyCombination[];
  readonly actionKey: MessageKey;
}

export type ShortcutKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'isComposing'
>;

export const COMMAND_SHORTCUTS: readonly CommandShortcut[] = [
  { command: { kind: 'openDocuments' }, combinations: [['ctrl', 'O']], actionKey: 'menu.file.open' },
  { command: { kind: 'saveDocument' }, combinations: [['ctrl', 'S']], actionKey: 'menu.file.save' },
  {
    command: { kind: 'saveDocumentAs' },
    combinations: [['ctrl', 'shift', 'S']],
    actionKey: 'menu.file.saveAs',
  },
  {
    command: { kind: 'saveAllDocuments' },
    combinations: [['ctrl', 'alt', 'S']],
    actionKey: 'menu.file.saveAll',
  },
  {
    command: { kind: 'closeActiveTab' },
    combinations: [
      ['ctrl', 'W'],
      ['ctrl', 'F4'],
    ],
    actionKey: 'menu.file.closeTab',
  },
  {
    command: { kind: 'reopenClosedTab' },
    combinations: [['ctrl', 'shift', 'T']],
    actionKey: 'tabs.reopenClosed',
  },
  {
    command: { kind: 'toggleFavourite' },
    combinations: [['ctrl', 'D']],
    actionKey: 'menu.file.toggleFavourite',
  },
  { command: { kind: 'print' }, combinations: [['ctrl', 'P']], actionKey: 'menu.file.print' },
  { command: { kind: 'showFind' }, combinations: [['ctrl', 'F']], actionKey: 'menu.edit.find' },
  {
    command: { kind: 'showPasteTable' },
    combinations: [['ctrl', 'alt', 'V']],
    actionKey: 'menu.edit.pasteTable',
  },
  {
    command: { kind: 'zoomIn' },
    combinations: [
      ['ctrl', '+'],
      ['ctrl', '='],
    ],
    actionKey: 'menu.view.zoomIn',
  },
  { command: { kind: 'zoomOut' }, combinations: [['ctrl', '-']], actionKey: 'menu.view.zoomOut' },
  { command: { kind: 'resetZoom' }, combinations: [['ctrl', '0']], actionKey: 'menu.view.resetZoom' },
  {
    command: { kind: 'toggleSourceView' },
    combinations: [['ctrl', 'U']],
    actionKey: 'menu.view.toggleSource',
  },
  {
    command: { kind: 'toggleSidebar' },
    combinations: [['ctrl', 'shift', 'E']],
    actionKey: 'menu.view.toggleSidebar',
  },
  {
    command: { kind: 'toggleOutline' },
    combinations: [['ctrl', 'shift', 'O']],
    actionKey: 'menu.view.toggleOutline',
  },
  { command: { kind: 'nextTab' }, combinations: [['ctrl', 'Tab']], actionKey: 'menu.window.nextTab' },
  {
    command: { kind: 'previousTab' },
    combinations: [['ctrl', 'shift', 'Tab']],
    actionKey: 'menu.window.previousTab',
  },
  {
    command: { kind: 'moveActiveTab', step: -1 },
    combinations: [['ctrl', 'shift', 'PageUp']],
    actionKey: 'menu.window.moveTabLeft',
  },
  {
    command: { kind: 'moveActiveTab', step: 1 },
    combinations: [['ctrl', 'shift', 'PageDown']],
    actionKey: 'menu.window.moveTabRight',
  },
  {
    command: { kind: 'toggleEditing' },
    combinations: [['ctrl', '/']],
    actionKey: 'menu.view.toggleEditing',
  },
  {
    command: { kind: 'showCommandPalette' },
    combinations: [['ctrl', 'shift', 'P']],
    actionKey: 'menu.view.commandPalette',
  },
  {
    command: { kind: 'showKeyboardShortcuts' },
    combinations: [['F1']],
    actionKey: 'menu.help.keyboardShortcuts',
  },
];

const TAB_NUMBER_KEY = /^[1-9]$/;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

export function commandForShortcut(
  event: ShortcutKeyEvent,
  platform: DesktopPlatform,
): ViewerCommand | undefined {
  if (event.isComposing) return undefined;
  if (isTabNumberShortcut(event, platform))
    return { kind: 'activateTabNumber', numberKey: Number(event.key) };
  return COMMAND_SHORTCUTS.find((shortcut) =>
    shortcut.combinations.some((combination) => matchesCombination(event, combination, platform)),
  )?.command;
}

/** The first key combination for a command, as shown next to menu items. */
export function shortcutLabelFor(command: ViewerCommand, translator: Translator): string | undefined {
  const commandKey = JSON.stringify(command);
  const shortcut = COMMAND_SHORTCUTS.find((candidate) => JSON.stringify(candidate.command) === commandKey);
  const combination = shortcut?.combinations[0];
  return combination ? describeCombination(combination, translator) : undefined;
}

function isTabNumberShortcut(event: ShortcutKeyEvent, platform: DesktopPlatform): boolean {
  const isCommandModifierPressed = platform === 'macos' ? event.metaKey : event.ctrlKey;
  return isCommandModifierPressed && !event.shiftKey && !event.altKey && TAB_NUMBER_KEY.test(event.key);
}

function matchesCombination(
  event: ShortcutKeyEvent,
  combination: KeyCombination,
  platform: DesktopPlatform,
): boolean {
  const key = combination.at(-1) ?? '';
  const modifiers = combination.filter(isModifier);
  // macOS keeps Control+Tab for switching tabs, as browsers do.
  const isCommandKeyUsed = platform === 'macos' && key !== 'Tab';
  const isCtrlPressed = isCommandKeyUsed ? event.metaKey : event.ctrlKey;
  const isOtherPlatformModifierPressed = isCommandKeyUsed ? event.ctrlKey : event.metaKey;
  if (isOtherPlatformModifierPressed) return false;
  if (isCtrlPressed !== modifiers.includes('ctrl') || event.altKey !== modifiers.includes('alt'))
    return false;
  if (!isShiftProducedSymbol(key) && event.shiftKey !== modifiers.includes('shift')) return false;
  return event.key.toLowerCase() === key.toLowerCase();
}

/** Symbols such as `+` need Shift on some keyboards but not on others or on the numeric keypad. */
function isShiftProducedSymbol(key: string): boolean {
  return key.length === 1 && !LETTER_OR_DIGIT.test(key);
}
