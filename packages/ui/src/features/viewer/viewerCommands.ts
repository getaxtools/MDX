import { READING_WIDTHS, THEME_PREFERENCES } from '@mdx/core';
import type { FavouriteCommand } from '../favourites/favouriteCommands';
import type { RecentFileCommand } from '../recent-files/recentFileCommands';
import type { TabCommand } from '../tabs/tabCommands';
import type { ViewCommand } from '../view/viewCommands';

export type ViewerCommand =
  | TabCommand
  | ViewCommand
  | FavouriteCommand
  | RecentFileCommand
  | { readonly kind: 'openDocuments' }
  | { readonly kind: 'openRecentFileAt'; readonly index: number }
  | { readonly kind: 'saveDocument' }
  | { readonly kind: 'saveDocumentAs' }
  | { readonly kind: 'saveAllDocuments' }
  | { readonly kind: 'toggleFavourite' }
  | { readonly kind: 'showAbout' }
  | { readonly kind: 'showFind' }
  | { readonly kind: 'showPasteTable' }
  | { readonly kind: 'print' }
  | { readonly kind: 'showKeyboardShortcuts' }
  | { readonly kind: 'openFolder' }
  | { readonly kind: 'toggleSourceView' };

export type DesktopPlatform = 'windows' | 'macos' | 'linux';

const COMMANDS_BY_MENU_ITEM: Readonly<Record<string, ViewerCommand>> = {
  openDocuments: { kind: 'openDocuments' },
  openFolder: { kind: 'openFolder' },
  reopenClosedTab: { kind: 'reopenClosedTab' },
  clearUnpinnedRecentFiles: { kind: 'clearUnpinnedRecentFiles' },
  saveDocument: { kind: 'saveDocument' },
  saveDocumentAs: { kind: 'saveDocumentAs' },
  saveAllDocuments: { kind: 'saveAllDocuments' },
  toggleFavourite: { kind: 'toggleFavourite' },
  closeActiveTab: { kind: 'closeActiveTab' },
  print: { kind: 'print' },
  showFind: { kind: 'showFind' },
  showPasteTable: { kind: 'showPasteTable' },
  zoomIn: { kind: 'zoomIn' },
  zoomOut: { kind: 'zoomOut' },
  resetZoom: { kind: 'resetZoom' },
  toggleSourceView: { kind: 'toggleSourceView' },
  toggleSidebar: { kind: 'toggleSidebar' },
  toggleOutline: { kind: 'toggleOutline' },
  toggleStatusBar: { kind: 'toggleStatusBar' },
  nextTab: { kind: 'nextTab' },
  previousTab: { kind: 'previousTab' },
  moveTabLeft: { kind: 'moveActiveTab', step: -1 },
  moveTabRight: { kind: 'moveActiveTab', step: 1 },
  togglePinActiveTab: { kind: 'togglePinActiveTab' },
  closeInactiveTabs: { kind: 'closeInactiveTabs' },
  closeTabsRightOfActive: { kind: 'closeTabsRightOfActive' },
  showKeyboardShortcuts: { kind: 'showKeyboardShortcuts' },
  showAbout: { kind: 'showAbout' },
};

const RECENT_FILE_MENU_ITEM = /^openRecent\.(\d{1,2})$/;

export function commandForMenuItem(menuItemId: string): ViewerCommand | undefined {
  const theme = THEME_PREFERENCES.find((preference) => menuItemId === `theme.${preference}`);
  if (theme) return { kind: 'setTheme', theme };
  const readingWidth = READING_WIDTHS.find((width) => menuItemId === `readingWidth.${width}`);
  if (readingWidth) return { kind: 'setReadingWidth', readingWidth };
  const recentFileIndex = RECENT_FILE_MENU_ITEM.exec(menuItemId)?.[1];
  if (recentFileIndex !== undefined) return { kind: 'openRecentFileAt', index: Number(recentFileIndex) };
  return Object.hasOwn(COMMANDS_BY_MENU_ITEM, menuItemId) ? COMMANDS_BY_MENU_ITEM[menuItemId] : undefined;
}
