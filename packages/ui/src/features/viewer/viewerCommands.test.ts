import { describe, expect, it } from 'vitest';
import { commandForMenuItem, commandForShortcut, type ShortcutKeyEvent } from './viewerCommands';

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
    [keys('=', { ctrlKey: true }), { kind: 'zoomIn' }],
    [keys('+', { ctrlKey: true, shiftKey: true }), { kind: 'zoomIn' }],
    [keys('-', { ctrlKey: true }), { kind: 'zoomOut' }],
    [keys('0', { ctrlKey: true }), { kind: 'resetZoom' }],
    [keys('b', { ctrlKey: true }), { kind: 'toggleSidebar' }],
    [keys('f', { ctrlKey: true }), { kind: 'showFind' }],
    [keys('u', { ctrlKey: true }), { kind: 'toggleSourceView' }],
    [keys('p', { ctrlKey: true }), { kind: 'print' }],
    [keys('F1'), { kind: 'showKeyboardShortcuts' }],
    [keys('O', { ctrlKey: true, shiftKey: true }), { kind: 'toggleOutline' }],
    [keys('PageUp', { ctrlKey: true, shiftKey: true }), { kind: 'moveActiveTab', step: -1 }],
    [keys('PageDown', { ctrlKey: true, shiftKey: true }), { kind: 'moveActiveTab', step: 1 }],
  ])('maps %o to %o', (event, command) => {
    expect(commandForShortcut(event, 'windows')).toEqual(command);
  });

  it.each([
    keys('o'),
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

describe('commandForMenuItem', () => {
  it.each([
    ['openDocuments', { kind: 'openDocuments' }],
    ['closeActiveTab', { kind: 'closeActiveTab' }],
    ['theme.dark', { kind: 'setTheme', theme: 'dark' }],
    ['readingWidth.narrow', { kind: 'setReadingWidth', readingWidth: 'narrow' }],
    ['toggleSidebar', { kind: 'toggleSidebar' }],
    ['showAbout', { kind: 'showAbout' }],
  ])('maps the %s menu item to %o', (menuItemId, command) => {
    expect(commandForMenuItem(menuItemId)).toEqual(command);
  });

  it('ignores unknown menu items', () => {
    expect(commandForMenuItem('theme.neon')).toBeUndefined();
    expect(commandForMenuItem('format-disk')).toBeUndefined();
  });
});
