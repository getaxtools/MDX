import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { ExplorerFolders } from '../explorer/ExplorerFolders';
import { FavouritesList } from '../favourites/FavouritesList';
import { RecentFilesList } from '../recent-files/RecentFilesList';
import { restoreAppState, toPersistedAppState, type ViewerState } from '../session/persistedAppState';
import { EMPTY_SNIPPET_LIBRARY } from '../snippets/snippetLibrary';
import { TabStrip } from '../tabs/TabStrip';
import { DEFAULT_VIEW_SETTINGS } from '../view/ViewSettings';
import { WORKSPACE_KINDS } from '../workspace-kinds/workspaceKinds';
import { WorkspaceKindsState } from '../workspace-kinds/WorkspaceKindsState';
import { migrateLegacyAppState } from './migrateLegacyAppState';
import { viewerStateFrom } from './storedViewerState';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);
const OPTIONS = { kindRegistry: WORKSPACE_KINDS, nowMs: 1_000 };

function fullViewerState(): ViewerState {
  return {
    tabStrip: TabStrip.empty()
      .openOrFocus(location('a.md'))
      .openOrFocus(location('b.md'))
      .updateScrollRatio(location('b.md').canonicalKey, 0.5)
      .activate(location('a.md').canonicalKey),
    recentFiles: RecentFilesList.empty().add(location('a.md'), 1).pin(location('a.md').canonicalKey),
    favourites: FavouritesList.empty()
      .add(location('Specs'), 'folder')
      .createGroup('group-1', 'Work', location('Specs').canonicalKey),
    explorerFolders: ExplorerFolders.empty().add(location('C:\\Notes')),
    viewSettings: {
      ...DEFAULT_VIEW_SETTINGS,
      theme: 'nord',
      zoomPercent: 125,
      sidebarView: 'outline',
      panelWidths: { explorer: 320 },
      wheelDock: 'bottomInlineStart',
    },
    workspaceKinds: WorkspaceKindsState.initial(),
    shortcutOverrides: { toggleControlWheel: ['ctrl', 'shift', 'J'] },
    wordGoals: {},
    snippetLibrary: EMPTY_SNIPPET_LIBRARY,
  };
}

function savedFileOf(state: ViewerState): unknown {
  return JSON.parse(JSON.stringify(toPersistedAppState(state)));
}

describe('migrateLegacyAppState', () => {
  it('full state keeps tabs, active tab, scroll, recent pins, favourites, groups, folders and layout', () => {
    const earlier = fullViewerState();

    const migration = migrateLegacyAppState(savedFileOf(earlier), OPTIONS);
    const reopened = viewerStateFrom(
      JSON.parse(JSON.stringify(migration)) as typeof migration,
      WORKSPACE_KINDS,
    );

    expect(reopened.tabStrip.toSnapshot()).toEqual(earlier.tabStrip.toSnapshot());
    expect(reopened.recentFiles.entries()).toEqual(earlier.recentFiles.entries());
    expect(reopened.favourites.favourites()).toEqual(earlier.favourites.favourites());
    expect(reopened.favourites.groups()).toEqual(earlier.favourites.groups());
    expect(reopened.explorerFolders.folders()).toEqual(earlier.explorerFolders.folders());
    expect(reopened.viewSettings).toEqual(earlier.viewSettings);
    expect(reopened.shortcutOverrides).toEqual(earlier.shortcutOverrides);
  });

  it('puts the layout in the window session and the rest of the settings in app values', () => {
    const migration = migrateLegacyAppState(savedFileOf(fullViewerState()), OPTIONS);

    expect(migration.windowSession.layout.sidebarView).toBe('outline');
    expect(migration.windowSession.layout.panelWidths).toEqual({ explorer: 320 });
    expect(migration.appValues.viewSettings.zoomPercent).toBe(125);
    expect(migration.appValues.viewSettings).not.toHaveProperty('sidebarView');
  });

  it('the control wheel field moves to app values', () => {
    const migration = migrateLegacyAppState(savedFileOf(fullViewerState()), OPTIONS);

    expect(migration.appValues.workspaceKinds).toEqual(WorkspaceKindsState.initial().toSaved());
    expect(migration.appValues.viewSettings.wheelDock).toBe('bottomInlineStart');
  });

  it('creates the Default Markdown viewer workspace, named from the catalog until renamed', () => {
    expect(migrateLegacyAppState(undefined, OPTIONS).workspace).toEqual({
      id: 'default',
      kindId: 'markdownViewer',
      name: null,
      icon: null,
      colour: null,
      position: 0,
      lastShownAtMs: 1_000,
    });
  });

  it('empty state gives empty lists and the default settings', () => {
    const migration = migrateLegacyAppState(undefined, OPTIONS);

    expect(migration.lists).toEqual({
      recentFiles: [],
      favourites: [],
      favouriteGroups: [],
      explorerFolders: [],
    });
    expect(migration.windowSession.tabs).toEqual({ tabs: [] });
    expect(migration.wasReset).toBe(false);
  });

  it('invalid entries are dropped as before', () => {
    const saved = savedFileOf(fullViewerState()) as Record<string, unknown>;
    const withInvalidEntries = {
      ...saved,
      recentFiles: [...(saved.recentFiles as unknown[]), { location: 'not a location' }, 42],
      favourites: 'not a list',
    };

    const migration = migrateLegacyAppState(withInvalidEntries, OPTIONS);
    const asBefore = restoreAppState(withInvalidEntries);

    expect(migration.lists.recentFiles).toEqual(asBefore.recentFiles.entries());
    expect(migration.lists.favourites).toEqual([]);
  });

  it('reports unreadable or newer state like the earlier restore', () => {
    expect(migrateLegacyAppState('garbage', OPTIONS).wasReset).toBe(true);
    expect(migrateLegacyAppState({ schemaVersion: 2 }, OPTIONS).newerSavedState).toEqual({
      appVersion: undefined,
    });
  });
});
