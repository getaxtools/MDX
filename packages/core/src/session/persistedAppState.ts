import type { DocumentLocation } from '@mdx/platform';
import { FavouritesList, type Favourite } from '../favourites/FavouritesList';
import { RecentFilesList, type RecentFile } from '../recent-files/RecentFilesList';
import { TabStrip, type Tab, type TabStripSnapshot } from '../tabs/TabStrip';

export const APP_STATE_SCHEMA_VERSION = 1;

export interface PersistedAppState {
  readonly schemaVersion: typeof APP_STATE_SCHEMA_VERSION;
  readonly tabs: TabStripSnapshot;
  readonly recentFiles: readonly RecentFile[];
  readonly favourites: readonly Favourite[];
}

export interface RestoredAppState {
  readonly tabStrip: TabStrip;
  readonly recentFiles: RecentFilesList;
  readonly favourites: FavouritesList;
  readonly wasReset: boolean;
}

export function toPersistedAppState(
  tabStrip: TabStrip,
  recentFiles: RecentFilesList,
  favourites: FavouritesList,
): PersistedAppState {
  return {
    schemaVersion: APP_STATE_SCHEMA_VERSION,
    tabs: tabStrip.toSnapshot(),
    recentFiles: recentFiles.entries(),
    favourites: favourites.favourites(),
  };
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
    favourites: FavouritesList.fromFavourites(validEntries(saved.favourites, parseFavourite)),
    wasReset: false,
  };
}

function emptyAppState({ wasReset }: { wasReset: boolean }): RestoredAppState {
  return {
    tabStrip: TabStrip.empty(),
    recentFiles: RecentFilesList.empty(),
    favourites: FavouritesList.empty(),
    wasReset,
  };
}

function validEntries<Entry>(
  saved: unknown,
  parse: (value: Record<string, unknown>) => Entry | undefined,
): Entry[] {
  if (!Array.isArray(saved)) return [];
  return saved.flatMap((value: unknown) => {
    const entry = isRecord(value) ? parse(value) : undefined;
    return entry === undefined ? [] : [entry];
  });
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

function parseFavourite(value: Record<string, unknown>): Favourite | undefined {
  const location = parseLocation(value.location);
  if (!location || (value.kind !== 'file' && value.kind !== 'folder')) return undefined;
  return typeof value.label === 'string'
    ? { location, kind: value.kind, label: value.label }
    : { location, kind: value.kind };
}

function parseLocation(value: unknown): DocumentLocation | undefined {
  if (!isRecord(value)) return undefined;
  const { canonicalKey, displayPath, fileName } = value;
  if (typeof canonicalKey !== 'string' || typeof displayPath !== 'string' || typeof fileName !== 'string') {
    return undefined;
  }
  return { canonicalKey, displayPath, fileName };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
