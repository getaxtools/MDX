import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryWorkspaceStore,
  type WorkspaceListName,
} from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { FavouritesList } from '../favourites/FavouritesList';
import { restoreAppState, toPersistedAppState, type ViewerState } from '../session/persistedAppState';
import { WORKSPACE_KINDS } from '../workspace-kinds/workspaceKinds';
import { WorkspaceStateStorage } from './WorkspaceStateStorage';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);

class RecordingWorkspaceStore extends InMemoryWorkspaceStore {
  readonly writes: string[] = [];

  override saveList(workspaceId: string, listName: WorkspaceListName, value: unknown): Promise<void> {
    this.writes.push(`list:${listName}`);
    return super.saveList(workspaceId, listName, value);
  }

  override saveWindowSession(windowId: string, workspaceId: string, session: unknown): Promise<void> {
    this.writes.push('windowSession');
    return super.saveWindowSession(windowId, workspaceId, session);
  }

  override saveAppValue(key: string, value: unknown): Promise<void> {
    this.writes.push(`app:${key}`);
    return super.saveAppValue(key, value);
  }
}

function createStorage(workspaceStore = new RecordingWorkspaceStore(), appState = new InMemoryAppState()) {
  const storage = new WorkspaceStateStorage({
    workspaceStore,
    appState,
    kindRegistry: WORKSPACE_KINDS,
    windowId: 'main',
    now: () => 1_000,
    appVersion: '0.9.0',
  });
  return { storage, workspaceStore, appState };
}

function withFavourite(state: ViewerState, path: string): ViewerState {
  return { ...state, favourites: state.favourites.add(location(path), 'file') };
}

function earlierStateWithFavourite(path: string): unknown {
  const state = restoreAppState(undefined);
  return JSON.parse(JSON.stringify(toPersistedAppState(withFavourite(state, path))));
}

describe('WorkspaceStateStorage', () => {
  it('moves the earlier state into the Default workspace on the first start', async () => {
    const earlier = earlierStateWithFavourite('C:\\a.md');
    const { storage, workspaceStore, appState } = createStorage(undefined, new InMemoryAppState(earlier));

    const restored = await storage.restore();

    expect(restored.favourites.favourites().map((favourite) => favourite.location.fileName)).toEqual([
      'a.md',
    ]);
    expect((await workspaceStore.loadRegistry()).map((workspace) => workspace.id)).toEqual(['default']);
    expect(await appState.load()).toEqual(earlier);
  });

  it('grants access to the Default workspace it migrated, not to the earlier file', async () => {
    const { storage, workspaceStore, appState } = createStorage();

    await storage.restore();

    expect(workspaceStore.grantedWorkspaceIds).toEqual(['default']);
    expect(appState.savedAccessGrantCount).toBe(0);
  });

  it('grants access to the earlier file when it stands in for the store', async () => {
    const workspaceStore = new RecordingWorkspaceStore();
    workspaceStore.failsNextImport = true;
    const { storage, appState } = createStorage(workspaceStore);

    await storage.restore();

    expect(appState.savedAccessGrantCount).toBe(1);
    expect(workspaceStore.grantedWorkspaceIds).toEqual([]);
  });

  it('save after a change writes only the touched list', async () => {
    const { storage, workspaceStore } = createStorage();
    const restored = await storage.restore();
    workspaceStore.writes.length = 0;

    await storage.save(withFavourite(restored, 'C:\\a.md'));

    expect(workspaceStore.writes).toEqual(['list:favourites', 'app:earlierVersionCopyHash']);
  });

  it('writes nothing when nothing changed', async () => {
    const { storage, workspaceStore, appState } = createStorage();
    const restored = await storage.restore();
    workspaceStore.writes.length = 0;
    const savesBefore = appState.saveCount;

    await storage.save(restored);

    expect(workspaceStore.writes).toEqual([]);
    expect(appState.saveCount).toBe(savesBefore);
  });

  it('restore after restart gives the same tabs', async () => {
    const first = createStorage();
    const restored = await first.storage.restore();
    const withTabs = {
      ...restored,
      tabStrip: restored.tabStrip.openOrFocus(location('C:\\a.md')).openOrFocus(location('C:\\b.md')),
    };
    await first.storage.save(withTabs);

    const second = createStorage(first.workspaceStore, first.appState);
    const reopened = await second.storage.restore();

    expect(reopened.tabStrip.toSnapshot()).toEqual(withTabs.tabStrip.toSnapshot());
    expect(reopened.hasEarlierVersionChanges).toBe(false);
  });

  it('failure starts on the earlier state and retries next start', async () => {
    const earlier = earlierStateWithFavourite('C:\\a.md');
    const workspaceStore = new RecordingWorkspaceStore();
    workspaceStore.failsNextImport = true;
    const first = createStorage(workspaceStore, new InMemoryAppState(earlier));

    const restored = await first.storage.restore();
    await first.storage.save(withFavourite(restored, 'C:\\b.md'));
    const retried = await createStorage(workspaceStore, first.appState).storage.restore();

    expect(restored.favourites.favourites()).toHaveLength(1);
    expect(retried.favourites.favourites()).toHaveLength(2);
    expect(await workspaceStore.loadRegistry()).toHaveLength(1);
  });

  it('uses the earlier state file when the store cannot be read', async () => {
    const workspaceStore = new RecordingWorkspaceStore();
    workspaceStore.loadRegistry = () => Promise.reject(new Error('written by a newer version'));
    const { storage } = createStorage(
      workspaceStore,
      new InMemoryAppState(earlierStateWithFavourite('C:\\a.md')),
    );

    const restored = await storage.restore();

    expect(restored.favourites.favourites()).toHaveLength(1);
  });

  it('the copy parses with the earlier reader', async () => {
    const { storage, appState } = createStorage();
    const restored = await storage.restore();

    await storage.save(withFavourite(restored, 'C:\\a.md'));
    const readByEarlierVersion = restoreAppState(await appState.load());

    expect(readByEarlierVersion.wasReset).toBe(false);
    expect(
      readByEarlierVersion.favourites.favourites().map((favourite) => favourite.location.fileName),
    ).toEqual(['a.md']);
  });

  it('a changed copy replaces the Default workspace lists and leaves its tabs alone', async () => {
    const first = createStorage();
    const restored = await first.storage.restore();
    await first.storage.save({
      ...restored,
      tabStrip: restored.tabStrip.openOrFocus(location('C:\\tab.md')),
    });
    const copy = (await first.appState.load()) as Record<string, unknown>;
    const editedByEarlierVersion = {
      ...copy,
      tabs: { tabs: [] },
      favourites: toPersistedAppState({
        ...restored,
        favourites: FavouritesList.empty().add(location('C:\\b.md'), 'file'),
      }).favourites,
    };
    await first.appState.save(JSON.parse(JSON.stringify(editedByEarlierVersion)));

    const reopened = await createStorage(first.workspaceStore, first.appState).storage.restore();

    expect(reopened.hasEarlierVersionChanges).toBe(true);
    expect(reopened.favourites.favourites().map((favourite) => favourite.location.fileName)).toEqual([
      'b.md',
    ]);
    expect(reopened.tabStrip.tabs().map((tab) => tab.location.fileName)).toEqual(['tab.md']);
  });

  it('an unchanged copy is ignored', async () => {
    const first = createStorage();
    const restored = await first.storage.restore();
    await first.storage.save(withFavourite(restored, 'C:\\a.md'));

    const reopened = await createStorage(first.workspaceStore, first.appState).storage.restore();

    expect(reopened.hasEarlierVersionChanges).toBe(false);
  });

  it('Clear All Data leaves one empty default workspace', async () => {
    const { storage, workspaceStore, appState } = createStorage();
    const restored = await storage.restore();
    await storage.save(withFavourite(restored, 'C:\\a.md'));

    await storage.clearAll();
    await storage.save(restoreAppState(undefined));
    const reopened = await createStorage(workspaceStore, appState).storage.restore();

    expect((await workspaceStore.loadRegistry()).map((workspace) => workspace.id)).toEqual(['default']);
    expect(reopened.favourites.favourites()).toEqual([]);
    expect(appState.backupRemovalCount).toBe(1);
  });

  it('Clear All Data still clears the store when a backup cannot be removed', async () => {
    const lockedBackups = new LockedBackupsAppState();
    const { storage, workspaceStore } = createStorage(undefined, lockedBackups);
    await storage.restore();
    await workspaceStore.saveWorkspace({
      id: 'reading',
      kindId: 'markdownViewer',
      name: 'Reading',
      icon: null,
      colour: null,
      position: 1,
      lastShownAtMs: null,
    });

    await expect(storage.clearAll()).rejects.toThrow('backup is locked');

    expect((await workspaceStore.loadRegistry()).map((workspace) => workspace.id)).toEqual(['default']);
  });

  it('Clear All Data still removes the backups when the store cannot be cleared', async () => {
    const { storage, workspaceStore, appState } = createStorage(undefined, new LockedBackupsAppState());
    await storage.restore();
    workspaceStore.clearAll = () => Promise.reject(new Error('database is locked'));
    const removeBackups = appState.removeBackups.bind(appState);
    let backupRemovalAttempts = 0;
    appState.removeBackups = () => {
      backupRemovalAttempts += 1;
      return removeBackups();
    };

    await expect(storage.clearAll()).rejects.toThrow('database is locked');

    expect(backupRemovalAttempts).toBe(1);
  });
});

class LockedBackupsAppState extends InMemoryAppState {
  override removeBackups(): Promise<void> {
    return Promise.reject(new Error('backup is locked'));
  }
}
