import type { ShortcutOverrides } from '@mdx/core';
import type { KeyCombination } from './describeCombination';
import { isRebindableCommandId } from './rebindableCommands';

export type ShortcutOverrideCommand =
  | { readonly kind: 'setShortcut'; readonly commandId: string; readonly combination: KeyCombination }
  | { readonly kind: 'removeShortcut'; readonly commandId: string }
  | { readonly kind: 'resetShortcut'; readonly commandId: string };

const SHORTCUT_OVERRIDE_COMMAND_KINDS: readonly string[] = ['setShortcut', 'removeShortcut', 'resetShortcut'];

export function isShortcutOverrideCommand(command: {
  readonly kind: string;
}): command is ShortcutOverrideCommand {
  return SHORTCUT_OVERRIDE_COMMAND_KINDS.includes(command.kind);
}

/** Removing saves no keys for the command; resetting forgets the change so the default applies. */
export function applyShortcutOverrideCommand(
  overrides: ShortcutOverrides,
  command: ShortcutOverrideCommand,
): ShortcutOverrides {
  const { commandId } = command;
  if (!isRebindableCommandId(commandId)) return overrides;
  if (command.kind === 'setShortcut') return { ...overrides, [commandId]: command.combination };
  if (command.kind === 'removeShortcut') return { ...overrides, [commandId]: [] };
  return Object.fromEntries(Object.entries(overrides).filter(([id]) => id !== commandId));
}
