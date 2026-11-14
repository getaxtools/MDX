import { describe, expect, it } from 'vitest';
import type { ShortcutKeyEvent } from './commandShortcuts';
import { recordedCombination } from './recordedCombination';

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

describe('recordedCombination', () => {
  it('names the modifiers and an upper-case letter in table order', () => {
    expect(recordedCombination(keys('j', { ctrlKey: true, shiftKey: true }), 'windows')).toEqual([
      'ctrl',
      'shift',
      'J',
    ]);
    expect(recordedCombination(keys('k', { ctrlKey: true, altKey: true }), 'windows')).toEqual([
      'ctrl',
      'alt',
      'K',
    ]);
  });

  it('names the space bar Space', () => {
    expect(recordedCombination(keys(' ', { ctrlKey: true }), 'windows')).toEqual(['ctrl', 'Space']);
  });

  it('keeps named keys as they are', () => {
    expect(recordedCombination(keys('F8'), 'windows')).toEqual(['F8']);
    expect(recordedCombination(keys('PageDown', { ctrlKey: true }), 'windows')).toEqual(['ctrl', 'PageDown']);
  });

  it('keeps a letter whose upper case is longer as it is', () => {
    expect(recordedCombination(keys('ß', { ctrlKey: true }), 'windows')).toEqual(['ctrl', 'ß']);
  });

  it.each(['Control', 'Shift', 'Alt', 'AltGraph', 'Meta'])('records nothing for %s on its own', (key) => {
    expect(recordedCombination(keys(key, { ctrlKey: key === 'Control' }), 'windows')).toBeUndefined();
  });

  it('records nothing while an input method is composing text', () => {
    expect(recordedCombination(keys('j', { ctrlKey: true, isComposing: true }), 'windows')).toBeUndefined();
  });

  it('records nothing for keys that do not name a key, such as a dead key', () => {
    expect(recordedCombination(keys('Dead', { ctrlKey: true }), 'windows')).toBeUndefined();
  });

  it('uses Command for Ctrl on macOS', () => {
    expect(recordedCombination(keys('j', { metaKey: true }), 'macos')).toEqual(['ctrl', 'J']);
    expect(recordedCombination(keys('j', { ctrlKey: true }), 'macos')).toBeUndefined();
  });

  it('records nothing with the Windows key held, which the shortcut matcher never matches', () => {
    expect(recordedCombination(keys('j', { ctrlKey: true, metaKey: true }), 'windows')).toBeUndefined();
  });
});
