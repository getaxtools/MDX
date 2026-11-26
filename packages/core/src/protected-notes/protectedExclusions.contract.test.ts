import { InMemoryDocumentFiles, protectedNoteLocation, type DocumentLocation } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { ExplorerFolders } from '../explorer/ExplorerFolders';
import { FavouritesList } from '../favourites/FavouritesList';
import { fileArcEntries } from '../file-arc/fileArcEntries';
import { RecentFilesList } from '../recent-files/RecentFilesList';
import { toPersistedAppState, type ViewerState } from '../session/persistedAppState';
import { TabStrip } from '../tabs/TabStrip';
import { DEFAULT_VIEW_SETTINGS } from '../view/ViewSettings';
import { WORKSPACE_KINDS } from '../workspace-kinds/workspaceKinds';
import { WorkspaceKindsState } from '../workspace-kinds/WorkspaceKindsState';
import { EMPTY_SNIPPET_LIBRARY } from '../snippets/snippetLibrary';
import { InjectionIgnoreList } from '../prompt-injection/InjectionIgnoreList';

const PLAN = InMemoryDocumentFiles.locationOf(String.raw`E:\Notes\Plan.md`);
const PROTECTED_NOTE = protectedNoteLocation(
  String.raw`e:\notes`,
  '4f1c0a2e9b7d4c3a8e6f5d4c3b2a1f0e',
  'Bank details',
);
const SECTION_FILE = InMemoryDocumentFiles.locationOf(
  String.raw`E:\Notes\.mdx-notes\protected\notes\4f1c0a2e9b7d4c3a8e6f5d4c3b2a1f0e.md`,
);

function stateWith(locations: readonly DocumentLocation[]): ViewerState {
  let tabStrip = TabStrip.empty();
  let recentFiles = RecentFilesList.empty();
  let favourites = FavouritesList.empty();
  for (const location of locations) {
    tabStrip = tabStrip.openOrFocus(location);
    recentFiles = recentFiles.add(location, 1_000);
    favourites = favourites.add(location, 'file');
  }
  return {
    tabStrip,
    recentFiles,
    favourites,
    explorerFolders: ExplorerFolders.empty(),
    viewSettings: DEFAULT_VIEW_SETTINGS,
    workspaceKinds: WorkspaceKindsState.initial(WORKSPACE_KINDS),
    shortcutOverrides: {},
    wordGoals: {},
    snippetLibrary: EMPTY_SNIPPET_LIBRARY,
    injectionIgnoreList: InjectionIgnoreList.empty(),
  };
}

/**
 * Every feature of the core that lists, keeps or offers documents, each fed a protected note and a
 * file of a protected section. A feature added here without the rule fails its case.
 */
const FEATURES: Readonly<Record<string, (location: DocumentLocation) => readonly string[]>> = {
  'recent files': (location) =>
    RecentFilesList.empty()
      .add(location, 1_000)
      .entries()
      .map((file) => file.location.canonicalKey),
  favourites: (location) =>
    FavouritesList.empty()
      .add(location, 'file')
      .favourites()
      .map((favourite) => favourite.location.canonicalKey),
  'session restore, tabs': (location) =>
    toPersistedAppState(stateWith([PLAN, location])).tabs.tabs.map((tab) => tab.location.canonicalKey),
  'session restore, recent files and favourites': (location) => {
    const persisted = toPersistedAppState(stateWith([PLAN, location]));
    return [...persisted.recentFiles, ...persisted.favourites].map((entry) => entry.location.canonicalKey);
  },
  'file arc, from the tree': (location) =>
    fileArcEntries({
      roots: [{ label: 'Notes', children: [{ label: 'Secret', file: location }] }],
      recentFiles: [],
      openTabKeys: new Set(),
    }).map((entry) => entry.location.canonicalKey),
  'file arc, from recent files': (location) =>
    fileArcEntries({ roots: [], recentFiles: [location], openTabKeys: new Set() }).map(
      (entry) => entry.location.canonicalKey,
    ),
};

describe('protected notes are left out by every feature', () => {
  for (const [feature, keysAfterAdding] of Object.entries(FEATURES)) {
    it(`${feature} never holds a protected note or a file of a protected section`, () => {
      expect(keysAfterAdding(PROTECTED_NOTE)).not.toContain(PROTECTED_NOTE.canonicalKey);
      expect(keysAfterAdding(SECTION_FILE)).not.toContain(SECTION_FILE.canonicalKey);
      expect(keysAfterAdding(PLAN)).toContain(PLAN.canonicalKey);
    });
  }
});
