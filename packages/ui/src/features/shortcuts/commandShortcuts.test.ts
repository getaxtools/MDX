import { createTranslator, englishCatalog } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SHORTCUTS,
  commandForShortcut,
  shortcutLabelFor,
  type ShortcutKeyEvent,
} from './commandShortcuts';

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
    [keys('s', { ctrlKey: true }), { kind: 'saveDocument' }],
    [keys('S', { ctrlKey: true, shiftKey: true }), { kind: 'saveDocumentAs' }],
    [keys('s', { ctrlKey: true, altKey: true }), { kind: 'saveAllDocuments' }],
    [keys('w', { ctrlKey: true }), { kind: 'closeActiveTab' }],
    [keys('F4', { ctrlKey: true }), { kind: 'closeActiveTab' }],
    [keys('d', { ctrlKey: true }), { kind: 'toggleFavourite' }],
    [keys('T', { ctrlKey: true, shiftKey: true }), { kind: 'reopenClosedTab' }],
    [keys('Tab', { ctrlKey: true }), { kind: 'nextTab' }],
    [keys('Tab', { ctrlKey: true, shiftKey: true }), { kind: 'previousTab' }],
    [keys('3', { ctrlKey: true }), { kind: 'activateTabNumber', numberKey: 3 }],
    [keys('9', { ctrlKey: true }), { kind: 'activateTabNumber', numberKey: 9 }],
    [keys('0', { ctrlKey: true }), { kind: 'resetZoom' }],
    [keys('E', { ctrlKey: true, shiftKey: true }), { kind: 'toggleSidebar' }],
    [keys('f', { ctrlKey: true }), { kind: 'showFind' }],
    [keys('v', { ctrlKey: true, altKey: true }), { kind: 'showPasteTable' }],
    [keys('u', { ctrlKey: true }), { kind: 'toggleSourceView' }],
    [keys('p', { ctrlKey: true }), { kind: 'print' }],
    [keys('F1'), { kind: 'showKeyboardShortcuts' }],
    [keys('P', { ctrlKey: true, shiftKey: true }), { kind: 'showCommandPalette' }],
    [keys('O', { ctrlKey: true, shiftKey: true }), { kind: 'toggleOutline' }],
    [keys('PageUp', { ctrlKey: true, shiftKey: true }), { kind: 'moveActiveTab', step: -1 }],
    [keys('PageDown', { ctrlKey: true, shiftKey: true }), { kind: 'moveActiveTab', step: 1 }],
  ])('maps %o to %o', (event, command) => {
    expect(commandForShortcut(event, 'windows')).toEqual(command);
  });

  it.each([
    ['Ctrl+= on a US keyboard', keys('=', { ctrlKey: true })],
    ['Ctrl+Shift+= on a US keyboard', keys('+', { ctrlKey: true, shiftKey: true })],
    ['Ctrl++ on a keyboard or keypad with its own plus key', keys('+', { ctrlKey: true })],
  ])('zooms in with %s', (_name, event) => {
    expect(commandForShortcut(event, 'windows')).toEqual({ kind: 'zoomIn' });
  });

  it('zooms out with Ctrl+- from the main keyboard or the numeric keypad', () => {
    expect(commandForShortcut(keys('-', { ctrlKey: true }), 'windows')).toEqual({ kind: 'zoomOut' });
  });

  it.each([
    keys('o'),
    keys('x', { ctrlKey: true }),
    keys('o', { ctrlKey: true, altKey: true }),
    keys('o', { metaKey: true }),
    keys('w', { ctrlKey: true, shiftKey: true }),
    keys('3', { ctrlKey: true, shiftKey: true }),
    keys('F1', { shiftKey: true }),
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

describe('shortcutLabelFor', () => {
  it('shows the first combination of a command', () => {
    const translator = createTranslator();

    expect(shortcutLabelFor({ kind: 'zoomIn' }, translator)).toBe('Ctrl++');
    expect(shortcutLabelFor({ kind: 'saveDocumentAs' }, translator)).toBe('Ctrl+Shift+S');
    expect(shortcutLabelFor({ kind: 'moveActiveTab', step: 1 }, translator)).toBe('Ctrl+Shift+PageDown');
  });

  it('has no label for a command without a shortcut', () => {
    expect(shortcutLabelFor({ kind: 'showAbout' }, createTranslator())).toBeUndefined();
  });
});

describe('the shortcut table', () => {
  it('names every action with a message from the catalog', () => {
    const missing = COMMAND_SHORTCUTS.filter(
      (shortcut) => !Object.hasOwn(englishCatalog, shortcut.actionKey),
    );

    expect(missing).toEqual([]);
  });

  it('never gives two commands the same key combination', () => {
    const combinations = COMMAND_SHORTCUTS.flatMap((shortcut) =>
      shortcut.combinations.map((combination) => combination.join('+').toLowerCase()),
    );

    expect(new Set(combinations).size).toBe(combinations.length);
  });
});
