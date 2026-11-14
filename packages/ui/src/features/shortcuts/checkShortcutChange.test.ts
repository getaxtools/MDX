import { describe, expect, it } from 'vitest';
import { checkShortcutChange } from './checkShortcutChange';
import { effectiveCommandShortcuts } from './effectiveCommandShortcuts';

const DEFAULT_SHORTCUTS = effectiveCommandShortcuts({});

function check(combination: readonly string[], shortcuts = DEFAULT_SHORTCUTS) {
  return checkShortcutChange(combination, 'toggleControlWheel', shortcuts);
}

describe('checkShortcutChange', () => {
  it('refuses a combination another command uses and names it (Ctrl+S is Save)', () => {
    expect(check(['ctrl', 'S'])).toEqual({
      isAccepted: false,
      refusal: { reason: 'usedBy', actionKey: 'menu.file.save' },
    });
  });

  it('matches the keys whatever the letter case and modifier order', () => {
    expect(check(['shift', 'ctrl', 't'])).toEqual({
      isAccepted: false,
      refusal: { reason: 'usedBy', actionKey: 'tabs.reopenClosed' },
    });
  });

  it.each([
    [['ctrl', 'C'], 'menu.edit.copy'],
    [['F6'], 'shortcuts.moveBetweenRegions'],
    [['ctrl', '1'], 'shortcuts.tabByNumber'],
    [['ctrl', 'V'], 'menu.edit.paste'],
  ])('refuses in-place keys such as %j', (combination, actionKey) => {
    expect(check(combination)).toEqual({ isAccepted: false, refusal: { reason: 'usedBy', actionKey } });
  });

  it.each([
    [['ctrl', 'B'], 'editor.action.bold'],
    [['ctrl', 'shift', 'K'], 'shortcuts.editingText'],
  ])('refuses editor keys such as %j', (combination, actionKey) => {
    expect(check(combination)).toEqual({ isAccepted: false, refusal: { reason: 'usedBy', actionKey } });
  });

  it.each([
    [['ctrl', 'shift', 'M'], 'shortcuts.planned.displayMath'],
    [['ctrl', 'alt', 'W'], 'shortcuts.planned.switchWorkspace'],
  ])('refuses keys kept for planned features such as %j', (combination, actionKey) => {
    expect(check(combination)).toEqual({ isAccepted: false, refusal: { reason: 'usedBy', actionKey } });
  });

  it.each([[['W']], [['shift', 'W']], [['7']], [['Space']], [['shift', 'Space']], [['ArrowUp']]])(
    'refuses %j without Ctrl',
    (combination) => {
      expect(check(combination)).toEqual({ isAccepted: false, refusal: { reason: 'needsModifier' } });
    },
  );

  it('refuses Alt plus a letter, which opens a menu', () => {
    expect(check(['alt', 'W'])).toEqual({ isAccepted: false, refusal: { reason: 'altMenuKey' } });
  });

  it.each([[['Escape']], [['Tab']], [['shift', 'Tab']], [['Enter']], [['Backspace']], [['ctrl', 'Escape']]])(
    'refuses %j',
    (combination) => {
      expect(check(combination)).toEqual({ isAccepted: false, refusal: { reason: 'notAllowed' } });
    },
  );

  it.each([[['ctrl']], [['ctrl', 'ctrl', 'J']], [['hyper', 'J']], [[]]])(
    'refuses a malformed combination %j',
    (combination) => {
      expect(check(combination)).toEqual({ isAccepted: false, refusal: { reason: 'notAllowed' } });
    },
  );

  it('accepts an F-key alone', () => {
    expect(check(['F8'])).toEqual({ isAccepted: true, hasKeyboardWarning: false });
  });

  it('accepts a free Ctrl combination', () => {
    expect(check(['ctrl', 'shift', 'J'])).toEqual({ isAccepted: true, hasKeyboardWarning: false });
  });

  it('accepts Ctrl+Alt with the keyboard warning', () => {
    expect(check(['ctrl', 'alt', 'J'])).toEqual({ isAccepted: true, hasKeyboardWarning: true });
  });

  it("accepts the command's own current keys", () => {
    const changed = effectiveCommandShortcuts({ toggleControlWheel: ['ctrl', 'shift', 'J'] });

    expect(check(['ctrl', 'shift', 'J'], changed)).toEqual({ isAccepted: true, hasKeyboardWarning: false });
    expect(check(['ctrl', 'shift', 'Space'])).toEqual({ isAccepted: true, hasKeyboardWarning: false });
  });
});
