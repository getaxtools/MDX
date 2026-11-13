import { createTranslator } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import {
  commandForShortcut,
  shortcutLabelFor,
  tooltipWithShortcut,
  type ShortcutKeyEvent,
} from './commandShortcuts';
import { effectiveCommandShortcuts } from './effectiveCommandShortcuts';

function keys(key: string, modifiers: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    ...modifiers,
  };
}

const CTRL_SHIFT_SPACE = keys(' ', { ctrlKey: true, shiftKey: true });
const CTRL_SHIFT_J = keys('J', { ctrlKey: true, shiftKey: true });

describe('effectiveCommandShortcuts', () => {
  it('an override replaces the default keys', () => {
    const shortcuts = effectiveCommandShortcuts({ toggleControlWheel: ['ctrl', 'shift', 'J'] });

    expect(commandForShortcut(CTRL_SHIFT_J, 'windows', shortcuts)).toEqual({ kind: 'toggleControlWheel' });
    expect(commandForShortcut(CTRL_SHIFT_SPACE, 'windows', shortcuts)).toBeUndefined();
  });

  it('an empty override removes the shortcut', () => {
    const shortcuts = effectiveCommandShortcuts({ toggleControlWheel: [] });

    expect(commandForShortcut(CTRL_SHIFT_SPACE, 'windows', shortcuts)).toBeUndefined();
    expect(shortcutLabelFor({ kind: 'toggleControlWheel' }, createTranslator(), shortcuts)).toBeUndefined();
  });

  it('overrides for unknown ids are ignored', () => {
    const shortcuts = effectiveCommandShortcuts({ saveDocument: ['ctrl', 'shift', 'J'] });

    expect(commandForShortcut(keys('s', { ctrlKey: true }), 'windows', shortcuts)).toEqual({
      kind: 'saveDocument',
    });
    expect(commandForShortcut(CTRL_SHIFT_J, 'windows', shortcuts)).toBeUndefined();
  });

  it('a saved override that cannot be a shortcut keeps the default keys', () => {
    const shortcuts = effectiveCommandShortcuts({ toggleControlWheel: ['J'] });

    expect(commandForShortcut(keys('j'), 'windows', shortcuts)).toBeUndefined();
    expect(commandForShortcut(CTRL_SHIFT_SPACE, 'windows', shortcuts)).toEqual({
      kind: 'toggleControlWheel',
    });
  });

  it('other commands keep their keys', () => {
    const shortcuts = effectiveCommandShortcuts({ toggleControlWheel: ['ctrl', 'shift', 'J'] });

    expect(commandForShortcut(keys('o', { ctrlKey: true }), 'windows', shortcuts)).toEqual({
      kind: 'openDocuments',
    });
  });

  it('tooltips show the changed keys', () => {
    const translator = createTranslator();
    const shortcuts = effectiveCommandShortcuts({ toggleControlWheel: ['ctrl', 'shift', 'J'] });

    const shortcut = shortcutLabelFor({ kind: 'toggleControlWheel' }, translator, shortcuts);

    expect(tooltipWithShortcut('Show Control Wheel', shortcut)).toBe('Show Control Wheel (Ctrl+Shift+J)');
  });
});
