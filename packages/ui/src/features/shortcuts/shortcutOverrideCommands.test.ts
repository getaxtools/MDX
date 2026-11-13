import { describe, expect, it } from 'vitest';
import { applyShortcutOverrideCommand, isShortcutOverrideCommand } from './shortcutOverrideCommands';

describe('shortcut override commands', () => {
  it('setting keys saves them for the command', () => {
    expect(
      applyShortcutOverrideCommand(
        {},
        { kind: 'setShortcut', commandId: 'toggleControlWheel', combination: ['ctrl', 'shift', 'J'] },
      ),
    ).toEqual({ toggleControlWheel: ['ctrl', 'shift', 'J'] });
  });

  it('removing saves no keys for the command', () => {
    expect(
      applyShortcutOverrideCommand(
        { toggleControlWheel: ['ctrl', 'shift', 'J'] },
        { kind: 'removeShortcut', commandId: 'toggleControlWheel' },
      ),
    ).toEqual({ toggleControlWheel: [] });
  });

  it('resetting forgets the change', () => {
    expect(
      applyShortcutOverrideCommand(
        { toggleControlWheel: [] },
        { kind: 'resetShortcut', commandId: 'toggleControlWheel' },
      ),
    ).toEqual({});
  });

  it('changes nothing for a command whose keys cannot be changed', () => {
    const overrides = { toggleControlWheel: ['ctrl', 'shift', 'J'] };

    expect(
      applyShortcutOverrideCommand(overrides, {
        kind: 'setShortcut',
        commandId: 'saveDocument',
        combination: ['ctrl', 'J'],
      }),
    ).toBe(overrides);
  });

  it('recognises only its own commands', () => {
    expect(isShortcutOverrideCommand({ kind: 'resetShortcut' })).toBe(true);
    expect(isShortcutOverrideCommand({ kind: 'saveDocument' })).toBe(false);
  });
});
