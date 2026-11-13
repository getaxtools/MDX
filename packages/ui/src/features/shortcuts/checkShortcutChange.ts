import type { MessageKey } from '@mdx/i18n';
import {
  EDITOR_FORMATTING_SHORTCUTS,
  SHORTCUTS_HANDLED_IN_PLACE,
  type KeyboardShortcut,
} from '../help/keyboardShortcuts';
import { isShiftProducedSymbol, type CommandShortcut } from './commandShortcuts';
import { isModifier, type KeyCombination } from './describeCombination';
import { rebindableIdOf } from './rebindableCommands';

export type ShortcutRefusal =
  | { readonly reason: 'usedBy'; readonly actionKey: MessageKey }
  | { readonly reason: 'needsModifier' }
  | { readonly reason: 'altMenuKey' }
  | { readonly reason: 'notAllowed' };

export type ShortcutChangeCheck =
  | { readonly isAccepted: true; readonly hasKeyboardWarning: boolean }
  | { readonly isAccepted: false; readonly refusal: ShortcutRefusal };

const MODIFIER_ORDER: readonly string[] = ['ctrl', 'alt', 'shift'];
const FUNCTION_KEY = /^F([1-9]|1\d|2[0-4])$/;
const LETTER = /^\p{L}$/u;
const KEYS_NEEDING_CTRL: ReadonlySet<string> = new Set(['Tab', 'Enter', 'Backspace']);
const TAB_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const NOT_ALLOWED: ShortcutRefusal = { reason: 'notAllowed' };
const NEEDS_MODIFIER: ShortcutRefusal = { reason: 'needsModifier' };
const ALT_MENU_KEY: ShortcutRefusal = { reason: 'altMenuKey' };

const STANDARD_KEYS: readonly KeyboardShortcut[] = [
  { combinations: [['ctrl', 'X']], actionKey: 'menu.edit.cut' },
  { combinations: [['ctrl', 'V']], actionKey: 'menu.edit.paste' },
  { combinations: [['ctrl', 'shift', 'Z']], actionKey: 'menu.edit.redo' },
  { combinations: TAB_NUMBERS.map((digit) => ['ctrl', digit]), actionKey: 'shortcuts.tabByNumber' },
  { combinations: [['F10']], actionKey: 'shortcuts.menuBar' },
  { combinations: [['alt', 'Space']], actionKey: 'shortcuts.windowMenu' },
];

const TEXT_EDITING_KEYS: readonly KeyboardShortcut[] = [
  {
    combinations: [
      ['ctrl', 'shift', 'K'],
      ['ctrl', 'shift', 'L'],
      ['ctrl', 'shift', '\\'],
      ['ctrl', '['],
      ['ctrl', ']'],
      ['ctrl', 'Enter'],
      ['ctrl', 'Home'],
      ['ctrl', 'End'],
      ['ctrl', 'ArrowLeft'],
      ['ctrl', 'ArrowRight'],
      ['ctrl', 'shift', 'ArrowLeft'],
      ['ctrl', 'shift', 'ArrowRight'],
      ['ctrl', 'Backspace'],
      ['ctrl', 'Delete'],
      ['ctrl', 'alt', 'ArrowUp'],
      ['ctrl', 'alt', 'ArrowDown'],
    ],
    actionKey: 'shortcuts.editingText',
  },
];

const PLANNED_FEATURE_KEYS: readonly KeyboardShortcut[] = [
  { combinations: [['ctrl', 'alt', 'W']], actionKey: 'shortcuts.planned.switchWorkspace' },
  { combinations: [['ctrl', 'F1']], actionKey: 'shortcuts.planned.showToolbar' },
  { combinations: [['ctrl', '`']], actionKey: 'editor.action.inlineCode' },
  { combinations: [['ctrl', 'shift', 'Q']], actionKey: 'editor.action.quote' },
  { combinations: [['ctrl', 'shift', 'I']], actionKey: 'shortcuts.planned.insertImage' },
  { combinations: [['ctrl', 'shift', 'M']], actionKey: 'shortcuts.planned.displayMath' },
  { combinations: [['alt', '=']], actionKey: 'shortcuts.planned.inlineMath' },
  { combinations: [['ctrl', 'shift', 'V']], actionKey: 'shortcuts.planned.pastePlainText' },
];

const KEPT_SHORTCUTS: readonly KeyboardShortcut[] = [
  ...SHORTCUTS_HANDLED_IN_PLACE,
  ...STANDARD_KEYS,
  ...EDITOR_FORMATTING_SHORTCUTS,
  ...TEXT_EDITING_KEYS,
  ...PLANNED_FEATURE_KEYS,
];

/** Whether the user may give these keys to a command, given the keys every command has now. */
export function checkShortcutChange(
  combination: KeyCombination,
  commandId: string,
  shortcuts: readonly CommandShortcut[],
): ShortcutChangeCheck {
  const refusal = formRefusalOf(combination) ?? usedByRefusalOf(combination, commandId, shortcuts);
  if (refusal) return { isAccepted: false, refusal };
  const hasKeyboardWarning = combination.includes('ctrl') && combination.includes('alt');
  return { isAccepted: true, hasKeyboardWarning };
}

/** Refuses keys that cannot be a shortcut at all, whatever else uses them. */
export function formRefusalOf(combination: KeyCombination): ShortcutRefusal | undefined {
  const key = combination.at(-1);
  const modifiers = combination.slice(0, -1);
  if (key === undefined || !isWellFormed(key, modifiers) || key === 'Escape') return NOT_ALLOWED;
  if (modifiers.includes('ctrl')) return undefined;
  if (KEYS_NEEDING_CTRL.has(key)) return NOT_ALLOWED;
  if (modifiers.includes('alt')) return LETTER.test(key) ? ALT_MENU_KEY : undefined;
  return FUNCTION_KEY.test(key) ? undefined : NEEDS_MODIFIER;
}

/** Distinct modifiers followed by one key that is not a modifier. */
function isWellFormed(key: string, modifiers: readonly string[]): boolean {
  return !isModifier(key) && modifiers.every(isModifier) && new Set(modifiers).size === modifiers.length;
}

function usedByRefusalOf(
  combination: KeyCombination,
  commandId: string,
  shortcuts: readonly CommandShortcut[],
): ShortcutRefusal | undefined {
  const wanted = comparableFormOf(combination);
  const otherCommands = shortcuts.filter((shortcut) => rebindableIdOf(shortcut.command) !== commandId);
  const owner = [...otherCommands, ...KEPT_SHORTCUTS].find(({ combinations }) =>
    combinations.some((candidate) => comparableFormOf(candidate) === wanted),
  );
  return owner ? { reason: 'usedBy', actionKey: owner.actionKey } : undefined;
}

/** Matches as the shortcut matcher does: any modifier order, any letter case, Shift ignored for symbols. */
function comparableFormOf(combination: KeyCombination): string {
  const key = combination.at(-1) ?? '';
  const modifiers = MODIFIER_ORDER.filter(
    (modifier) => combination.includes(modifier) && !(modifier === 'shift' && isShiftProducedSymbol(key)),
  );
  return [...modifiers, key.toLowerCase()].join('+');
}
