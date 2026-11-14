import { isUntitledLocation } from '@mdx/platform';
import type { DocumentLocation } from '@mdx/platform';
import { ExplorerFolders } from '../explorer/ExplorerFolders';
import { FavouritesList, type Favourite, type FavouriteGroup } from '../favourites/FavouritesList';
import { parseFavourites } from '../favourites/parseFavourites';
import { RecentFilesList, type RecentFile } from '../recent-files/RecentFilesList';
import { parseShortcutOverrides, type ShortcutOverrides } from '../shortcuts/parseShortcutOverrides';
import { parseWordGoals, type WordGoals } from '../word-goals/wordGoals';
import { EMPTY_SNIPPET_LIBRARY, parseSnippetLibrary, type SnippetLibrary } from '../snippets/snippetLibrary';
import { TabStrip, type Tab, type TabStripSnapshot } from '../tabs/TabStrip';
import {
  DEFAULT_VIEW_SETTINGS,
  parseViewSettings,
  type LanguagePreference,
  type ViewSettings,
} from '../view/ViewSettings';
import { WORKSPACE_KINDS, type WorkspaceKind } from '../workspace-kinds/workspaceKinds';
import { WorkspaceKindsState, type SavedWorkspaceKinds } from '../workspace-kinds/WorkspaceKindsState';
import { isRecord, parseLocation, validEntries } from './savedValues';

/** Stays 1: an earlier version resets on any other value, so new data goes in optional fields. */
export const APP_STATE_SCHEMA_VERSION = 1;

export interface PersistedAppState {
  readonly schemaVersion: typeof APP_STATE_SCHEMA_VERSION;
  readonly tabs: TabStripSnapshot;
  readonly recentFiles: readonly RecentFile[];
  readonly favourites: readonly Favourite[];
  readonly favouriteGroups: readonly FavouriteGroup[];
  readonly explorerFolders: readonly DocumentLocation[];
  readonly view: ViewSettings;
  readonly workspaceKinds: SavedWorkspaceKinds;
  readonly shortcutOverrides: ShortcutOverrides;
  readonly wordGoals: WordGoals;
  readonly snippetLibrary: SnippetLibrary;
}

export interface ViewerState {
  readonly tabStrip: TabStrip;
  readonly recentFiles: RecentFilesList;
  readonly favourites: FavouritesList;
  readonly explorerFolders: ExplorerFolders;
  readonly viewSettings: ViewSettings;
  readonly workspaceKinds: WorkspaceKindsState;
  readonly shortcutOverrides: ShortcutOverrides;
  readonly wordGoals: WordGoals;
  readonly snippetLibrary: SnippetLibrary;
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
  workspaceKinds,
  shortcutOverrides,
  wordGoals,
  snippetLibrary,
}: ViewerState): PersistedAppState {
  return {
    schemaVersion: APP_STATE_SCHEMA_VERSION,
    tabs: withoutUntitledTabs(tabStrip.toSnapshot()),
    recentFiles: recentFiles.entries(),
    favourites: favourites.favourites(),
    favouriteGroups: favourites.groups(),
    explorerFolders: explorerFolders.folders(),
    view: viewSettings,
    workspaceKinds: workspaceKinds.toSaved(),
    shortcutOverrides,
    wordGoals,
    snippetLibrary,
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

export function restoreAppState(
  saved: unknown,
  kindRegistry: readonly WorkspaceKind[] = WORKSPACE_KINDS,
): RestoredAppState {
  if (saved === undefined || saved === null) return emptyAppState({ wasReset: false, kindRegistry });
  if (!isRecord(saved) || saved.schemaVersion !== APP_STATE_SCHEMA_VERSION)
    return emptyAppState({ wasReset: true, kindRegistry });
  const savedTabs = isRecord(saved.tabs) ? saved.tabs : {};
  const activeKey = typeof savedTabs.activeKey === 'string' ? { activeKey: savedTabs.activeKey } : {};
  return {
    tabStrip: TabStrip.fromSnapshot({ tabs: validEntries(savedTabs.tabs, parseTab), ...activeKey }),
    recentFiles: RecentFilesList.fromRecentFiles(validEntries(saved.recentFiles, parseRecentFile)),
    favourites: parseFavourites(saved.favourites, saved.favouriteGroups),
    explorerFolders: ExplorerFolders.fromFolders(validEntries(saved.explorerFolders, parseLocation)),
    viewSettings: parseViewSettings(saved.view),
    workspaceKinds: WorkspaceKindsState.fromSaved(saved.workspaceKinds, kindRegistry),
    shortcutOverrides: parseShortcutOverrides(saved.shortcutOverrides),
    wordGoals: parseWordGoals(saved.wordGoals),
    snippetLibrary: parseSnippetLibrary(saved.snippetLibrary),
    wasReset: false,
  };
}

function emptyAppState({
  wasReset,
  kindRegistry,
}: {
  wasReset: boolean;
  kindRegistry: readonly WorkspaceKind[];
}): RestoredAppState {
  return {
    tabStrip: TabStrip.empty(),
    recentFiles: RecentFilesList.empty(),
    favourites: FavouritesList.empty(),
    explorerFolders: ExplorerFolders.empty(),
    viewSettings: DEFAULT_VIEW_SETTINGS,
    workspaceKinds: WorkspaceKindsState.initial(kindRegistry),
    shortcutOverrides: {},
    wordGoals: {},
    snippetLibrary: EMPTY_SNIPPET_LIBRARY,
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
