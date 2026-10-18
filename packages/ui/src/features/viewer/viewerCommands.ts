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
  | { readonly kind: 'toggleFavourite' }
  | { readonly kind: 'showAbout' }
  | { readonly kind: 'showFind' }
  | { readonly kind: 'print' }
  | { readonly kind: 'showKeyboardShortcuts' }
  | { readonly kind: 'openFolder' }
  | { readonly kind: 'toggleSourceView' };

export type DesktopPlatform = 'windows' | 'macos' | 'linux';

export type ShortcutKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'isComposing'
>;

const TAB_NUMBER_KEY = /^[1-9]$/;

export function commandForShortcut(
  event: ShortcutKeyEvent,
  platform: DesktopPlatform,
): ViewerCommand | undefined {
  if (event.isComposing || event.altKey) return undefined;
  if (event.ctrlKey && event.key === 'Tab') return { kind: event.shiftKey ? 'previousTab' : 'nextTab' };
  const isCommandModifierPressed = platform === 'macos' ? event.metaKey : event.ctrlKey;
  return isCommandModifierPressed ? commandWithModifier(event) : commandWithoutModifier(event);
}

function commandWithoutModifier(event: ShortcutKeyEvent): ViewerCommand | undefined {
  return event.key === 'F1' && !event.shiftKey ? { kind: 'showKeyboardShortcuts' } : undefined;
}

function commandWithModifier(event: ShortcutKeyEvent): ViewerCommand | undefined {
  if (TAB_NUMBER_KEY.test(event.key)) return { kind: 'activateTabNumber', numberKey: Number(event.key) };
  const key = event.key.toLowerCase();
  return event.shiftKey ? COMMANDS_BY_SHIFTED_KEY[key] : COMMANDS_BY_KEY[key];
}

const COMMANDS_BY_KEY: Readonly<Record<string, ViewerCommand>> = {
  o: { kind: 'openDocuments' },
  f: { kind: 'showFind' },
  u: { kind: 'toggleSourceView' },
  p: { kind: 'print' },
  w: { kind: 'closeActiveTab' },
  f4: { kind: 'closeActiveTab' },
  d: { kind: 'toggleFavourite' },
  b: { kind: 'toggleSidebar' },
  '=': { kind: 'zoomIn' },
  '+': { kind: 'zoomIn' },
  '-': { kind: 'zoomOut' },
  '0': { kind: 'resetZoom' },
};

const COMMANDS_BY_SHIFTED_KEY: Readonly<Record<string, ViewerCommand>> = {
  t: { kind: 'reopenClosedTab' },
  o: { kind: 'toggleOutline' },
  '+': { kind: 'zoomIn' },
  pageup: { kind: 'moveActiveTab', step: -1 },
  pagedown: { kind: 'moveActiveTab', step: 1 },
};

const COMMANDS_BY_MENU_ITEM: Readonly<Record<string, ViewerCommand>> = {
  openDocuments: { kind: 'openDocuments' },
  openFolder: { kind: 'openFolder' },
  closeActiveTab: { kind: 'closeActiveTab' },
  zoomIn: { kind: 'zoomIn' },
  zoomOut: { kind: 'zoomOut' },
  resetZoom: { kind: 'resetZoom' },
  toggleSidebar: { kind: 'toggleSidebar' },
  toggleOutline: { kind: 'toggleOutline' },
  toggleSourceView: { kind: 'toggleSourceView' },
  showAbout: { kind: 'showAbout' },
  showFind: { kind: 'showFind' },
  print: { kind: 'print' },
  showKeyboardShortcuts: { kind: 'showKeyboardShortcuts' },
};

export function commandForMenuItem(menuItemId: string): ViewerCommand | undefined {
  const theme = THEME_PREFERENCES.find((preference) => menuItemId === `theme.${preference}`);
  if (theme) return { kind: 'setTheme', theme };
  const readingWidth = READING_WIDTHS.find((width) => menuItemId === `readingWidth.${width}`);
  if (readingWidth) return { kind: 'setReadingWidth', readingWidth };
  return COMMANDS_BY_MENU_ITEM[menuItemId];
}
