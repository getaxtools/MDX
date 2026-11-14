import type { WorkspaceListName } from '@mdx/platform';
import {
  APP_STATE_SCHEMA_VERSION,
  restoreAppState,
  toPersistedAppState,
  type RestoredAppState,
  type ViewerState,
} from '../session/persistedAppState';
import { isRecord } from '../session/savedValues';
import type { TabStripSnapshot } from '../tabs/TabStrip';
import {
  effectiveViewSettings,
  parseScopedViewSettings,
  splitViewSettings,
  type AppSettings,
  type WorkspaceLayout,
} from '../view/viewSettingsScopes';
import type { WorkspaceKind } from '../workspace-kinds/workspaceKinds';

export const DEFAULT_WORKSPACE_ID = 'default';
export const MAIN_WINDOW_ID = 'main';

/** App-wide values: settings, kind choices, shortcuts, word goals and snippets. */
export const APP_VALUE_KEYS = [
  'viewSettings',
  'workspaceKinds',
  'shortcutOverrides',
  'wordGoals',
  'snippetLibrary',
] as const;

export type AppValueKey = (typeof APP_VALUE_KEYS)[number];

/** What one window shows of a workspace: its tabs and its layout. */
export interface StoredWindowSession {
  readonly tabs: TabStripSnapshot;
  readonly layout: WorkspaceLayout;
}

/** The viewer state in the shape the workspace store keeps it. */
export interface StoredViewerState {
  readonly lists: Readonly<Record<WorkspaceListName, unknown>>;
  readonly windowSession: StoredWindowSession;
  readonly appValues: Readonly<Record<AppValueKey, unknown>> & { readonly viewSettings: AppSettings };
}

export function storedViewerStateOf(state: ViewerState): StoredViewerState {
  const persisted = toPersistedAppState(state);
  const { appSettings, layout } = splitViewSettings(state.viewSettings);
  return {
    lists: {
      recentFiles: persisted.recentFiles,
      favourites: persisted.favourites,
      favouriteGroups: persisted.favouriteGroups,
      explorerFolders: persisted.explorerFolders,
    },
    windowSession: { tabs: persisted.tabs, layout },
    appValues: {
      viewSettings: appSettings,
      workspaceKinds: persisted.workspaceKinds,
      shortcutOverrides: persisted.shortcutOverrides,
      wordGoals: persisted.wordGoals,
      snippetLibrary: persisted.snippetLibrary,
    },
  };
}

export interface SavedViewerParts {
  readonly lists: Partial<Readonly<Record<WorkspaceListName, unknown>>>;
  readonly windowSession: unknown;
  readonly appValues: Readonly<Record<string, unknown>>;
}

/** Reads stored parts through the same entry-by-entry parsers as the earlier state file. */
export function viewerStateFrom(
  { lists, windowSession, appValues }: SavedViewerParts,
  kindRegistry: readonly WorkspaceKind[],
): RestoredAppState {
  const session = isRecord(windowSession) ? windowSession : {};
  const view = effectiveViewSettings(parseScopedViewSettings(appValues.viewSettings, session.layout));
  return restoreAppState(
    {
      schemaVersion: APP_STATE_SCHEMA_VERSION,
      tabs: session.tabs,
      recentFiles: lists.recentFiles,
      favourites: lists.favourites,
      favouriteGroups: lists.favouriteGroups,
      explorerFolders: lists.explorerFolders,
      view,
      workspaceKinds: appValues.workspaceKinds,
      shortcutOverrides: appValues.shortcutOverrides,
      wordGoals: appValues.wordGoals,
      snippetLibrary: appValues.snippetLibrary,
    },
    kindRegistry,
  );
}
