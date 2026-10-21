import { READING_WIDTHS, THEME_PREFERENCES, TYPOGRAPHIES } from '@mdx/core';
import { DETECT_ENCODING_ITEM, isReopenEncoding } from '../encodings/reopenEncodings';
import type { ExportFormat, TextSearchOptions } from '@mdx/platform';
import type { EditingCommand } from '../editing/editingCommands';
import type { ExplorerActionCommand, RemoveExplorerFolderCommand } from '../explorer/explorerCommands';
import type { FavouriteCommand, FavouritesFileCommand } from '../favourites/favouriteCommands';
import type { PathCommand } from '../file-paths/pathCommands';
import type { FolderTreeCommand } from '../folder-tree/folderTreeCommands';
import type { NavigationCommand } from '../navigation/DocumentNavigation';
import type { LocateRecentFileCommand, RecentFileCommand } from '../recent-files/recentFileCommands';
import type { TabCommand } from '../tabs/tabCommands';
import type { ViewCommand } from '../view/viewCommands';

export type ViewerCommand =
  | TabCommand
  | ViewCommand
  | FavouriteCommand
  | FavouritesFileCommand
  | FolderTreeCommand
  | EditingCommand
  | ExplorerActionCommand
  | RemoveExplorerFolderCommand
  | RecentFileCommand
  | LocateRecentFileCommand
  | PathCommand
  | NavigationCommand
  | { readonly kind: 'toggleFullScreen' }
  | { readonly kind: 'openDocuments' }
  | { readonly kind: 'openRecentFileAt'; readonly index: number }
  | { readonly kind: 'saveDocument' }
  | { readonly kind: 'saveDocumentAs' }
  | { readonly kind: 'saveAllDocuments' }
  | { readonly kind: 'toggleFavourite' }
  | { readonly kind: 'showAbout' }
  | { readonly kind: 'showSettings' }
  | { readonly kind: 'confirmClearAllData' }
  | { readonly kind: 'clearAllData' }
  | { readonly kind: 'showFind' }
  | { readonly kind: 'showFolderSearch' }
  | {
      readonly kind: 'openSearchMatch';
      readonly path: string;
      readonly query: string;
      readonly options: TextSearchOptions;
    }
  | { readonly kind: 'copyAsHtml' }
  | { readonly kind: 'copyHtml'; readonly html: string }
  | { readonly kind: 'exportDocument'; readonly format: ExportFormat }
  | { readonly kind: 'saveExport'; readonly format: ExportFormat; readonly contents: string }
  | { readonly kind: 'showPasteTable' }
  | { readonly kind: 'print' }
  | { readonly kind: 'showKeyboardShortcuts' }
  | { readonly kind: 'showCommandPalette' }
  | { readonly kind: 'openFolder' }
  | { readonly kind: 'toggleSourceView' }
  | { readonly kind: 'reopenWithEncoding'; readonly encoding?: string };

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
  exportFavourites: { kind: 'exportFavourites' },
  importFavourites: { kind: 'importFavourites' },
  closeActiveTab: { kind: 'closeActiveTab' },
  print: { kind: 'print' },
  showFind: { kind: 'showFind' },
  showFolderSearch: { kind: 'showFolderSearch' },
  copyAsHtml: { kind: 'copyAsHtml' },
  exportAsHtml: { kind: 'exportDocument', format: 'html' },
  exportAsPlainText: { kind: 'exportDocument', format: 'plainText' },
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
  showCommandPalette: { kind: 'showCommandPalette' },
  toggleEditing: { kind: 'toggleEditing' },
  togglePreviewBesideEditor: { kind: 'togglePreviewBesideEditor' },
  newDocument: { kind: 'newDocument' },
  goBack: { kind: 'goBack' },
  goForward: { kind: 'goForward' },
  toggleFullScreen: { kind: 'toggleFullScreen' },
  revertDocument: { kind: 'revertDocument' },
  reloadActiveDocument: { kind: 'reloadActiveDocument' },
  undo: { kind: 'runEditorCommand', command: 'undo' },
  redo: { kind: 'runEditorCommand', command: 'redo' },
  showReplace: { kind: 'runEditorCommand', command: 'replace' },
  goToLine: { kind: 'runEditorCommand', command: 'goToLine' },
  showAbout: { kind: 'showAbout' },
  showSettings: { kind: 'showSettings' },
};

const RECENT_FILE_MENU_ITEM = /^openRecent\.(\d{1,2})$/;
const REOPEN_WITH_ENCODING_PREFIX = 'reopenWithEncoding.';

export function commandForMenuItem(menuItemId: string): ViewerCommand | undefined {
  const theme = THEME_PREFERENCES.find((preference) => menuItemId === `theme.${preference}`);
  if (theme) return { kind: 'setTheme', theme };
  const readingWidth = READING_WIDTHS.find((width) => menuItemId === `readingWidth.${width}`);
  if (readingWidth) return { kind: 'setReadingWidth', readingWidth };
  const typography = TYPOGRAPHIES.find((preset) => menuItemId === `typography.${preset}`);
  if (typography) return { kind: 'setTypography', typography };
  if (menuItemId.startsWith(REOPEN_WITH_ENCODING_PREFIX)) {
    return reopenCommandFor(menuItemId.slice(REOPEN_WITH_ENCODING_PREFIX.length));
  }
  const recentFileIndex = RECENT_FILE_MENU_ITEM.exec(menuItemId)?.[1];
  if (recentFileIndex !== undefined) return { kind: 'openRecentFileAt', index: Number(recentFileIndex) };
  return Object.hasOwn(COMMANDS_BY_MENU_ITEM, menuItemId) ? COMMANDS_BY_MENU_ITEM[menuItemId] : undefined;
}

function reopenCommandFor(encoding: string): ViewerCommand | undefined {
  if (encoding === DETECT_ENCODING_ITEM) return { kind: 'reopenWithEncoding' };
  return isReopenEncoding(encoding) ? { kind: 'reopenWithEncoding', encoding } : undefined;
}
