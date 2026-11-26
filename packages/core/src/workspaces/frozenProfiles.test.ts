import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryAppState, InMemoryWorkspaceStore } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_KINDS } from '../workspace-kinds/workspaceKinds';
import { WorkspaceStateStorage } from './WorkspaceStateStorage';

const PROFILES_FOLDER = join(import.meta.dirname, '..', '..', '..', '..', 'tests', 'fixtures', 'profiles');
const PROFILE_VERSIONS = ['0.8.1'] as const;

/** The parts of a saved state file the tests compare entry by entry. */
interface SavedAppStateFile {
  readonly tabs: { readonly tabs: readonly unknown[]; readonly activeKey: string };
  readonly recentFiles: readonly unknown[];
  readonly favourites: readonly unknown[];
  readonly favouriteGroups: readonly unknown[];
  readonly explorerFolders: readonly unknown[];
}

function readAppStateFile(version: string): SavedAppStateFile {
  return JSON.parse(
    readFileSync(join(PROFILES_FOLDER, version, 'app-state.json'), 'utf8'),
  ) as SavedAppStateFile;
}

function storageOver(workspaceStore: InMemoryWorkspaceStore, appState: InMemoryAppState) {
  return new WorkspaceStateStorage({
    workspaceStore,
    appState,
    kindRegistry: WORKSPACE_KINDS,
    windowId: 'main',
    now: () => 1_800_000_000_000,
    appVersion: '0.0.0-test',
  });
}

/** A first start of the current build on the data folder a released version left behind. */
function firstStartOn(version: string) {
  const workspaceStore = new InMemoryWorkspaceStore();
  const appState = new InMemoryAppState(readAppStateFile(version));
  return { storage: storageOver(workspaceStore, appState), workspaceStore, appState };
}

describe.each(PROFILE_VERSIONS)('the frozen %s profile', (version) => {
  it('opens with its tabs, recent files and explorer folders as the earlier version saved them', async () => {
    const saved = readAppStateFile(version);
    const { storage } = firstStartOn(version);

    const restored = await storage.restore();

    expect(restored.wasReset).toBe(false);
    expect(restored.tabStrip.tabs()).toEqual(saved.tabs.tabs);
    expect(restored.tabStrip.activeTab()?.location.canonicalKey).toBe(saved.tabs.activeKey);
    expect(restored.recentFiles.entries()).toEqual(saved.recentFiles);
    expect(restored.explorerFolders.folders()).toEqual(saved.explorerFolders);
  });

  it('keeps favourite labels, kinds and groups', async () => {
    const saved = readAppStateFile(version);
    const { storage } = firstStartOn(version);

    const { favourites } = await storage.restore();

    expect(favourites.favourites()).toEqual(saved.favourites);
    expect(favourites.groups()).toEqual(saved.favouriteGroups);
    expect(favourites.favourites().map(({ label, groupId }) => [label, groupId])).toEqual([
      ['Start here', 'group-1'],
      [undefined, 'group-2'],
      [undefined, undefined],
    ]);
  });

  it('keeps every view setting the earlier version saved', async () => {
    const { storage } = firstStartOn(version);

    const restored = await storage.restore();

    expect(restored.viewSettings).toMatchObject({
      theme: 'dark',
      zoomPercent: 110,
      readingWidth: 'wide',
      typography: 'book',
      language: 'pt-BR',
      isSidebarVisible: false,
      sidebarView: 'outline',
      isStatusBarVisible: false,
      isBreadcrumbsVisible: false,
      collapsedExplorerSections: ['recentFiles'],
      explorerSectionHeights: { favourites: 180 },
      panelWidths: { explorer: 320 },
      isPreviewBesideEditor: true,
      editorSharePercent: 60,
    });
  });

  it('moves the earlier state into the default workspace and leaves the earlier file as it was', async () => {
    const { storage, workspaceStore, appState } = firstStartOn(version);

    await storage.restore();

    expect((await workspaceStore.loadRegistry()).map((workspace) => workspace.id)).toEqual(['default']);
    expect(storage.shownWorkspace()?.id).toBe('default');
    expect(appState.saveCount).toBe(0);
    expect(await appState.load()).toEqual(readAppStateFile(version));
  });

  it('opens the same state again on the next start', async () => {
    const { storage, workspaceStore, appState } = firstStartOn(version);
    const firstStart = await storage.restore();

    const nextStart = await storageOver(workspaceStore, appState).restore();

    expect(nextStart.tabStrip.toSnapshot()).toEqual(firstStart.tabStrip.toSnapshot());
    expect(nextStart.recentFiles.entries()).toEqual(firstStart.recentFiles.entries());
    expect(nextStart.favourites.favourites()).toEqual(firstStart.favourites.favourites());
    expect(nextStart.favourites.groups()).toEqual(firstStart.favourites.groups());
    expect(nextStart.explorerFolders.folders()).toEqual(firstStart.explorerFolders.folders());
    expect(nextStart.viewSettings).toEqual(firstStart.viewSettings);
    expect(nextStart.hasEarlierVersionChanges).toBe(false);
  });

  it('writes nothing when the opened state is saved unchanged', async () => {
    const { storage, workspaceStore, appState } = firstStartOn(version);
    const restored = await storage.restore();
    workspaceStore.saveCount = 0;

    await storage.save(restored);

    expect(workspaceStore.saveCount).toBe(0);
    expect(appState.saveCount).toBe(0);
  });
});
