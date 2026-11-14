import type { ShortcutOverrides } from '@mdx/core';
import { formRefusalOf } from './checkShortcutChange';
import { COMMAND_SHORTCUTS, type CommandShortcut } from './commandShortcuts';
import { rebindableIdOf } from './rebindableCommands';

/** The shortcut table with the user's changes; a saved change that could not be typed is ignored. */
export function effectiveCommandShortcuts(overrides: ShortcutOverrides): readonly CommandShortcut[] {
  return COMMAND_SHORTCUTS.map((shortcut) => {
    const id = rebindableIdOf(shortcut.command);
    const override = id !== undefined && Object.hasOwn(overrides, id) ? overrides[id] : undefined;
    if (override === undefined) return shortcut;
    if (override.length === 0) return { ...shortcut, combinations: [] };
    return formRefusalOf(override) ? shortcut : { ...shortcut, combinations: [override] };
  });
}
