import { describe, expect, it } from 'vitest';
import { commandForMenuItem } from './viewerCommands';

describe('commandForMenuItem', () => {
  it.each([
    ['openDocuments', { kind: 'openDocuments' }],
    ['saveDocument', { kind: 'saveDocument' }],
    ['saveDocumentAs', { kind: 'saveDocumentAs' }],
    ['saveAllDocuments', { kind: 'saveAllDocuments' }],
    ['reopenClosedTab', { kind: 'reopenClosedTab' }],
    ['clearUnpinnedRecentFiles', { kind: 'clearUnpinnedRecentFiles' }],
    ['closeActiveTab', { kind: 'closeActiveTab' }],
    ['showPasteTable', { kind: 'showPasteTable' }],
    ['theme.dark', { kind: 'setTheme', theme: 'dark' }],
    ['readingWidth.narrow', { kind: 'setReadingWidth', readingWidth: 'narrow' }],
    ['toggleSidebar', { kind: 'toggleSidebar' }],
    ['toggleStatusBar', { kind: 'toggleStatusBar' }],
    ['moveTabLeft', { kind: 'moveActiveTab', step: -1 }],
    ['togglePinActiveTab', { kind: 'togglePinActiveTab' }],
    ['closeInactiveTabs', { kind: 'closeInactiveTabs' }],
    ['showAbout', { kind: 'showAbout' }],
  ])('maps the %s menu item to %o', (menuItemId, command) => {
    expect(commandForMenuItem(menuItemId)).toEqual(command);
  });

  it('opens a recent file by its position in the Open Recent menu', () => {
    expect(commandForMenuItem('openRecent.0')).toEqual({ kind: 'openRecentFileAt', index: 0 });
    expect(commandForMenuItem('openRecent.9')).toEqual({ kind: 'openRecentFileAt', index: 9 });
  });

  it('ignores unknown menu items', () => {
    expect(commandForMenuItem('theme.neon')).toBeUndefined();
    expect(commandForMenuItem('format-disk')).toBeUndefined();
    expect(commandForMenuItem('openRecent.x')).toBeUndefined();
    expect(commandForMenuItem('toString')).toBeUndefined();
  });
});
