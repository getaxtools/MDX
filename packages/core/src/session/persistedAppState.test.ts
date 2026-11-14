import { EMPTY_SNIPPET_LIBRARY } from '../snippets/snippetLibrary';
import { InMemoryDocumentFiles, untitledLocation } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { ExplorerFolders } from '../explorer/ExplorerFolders';
import { FavouritesList } from '../favourites/FavouritesList';
import { RecentFilesList } from '../recent-files/RecentFilesList';
import { TabStrip } from '../tabs/TabStrip';
import { DEFAULT_VIEW_SETTINGS } from '../view/ViewSettings';
import { WorkspaceKindsState } from '../workspace-kinds/WorkspaceKindsState';
import {
  APP_STATE_SCHEMA_VERSION,
  restoreAppState,
  savedLanguagePreference,
  toPersistedAppState,
} from './persistedAppState';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);

const ALL_KINDS_BUILT = [
  { id: 'markdownViewer', availability: 'built' },
  { id: 'notes', availability: 'built' },
  { id: 'specViewer', availability: 'built' },
] as const;

function emptyViewerState() {
  return {
    tabStrip: TabStrip.empty(),
    recentFiles: RecentFilesList.empty(),
    favourites: FavouritesList.empty(),
    explorerFolders: ExplorerFolders.empty(),
    viewSettings: DEFAULT_VIEW_SETTINGS,
    workspaceKinds: WorkspaceKindsState.initial(),
    shortcutOverrides: {},
    wordGoals: {},
    snippetLibrary: EMPTY_SNIPPET_LIBRARY,
  };
}

function savedStateWithTabsAndFavourites(): Record<string, unknown> {
  const state = {
    ...emptyViewerState(),
    tabStrip: TabStrip.empty().openOrFocus(location('a.md')).openOrFocus(location('b.md')),
    recentFiles: RecentFilesList.empty().add(location('a.md'), 1),
    favourites: FavouritesList.empty().add(location('Specs'), 'folder').add(location('a.md'), 'file'),
    explorerFolders: ExplorerFolders.empty().add(location('C:\\Notes')),
    viewSettings: { ...DEFAULT_VIEW_SETTINGS, theme: 'dark' as const, kindSwitcher: 'wheel' as const },
    workspaceKinds: WorkspaceKindsState.fromSaved(
      { enabledKindIds: ['markdownViewer', 'notes'], activeKindId: 'notes' },
      ALL_KINDS_BUILT,
    ),
    shortcutOverrides: { toggleControlWheel: ['ctrl', 'shift', 'J'] },
  };
  return JSON.parse(JSON.stringify(toPersistedAppState(state))) as Record<string, unknown>;
}

const KIND_FIELDS = ['workspaceKinds', 'shortcutOverrides'];
const KIND_VIEW_FIELDS = ['kindSwitcher', 'wheelDock', 'isWheelOpenedAtPointer', 'isWheelButtonInStatusBar'];

function withoutFields(saved: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(saved).filter(([field]) => !fields.includes(field)));
}

/** What a version that never knew workspace kinds or shortcut choices keeps from the file. */
function withoutKindFields(saved: Record<string, unknown>): Record<string, unknown> {
  const view = withoutFields(saved.view as Record<string, unknown>, KIND_VIEW_FIELDS);
  return { ...withoutFields(saved, KIND_FIELDS), view };
}

describe('persisted app state', () => {
  it('round-trips tabs, recent files, favourites, Explorer folders and view settings', () => {
    const tabStrip = TabStrip.empty().openOrFocus(location('a.md')).openOrFocus(location('b.md'));
    const recentFiles = RecentFilesList.empty().add(location('a.md'), 1).pin(location('a.md').canonicalKey);
    const favourites = FavouritesList.empty()
      .add(location('Specs'), 'folder')
      .rename(location('Specs').canonicalKey, 'Specs folder')
      .createGroup('group-1', 'Work', location('Specs').canonicalKey);

    const explorerFolders = ExplorerFolders.empty().add(location('C:\\Notes'));
    const viewSettings = {
      ...DEFAULT_VIEW_SETTINGS,
      theme: 'dark' as const,
      zoomPercent: 125,
      collapsedExplorerSections: ['recentFiles' as const],
    };

    const saved: unknown = JSON.parse(
      JSON.stringify(
        toPersistedAppState({
          ...emptyViewerState(),
          tabStrip,
          recentFiles,
          favourites,
          explorerFolders,
          viewSettings,
        }),
      ),
    );
    const restored = restoreAppState(saved);

    expect(restored.wasReset).toBe(false);
    expect(restored.tabStrip.toSnapshot()).toEqual(tabStrip.toSnapshot());
    expect(restored.recentFiles.entries()).toEqual(recentFiles.entries());
    expect(restored.favourites.favourites()).toEqual(favourites.favourites());
    expect(restored.favourites.groups()).toEqual(favourites.groups());
    expect(restored.explorerFolders.folders()).toEqual(explorerFolders.folders());
    expect(restored.viewSettings).toEqual(viewSettings);
  });

  it('never saves tabs of documents that were not saved yet', () => {
    const tabStrip = TabStrip.empty()
      .openOrFocus(location('a.md'))
      .openOrFocus(untitledLocation(1, 'Untitled-1.md'));
    const state = { ...emptyViewerState(), tabStrip };

    const saved = toPersistedAppState(state);

    expect(saved.tabs).toEqual({ tabs: [{ location: location('a.md'), isPinned: false, scrollRatio: 0 }] });
  });

  it('starts empty on first launch without reporting a reset', () => {
    const restored = restoreAppState(undefined);

    expect(restored.wasReset).toBe(false);
    expect(restored.tabStrip.tabs()).toEqual([]);
  });

  it.each([
    ['a string', 'garbage'],
    ['an array', []],
    ['an unknown schema version', { schemaVersion: 999 }],
  ])('resets to empty state when the saved state is %s', (_description, saved) => {
    const restored = restoreAppState(saved);

    expect(restored.wasReset).toBe(true);
    expect(restored.favourites.favourites()).toEqual([]);
  });

  it('drops individual invalid entries and keeps the valid ones', () => {
    const valid = { location: location('a.md'), isPinned: false, scrollRatio: 0 };
    const saved = {
      schemaVersion: APP_STATE_SCHEMA_VERSION,
      tabs: { tabs: [valid, { location: { canonicalKey: 1 } }, 'not a tab', { location: location('b.md') }] },
      recentFiles: [{ location: location('a.md'), isPinned: 'yes', lastOpenedAtMs: 1 }],
      favourites: [
        { location: location('c.md'), kind: 'shortcut' },
        { location: location('d.md'), kind: 'file', label: 7 },
      ],
    };

    const restored = restoreAppState(saved);

    expect(restored.tabStrip.tabs()).toEqual([valid]);
    expect(restored.recentFiles.entries()).toEqual([]);
    expect(restored.favourites.favourites()).toEqual([{ location: location('d.md'), kind: 'file' }]);
  });

  it('tolerates missing sections', () => {
    const restored = restoreAppState({ schemaVersion: APP_STATE_SCHEMA_VERSION });

    expect(restored.wasReset).toBe(false);
    expect(restored.tabStrip.tabs()).toEqual([]);
    expect(restored.recentFiles.entries()).toEqual([]);
    expect(restored.viewSettings).toEqual(DEFAULT_VIEW_SETTINGS);
  });

  describe('workspace kinds and shortcut choices', () => {
    it('keeps kind choices and shortcut choices after a save and restore', () => {
      const saved = savedStateWithTabsAndFavourites();

      const restored = restoreAppState(saved);

      expect(saved.workspaceKinds).toEqual({
        enabledKindIds: ['markdownViewer', 'notes'],
        activeKindId: 'notes',
      });
      expect(restored.shortcutOverrides).toEqual({ toggleControlWheel: ['ctrl', 'shift', 'J'] });
      expect(restored.viewSettings.kindSwitcher).toBe('wheel');
    });

    it('saves them without changing the schema version', () => {
      expect(savedStateWithTabsAndFavourites().schemaVersion).toBe(1);
    });

    it('starts with the Markdown viewer only and keeps everything else when data has no kind choices', () => {
      const earlierData = withoutKindFields(savedStateWithTabsAndFavourites());

      const restored = restoreAppState(earlierData);

      expect(restored.wasReset).toBe(false);
      expect(restored.tabStrip.tabs().map((tab) => tab.location.fileName)).toEqual(['a.md', 'b.md']);
      expect(restored.recentFiles.entries()).toHaveLength(1);
      expect(restored.favourites.favourites()).toHaveLength(2);
      expect(restored.explorerFolders.folders()).toHaveLength(1);
      expect(restored.viewSettings.theme).toBe('dark');
      expect(restored.workspaceKinds.enabledKindIds()).toEqual(['markdownViewer']);
      expect(restored.workspaceKinds.activeKindId()).toBe('markdownViewer');
      expect(restored.shortcutOverrides).toEqual({});
    });

    it('gives an earlier reader the same tabs, favourites, recent files and folders', () => {
      const saved = savedStateWithTabsAndFavourites();

      const current = restoreAppState(saved);
      const earlier = restoreAppState(withoutKindFields(saved));

      expect(earlier.wasReset).toBe(false);
      expect(earlier.tabStrip.toSnapshot()).toEqual(current.tabStrip.toSnapshot());
      expect(earlier.favourites.favourites()).toEqual(current.favourites.favourites());
      expect(earlier.recentFiles.entries()).toEqual(current.recentFiles.entries());
      expect(earlier.explorerFolders.folders()).toEqual(current.explorerFolders.folders());
    });

    it('never resets the saved state because kind or shortcut fields are bad', () => {
      const saved = {
        ...savedStateWithTabsAndFavourites(),
        workspaceKinds: 'broken',
        shortcutOverrides: ['ctrl', 'J'],
      };

      const restored = restoreAppState(saved);

      expect(restored.wasReset).toBe(false);
      expect(restored.tabStrip.tabs()).toHaveLength(2);
      expect(restored.workspaceKinds.enabledKindIds()).toEqual(['markdownViewer']);
      expect(restored.shortcutOverrides).toEqual({});
    });
  });
});

describe('savedLanguagePreference', () => {
  it('reads the language chosen in Settings', () => {
    expect(
      savedLanguagePreference({ schemaVersion: APP_STATE_SCHEMA_VERSION, view: { language: 'hi' } }),
    ).toBe('hi');
  });

  it('follows the system when nothing valid was saved', () => {
    expect(savedLanguagePreference(undefined)).toBe('system');
    expect(savedLanguagePreference({ schemaVersion: 999, view: { language: 'hi' } })).toBe('system');
  });
});
