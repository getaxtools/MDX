import { describe, expect, it } from 'vitest';
import { UnknownWorkspaceError, type StoredWorkspace } from '../WorkspaceStorePort';
import { InMemoryWorkspaceStore } from './InMemoryWorkspaceStore';

function workspace(id: string, name: string, position: number): StoredWorkspace {
  return { id, kindId: 'markdownViewer', name, icon: null, colour: null, position, lastShownAtMs: null };
}

describe('InMemoryWorkspaceStore', () => {
  it('lists workspaces in their order', async () => {
    const store = new InMemoryWorkspaceStore();
    await store.saveWorkspace(workspace('second', 'Second', 1));
    await store.saveWorkspace(workspace('default', 'Default', 0));

    const names = (await store.loadRegistry()).map((stored) => stored.name);

    expect(names).toEqual(['Default', 'Second']);
  });

  it('renames a workspace saved again and keeps its lists', async () => {
    const store = new InMemoryWorkspaceStore();
    await store.saveWorkspace(workspace('default', 'Default', 0));
    await store.saveList('default', 'favourites', [1]);

    await store.saveWorkspace(workspace('default', 'Reading', 0));

    expect((await store.loadRegistry())[0]?.name).toBe('Reading');
    expect((await store.loadWorkspace('default', 'main'))?.lists).toEqual({ favourites: [1] });
  });

  it('round trips lists and the window session', async () => {
    const store = new InMemoryWorkspaceStore();
    await store.saveWorkspace(workspace('default', 'Default', 0));

    await store.saveList('default', 'recentFiles', []);
    await store.saveWindowSession('main', 'default', { tabs: [] });

    expect(await store.loadWorkspace('default', 'main')).toEqual({
      lists: { recentFiles: [] },
      windowSession: { tabs: [] },
    });
    expect((await store.loadWorkspace('default', 'second'))?.windowSession).toBeNull();
  });

  it('has no contents for an unknown workspace and refuses lists for it', async () => {
    const store = new InMemoryWorkspaceStore();

    expect(await store.loadWorkspace('missing', 'main')).toBeUndefined();
    await expect(store.saveList('missing', 'favourites', [])).rejects.toBeInstanceOf(UnknownWorkspaceError);
  });

  it('removes the lists and sessions with a deleted workspace', async () => {
    const store = new InMemoryWorkspaceStore();
    await store.saveWorkspace(workspace('other', 'Other', 1));
    await store.saveList('other', 'favourites', [1]);

    await store.deleteWorkspace('other');
    await store.saveWorkspace(workspace('other', 'Other', 1));

    expect(await store.loadWorkspace('other', 'main')).toEqual({ lists: {}, windowSession: null });
  });

  it('round trips app values', async () => {
    const store = new InMemoryWorkspaceStore();

    await store.saveAppValue('controlWheel', { dock: 'left' });

    expect(await store.loadAppValues()).toEqual({ controlWheel: { dock: 'left' } });
  });
});
