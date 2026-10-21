import { isUntitledLocation } from '@mdx/platform';
import type { DocumentLocation } from '@mdx/platform';
import { ExplorerFolders } from '../explorer/ExplorerFolders';
import { FavouritesList, type Favourite, type FavouriteGroup } from '../favourites/FavouritesList';
import { parseFavourites } from '../favourites/parseFavourites';
import { RecentFilesList, type RecentFile } from '../recent-files/RecentFilesList';
import { TabStrip, type Tab, type TabStripSnapshot } from '../tabs/TabStrip';
import {
  DEFAULT_VIEW_SETTINGS,
  parseViewSettings,
  type LanguagePreference,
  type ViewSettings,
} from '../view/ViewSettings';
import { isRecord, parseLocation, validEntries } from './savedValues';

export const APP_STATE_SCHEMA_VERSION = 1;

export interface PersistedAppState {
  readonly schemaVersion: typeof APP_STATE_SCHEMA_VERSION;
  readonly tabs: TabStripSnapshot;
  readonly recentFiles: readonly RecentFile[];
  readonly favourites: readonly Favourite[];
  readonly favouriteGroups: readonly FavouriteGroup[];
  readonly explorerFolders: readonly DocumentLocation[];
  readonly view: ViewSettings;
}

export interface ViewerState {
  readonly tabStrip: TabStrip;
  readonly recentFiles: RecentFilesList;
  readonly favourites: FavouritesList;
  readonly explorerFolders: ExplorerFolders;
  readonly viewSettings: ViewSettings;
}

export interface RestoredAppState extends ViewerState {
  readonly wasReset: boolean;
}

export function toPersistedAppState({
  tabStrip,
  recentFiles,
  favourites,
  explorerFolders,
  viewSettings,
}: ViewerState): PersistedAppState {
  return {
    schemaVersion: APP_STATE_SCHEMA_VERSION,
    tabs: withoutUntitledTabs(tabStrip.toSnapshot()),
    recentFiles: recentFiles.entries(),
    favourites: favourites.favourites(),
    favouriteGroups: favourites.groups(),
    explorerFolders: explorerFolders.folders(),
    view: viewSettings,
  };
}

/** Documents that were never saved exist only in memory, so they cannot be reopened later. */
function withoutUntitledTabs({ tabs, activeKey }: TabStripSnapshot): TabStripSnapshot {
  const savedTabs = tabs.filter((tab) => !isUntitledLocation(tab.location));
  const isActiveTabSaved = savedTabs.some((tab) => tab.location.canonicalKey === activeKey);
  return activeKey !== undefined && isActiveTabSaved ? { tabs: savedTabs, activeKey } : { tabs: savedTabs };
}

/** The language chosen in Settings, read before anything else so the window starts in it. */
export function savedLanguagePreference(saved: unknown): LanguagePreference {
  return isRecord(saved) && saved.schemaVersion === APP_STATE_SCHEMA_VERSION
    ? parseViewSettings(saved.view).language
    : DEFAULT_VIEW_SETTINGS.language;
}

export function restoreAppState(saved: unknown): RestoredAppState {
  if (saved === undefined || saved === null) return emptyAppState({ wasReset: false });
  if (!isRecord(saved) || saved.schemaVersion !== APP_STATE_SCHEMA_VERSION)
    return emptyAppState({ wasReset: true });
  const savedTabs = isRecord(saved.tabs) ? saved.tabs : {};
  const activeKey = typeof savedTabs.activeKey === 'string' ? { activeKey: savedTabs.activeKey } : {};
  return {
    tabStrip: TabStrip.fromSnapshot({ tabs: validEntries(savedTabs.tabs, parseTab), ...activeKey }),
    recentFiles: RecentFilesList.fromRecentFiles(validEntries(saved.recentFiles, parseRecentFile)),
    favourites: parseFavourites(saved.favourites, saved.favouriteGroups),
    explorerFolders: ExplorerFolders.fromFolders(validEntries(saved.explorerFolders, parseLocation)),
    viewSettings: parseViewSettings(saved.view),
    wasReset: false,
  };
}

function emptyAppState({ wasReset }: { wasReset: boolean }): RestoredAppState {
  return {
    tabStrip: TabStrip.empty(),
    recentFiles: RecentFilesList.empty(),
    favourites: FavouritesList.empty(),
    explorerFolders: ExplorerFolders.empty(),
    viewSettings: DEFAULT_VIEW_SETTINGS,
    wasReset,
  };
}

function parseTab(value: Record<string, unknown>): Tab | undefined {
  const location = parseLocation(value.location);
  if (!location || typeof value.isPinned !== 'boolean' || typeof value.scrollRatio !== 'number')
    return undefined;
  return { location, isPinned: value.isPinned, scrollRatio: value.scrollRatio };
}

function parseRecentFile(value: Record<string, unknown>): RecentFile | undefined {
  const location = parseLocation(value.location);
  if (!location || typeof value.isPinned !== 'boolean' || typeof value.lastOpenedAtMs !== 'number')
    return undefined;
  return { location, isPinned: value.isPinned, lastOpenedAtMs: value.lastOpenedAtMs };
}
