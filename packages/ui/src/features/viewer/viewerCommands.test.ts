import { describe, expect, it } from 'vitest';
import { commandForShortcut, type ShortcutKeyEvent } from './viewerCommands';

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

describe('commandForShortcut on Windows', () => {
  it.each([
    [keys('o', { ctrlKey: true }), { kind: 'openDocuments' }],
    [keys('w', { ctrlKey: true }), { kind: 'closeActiveTab' }],
    [keys('F4', { ctrlKey: true }), { kind: 'closeActiveTab' }],
    [keys('d', { ctrlKey: true }), { kind: 'toggleFavourite' }],
    [keys('T', { ctrlKey: true, shiftKey: true }), { kind: 'reopenClosedTab' }],
    [keys('Tab', { ctrlKey: true }), { kind: 'nextTab' }],
    [keys('Tab', { ctrlKey: true, shiftKey: true }), { kind: 'previousTab' }],
    [keys('3', { ctrlKey: true }), { kind: 'activateTabNumber', numberKey: 3 }],
    [keys('9', { ctrlKey: true }), { kind: 'activateTabNumber', numberKey: 9 }],
  ])('maps %o to %o', (event, command) => {
    expect(commandForShortcut(event, 'windows')).toEqual(command);
  });

  it.each([
    keys('o'),
    keys('0', { ctrlKey: true }),
    keys('x', { ctrlKey: true }),
    keys('o', { ctrlKey: true, altKey: true }),
    keys('o', { metaKey: true }),
    keys('w', { ctrlKey: true, shiftKey: true }),
  ])('ignores %o', (event) => {
    expect(commandForShortcut(event, 'windows')).toBeUndefined();
  });

  it('ignores shortcuts while an input method is composing text', () => {
    expect(commandForShortcut(keys('o', { ctrlKey: true, isComposing: true }), 'windows')).toBeUndefined();
  });
});

describe('commandForShortcut on macOS', () => {
  it('uses Command instead of Control', () => {
    expect(commandForShortcut(keys('o', { metaKey: true }), 'macos')).toEqual({ kind: 'openDocuments' });
    expect(commandForShortcut(keys('o', { ctrlKey: true }), 'macos')).toBeUndefined();
  });

  it('keeps Control+Tab for switching tabs', () => {
    expect(commandForShortcut(keys('Tab', { ctrlKey: true }), 'macos')).toEqual({ kind: 'nextTab' });
  });
});
