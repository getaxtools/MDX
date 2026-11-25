import {
  AppStateRefusedError,
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryWorkspaceStore,
  type WorkspaceListName,
} from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { FavouritesList } from '../favourites/FavouritesList';
import { restoreAppState, toPersistedAppState, type ViewerState } from '../session/persistedAppState';
import { WORKSPACE_KINDS } from '../workspace-kinds/workspaceKinds';
import { hashOf, WorkspaceStateStorage } from './WorkspaceStateStorage';

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

class AppStateRefusingField extends InMemoryAppState {
  constructor(
    storedState: unknown,
    private readonly refusedField: string,
  ) {
    super(storedState);
  }

  override save(state: unknown): Promise<void> {
    if (this.refusedField in (state as object)) return Promise.reject(new AppStateRefusedError());
    return super.save(state);
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

  it('the copy keeps the fields a newer version saved in the earlier state', async () => {
    const boardLayout = { columns: ['Ideas', 'Done'], isCompact: true };
    const earlierState = { ...(earlierStateWithFavourite('C:\\a.md') as object), boardLayout };
    const first = createStorage(undefined, new InMemoryAppState(earlierState));
    const migrated = await first.storage.restore();
    await first.storage.save(withFavourite(migrated, 'C:\\b.md'));
    const second = createStorage(first.workspaceStore, first.appState);
    const restored = await second.storage.restore();

    await second.storage.save(withFavourite(restored, 'C:\\c.md'));

    const copy = await second.appState.load();
    expect(copy).toMatchObject({ boardLayout });
    expect(restored.hasEarlierVersionChanges).toBe(false);
    expect((await second.workspaceStore.loadAppValues()).earlierVersionCopyHash).toBe(
      hashOf(JSON.stringify(copy)),
    );
  });

  it('the copy keeps the view settings a newer version saved in the earlier state', async () => {
    const earlier = earlierStateWithFavourite('C:\\a.md') as { view: object };
    const earlierState = { ...earlier, view: { ...earlier.view, minimapSide: 'left' } };
    const first = createStorage(undefined, new InMemoryAppState(earlierState));
    const migrated = await first.storage.restore();
    await first.storage.save(withFavourite(migrated, 'C:\\b.md'));
    const second = createStorage(first.workspaceStore, first.appState);
    const restored = await second.storage.restore();

    await second.storage.save(withFavourite(restored, 'C:\\c.md'));

    const copy = await second.appState.load();
    expect(copy).toMatchObject({ view: { minimapSide: 'left' } });
    expect(restored.hasEarlierVersionChanges).toBe(false);
    expect((await second.workspaceStore.loadAppValues()).earlierVersionCopyHash).toBe(
      hashOf(JSON.stringify(copy)),
    );
  });

  it('the earlier state file keeps the fields a newer version saved when the store cannot be used', async () => {
    const boardLayout = { columns: ['Ideas', 'Done'], isCompact: true };
    const earlierState = { ...(earlierStateWithFavourite('C:\\a.md') as object), boardLayout };
    const workspaceStore = new RecordingWorkspaceStore();
    workspaceStore.loadRegistry = () => Promise.reject(new Error('database is locked'));
    const { storage, appState } = createStorage(workspaceStore, new InMemoryAppState(earlierState));
    const restored = await storage.restore();

    await storage.save(withFavourite(restored, 'C:\\b.md'));

    expect(await appState.load()).toMatchObject({ boardLayout });
    expect(workspaceStore.writes).toEqual([]);
  });

  it('a copy refused with the fields a newer version saved is written without them', async () => {
    const earlierState = { ...(earlierStateWithFavourite('C:\\a.md') as object), boardLayout: {} };
    const appState = new AppStateRefusingField(earlierState, 'boardLayout');
    const first = createStorage(undefined, appState);
    const migrated = await first.storage.restore();
    await first.storage.save(withFavourite(migrated, 'C:\\b.md'));
    const second = createStorage(first.workspaceStore, appState);

    const restored = await second.storage.restore();

    expect(await appState.load()).not.toHaveProperty('boardLayout');
    expect(restored.hasEarlierVersionChanges).toBe(false);
    expect(restored.favourites.isFavourite(location('C:\\b.md').canonicalKey)).toBe(true);
  });

  it('Clear All Data forgets the fields a newer version saved in the earlier state', async () => {
    const earlierState = { ...(earlierStateWithFavourite('C:\\a.md') as object), boardLayout: {} };
    const { storage, appState } = createStorage(undefined, new InMemoryAppState(earlierState));
    await storage.restore();

    await storage.clearAll();
    await storage.save(withFavourite(restoreAppState(undefined), 'C:\\b.md'));

    expect(await appState.load()).not.toHaveProperty('boardLayout');
  });

  it('a changed view setting keeps the view settings a newer version saved', async () => {
    const first = createStorage();
    await first.storage.restore();
    const { viewSettings } = await first.workspaceStore.loadAppValues();
    await first.workspaceStore.saveAppValue('viewSettings', {
      ...(viewSettings as object),
      minimapSide: 'left',
    });
    const second = createStorage(first.workspaceStore, first.appState);
    const restored = await second.storage.restore();

    await second.storage.save({ ...restored, viewSettings: { ...restored.viewSettings, theme: 'dark' } });

    expect((await second.workspaceStore.loadAppValues()).viewSettings).toMatchObject({
      theme: 'dark',
      minimapSide: 'left',
    });
  });

  it('Clear All Data forgets the view settings a newer version saved', async () => {
    const first = createStorage();
    await first.storage.restore();
    const { viewSettings } = await first.workspaceStore.loadAppValues();
    await first.workspaceStore.saveAppValue('viewSettings', {
      ...(viewSettings as object),
      minimapSide: 'left',
    });
    const second = createStorage(first.workspaceStore, first.appState);
    const restored = await second.storage.restore();

    await second.storage.clearAll();
    await second.storage.save({ ...restored, viewSettings: { ...restored.viewSettings, theme: 'dark' } });

    expect((await second.workspaceStore.loadAppValues()).viewSettings).not.toHaveProperty('minimapSide');
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

  it('a Clear All Data that deleted the workspaces and then failed leaves the default workspace to save into', async () => {
    const { storage, workspaceStore } = createStorage();
    const restored = await storage.restore();
    await storage.save(withFavourite(restored, 'C:\\a.md'));
    workspaceStore.nextClearFailure = 'afterDeleting';

    await expect(storage.clearAll()).rejects.toThrow('log could not be emptied');
    await storage.save(withFavourite(restoreAppState(undefined), 'C:\\b.md'));

    expect(shownWorkspaceIds(storage)).toEqual(['default']);
    expect((await workspaceStore.loadRegistry()).map((workspace) => workspace.id)).toEqual(['default']);
  });

  it('a Clear All Data that failed before deleting still lists the workspaces the store holds', async () => {
    const { storage, workspaceStore } = createStorage();
    const restored = await storage.restore();
    await saveReadingWorkspace(workspaceStore);
    await storage.reloadRegistry();
    await storage.switchTo('reading', restored);
    workspaceStore.nextClearFailure = 'beforeDeleting';

    await expect(storage.clearAll()).rejects.toThrow('rolled back');

    expect(shownWorkspaceIds(storage)).toEqual(['default', 'reading']);
    expect(storage.shownWorkspace()?.id).toBe('default');
  });

  it('a Clear All Data that failed and whose store cannot be read back lists only the default workspace', async () => {
    const { storage, workspaceStore } = createStorage();
    const restored = await storage.restore();
    await saveReadingWorkspace(workspaceStore);
    await storage.reloadRegistry();
    await storage.switchTo('reading', restored);
    workspaceStore.nextClearFailure = 'afterDeleting';
    workspaceStore.loadRegistry = () => Promise.reject(new Error('database is locked'));

    await expect(storage.clearAll()).rejects.toThrow('log could not be emptied');

    expect(shownWorkspaceIds(storage)).toEqual(['default']);
    expect(storage.shownWorkspace()?.id).toBe('default');
  });

  it('a Clear All Data whose store cannot be read back after clearing lists only the default workspace', async () => {
    const { storage, workspaceStore } = createStorage();
    const restored = await storage.restore();
    await saveReadingWorkspace(workspaceStore);
    await storage.reloadRegistry();
    await storage.switchTo('reading', restored);
    workspaceStore.loadRegistry = () => Promise.reject(new Error('database is locked'));

    await expect(storage.clearAll()).rejects.toThrow('database is locked');

    expect(shownWorkspaceIds(storage)).toEqual(['default']);
    expect(storage.shownWorkspace()?.id).toBe('default');
  });

  it('Clear All Data on the earlier state file still clears the store when it can be opened', async () => {
    const workspaceStore = new RecordingWorkspaceStore();
    workspaceStore.failsNextImport = true;
    const { storage } = createStorage(workspaceStore);
    await storage.restore();
    await saveReadingWorkspace(workspaceStore);

    await storage.clearAll();

    expect(await workspaceStore.loadRegistry()).toEqual([]);
    expect(storage.hasWorkspaces()).toBe(false);
  });

  it('after Clear All Data on the earlier state file the next start has one empty default workspace', async () => {
    const workspaceStore = new RecordingWorkspaceStore();
    workspaceStore.failsNextImport = true;
    const appState = new InMemoryAppState(earlierStateWithFavourite('C:\\a.md'));
    const { storage } = createStorage(workspaceStore, appState);
    await storage.restore();
    await saveReadingWorkspace(workspaceStore);

    await storage.clearAll();
    await storage.save(restoreAppState(undefined));
    const reopened = await createStorage(workspaceStore, appState).storage.restore();

    expect((await workspaceStore.loadRegistry()).map((workspace) => workspace.id)).toEqual(['default']);
    expect(reopened.favourites.favourites()).toEqual([]);
  });

  it('Clear All Data on the earlier state file fails when a backup cannot be removed', async () => {
    const workspaceStore = new RecordingWorkspaceStore();
    workspaceStore.failsNextImport = true;
    const { storage } = createStorage(workspaceStore, new LockedBackupsAppState());
    await storage.restore();
    await saveReadingWorkspace(workspaceStore);

    await expect(storage.clearAll()).rejects.toThrow('backup is locked');

    expect(await workspaceStore.loadRegistry()).toEqual([]);
  });

  it('Clear All Data on the earlier state file fails when the store cannot be cleared', async () => {
    const workspaceStore = new RecordingWorkspaceStore();
    workspaceStore.loadRegistry = () => Promise.reject(new Error('written by a newer version'));
    workspaceStore.clearAll = () => Promise.reject(new Error('written by a newer version'));
    const { storage, appState } = createStorage(workspaceStore);
    await storage.restore();

    await expect(storage.clearAll()).rejects.toThrow('newer version');

    expect(appState.backupRemovalCount).toBe(1);
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

function shownWorkspaceIds(storage: WorkspaceStateStorage): string[] {
  return storage
    .workspaces()
    .workspaces()
    .map((workspace) => workspace.id);
}

function saveReadingWorkspace(workspaceStore: InMemoryWorkspaceStore): Promise<void> {
  return workspaceStore.saveWorkspace({
    id: 'reading',
    kindId: 'markdownViewer',
    name: 'Reading',
    icon: null,
    colour: null,
    position: 1,
    lastShownAtMs: null,
  });
}

class LockedBackupsAppState extends InMemoryAppState {
  override removeBackups(): Promise<void> {
    return Promise.reject(new Error('backup is locked'));
  }
}
