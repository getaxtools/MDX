import { hasFile } from '@mdx/platform';
import type { DocumentLocation } from '@mdx/platform';
import { ExplorerFolders } from '../explorer/ExplorerFolders';
import type { IgnoreEntry } from '../prompt-injection/ignoreFindings';
import { InjectionIgnoreList } from '../prompt-injection/InjectionIgnoreList';
import {
  NO_JUMP_LIST_REMOVALS,
  parseJumpListRemovals,
  type JumpListRemovals,
} from '../workspaces/jumpListRemovals';
import { FavouritesList, type Favourite, type FavouriteGroup } from '../favourites/FavouritesList';
import { parseFavourites } from '../favourites/parseFavourites';
import { isProtectedLocation, withoutProtectedLocations } from '../protected-notes/protectedLocations';
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
import type { WorkspaceOverrides } from '../view/viewSettingsScopes';
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
  /** Findings the user ignored in the prompt injection check, as rule ids and hashes. */
  readonly injectionIgnoreEntries?: readonly IgnoreEntry[];
  /** Workspaces whose Jump List entry the user removed, by id, with when. */
  readonly jumpListRemovals?: JumpListRemovals;
  /** Lets an older MDX name the version that wrote state it cannot read. */
  readonly savedByAppVersion?: string;
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
  readonly injectionIgnoreList: InjectionIgnoreList;
  /** Absent until the user removes a Jump List entry. */
  readonly jumpListRemovals?: JumpListRemovals;
  /** The shown workspace's own theme, reading width or typography; absent without workspaces. */
  readonly workspaceOverrides?: WorkspaceOverrides;
}

/** Saved state written by a newer MDX; the desktop app keeps a copy of it before anything is saved. */
export interface NewerSavedState {
  readonly appVersion: string | undefined;
}

export interface RestoredAppState extends ViewerState {
  readonly wasReset: boolean;
  readonly newerSavedState: NewerSavedState | undefined;
}

export function toPersistedAppState(
  {
    tabStrip,
    recentFiles,
    favourites,
    explorerFolders,
    viewSettings,
    workspaceKinds,
    shortcutOverrides,
    wordGoals,
    snippetLibrary,
    injectionIgnoreList,
    jumpListRemovals = NO_JUMP_LIST_REMOVALS,
  }: ViewerState,
  appVersion?: string,
): PersistedAppState {
  return {
    ...(appVersion === undefined ? {} : { savedByAppVersion: appVersion }),
    schemaVersion: APP_STATE_SCHEMA_VERSION,
    tabs: withFileTabsOnly(tabStrip.toSnapshot()),
    recentFiles: withoutProtectedLocations(recentFiles.entries(), (file) => file.location),
    favourites: withoutProtectedLocations(favourites.favourites(), (favourite) => favourite.location),
    favouriteGroups: favourites.groups(),
    explorerFolders: explorerFolders.folders(),
    view: viewSettings,
    workspaceKinds: workspaceKinds.toSaved(),
    shortcutOverrides,
    wordGoals,
    snippetLibrary,
    ...(injectionIgnoreList.isEmpty() ? {} : { injectionIgnoreEntries: injectionIgnoreList.toSaved() }),
    ...(Object.keys(jumpListRemovals).length === 0 ? {} : { jumpListRemovals }),
  };
}

/**
 * Unsaved documents and views of the app exist only in memory, and protected notes are never kept,
 * so none of them is reopened later.
 */
function withFileTabsOnly({ tabs, activeKey }: TabStripSnapshot): TabStripSnapshot {
  const savedTabs = tabs.filter((tab) => hasFile(tab.location) && !isProtectedLocation(tab.location));
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
    return emptyAppState({ wasReset: true, kindRegistry, newerSavedState: newerSavedStateOf(saved) });
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
    injectionIgnoreList: InjectionIgnoreList.fromSaved(saved.injectionIgnoreEntries),
    jumpListRemovals: parseJumpListRemovals(saved.jumpListRemovals),
    wasReset: false,
    newerSavedState: undefined,
  };
}

function newerSavedStateOf(saved: unknown): NewerSavedState | undefined {
  if (!isRecord(saved) || typeof saved.schemaVersion !== 'number') return undefined;
  if (saved.schemaVersion <= APP_STATE_SCHEMA_VERSION) return undefined;
  const appVersion = typeof saved.savedByAppVersion === 'string' ? saved.savedByAppVersion : undefined;
  return { appVersion };
}

function emptyAppState({
  wasReset,
  kindRegistry,
  newerSavedState,
}: {
  wasReset: boolean;
  kindRegistry: readonly WorkspaceKind[];
  newerSavedState?: NewerSavedState | undefined;
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
    injectionIgnoreList: InjectionIgnoreList.empty(),
    jumpListRemovals: NO_JUMP_LIST_REMOVALS,
    wasReset,
    newerSavedState,
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
