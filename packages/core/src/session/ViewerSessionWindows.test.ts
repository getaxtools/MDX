import { InMemoryAppState, InMemoryDocumentFiles, InMemoryWorkspaceStore } from '@mdx/platform';
import { describe, expect, it, vi } from 'vitest';
import { ViewerSession } from './ViewerSession';

const GUIDE = 'C:\\Docs\\Guide.md';
const PLAN = 'C:\\Docs\\Plan.md';

function createWindowSession(workspaceStore: InMemoryWorkspaceStore, windowId: string) {
  let clockMs = 1_000;
  let nextId = 0;
  return new ViewerSession({
    documentFiles: new InMemoryDocumentFiles({ [GUIDE]: '# Guide', [PLAN]: '# Plan' }),
    appState: new InMemoryAppState(),
    workspaceStore,
    now: () => (clockMs += 1),
    createId: () => `${windowId}-workspace-${String((nextId += 1))}`,
    windowId,
  });
}

const tabNamesOf = (session: ViewerSession) =>
  session
    .currentState()
    .tabStrip.tabs()
    .map((tab) => tab.location.fileName);

describe('ViewerSession in several windows', () => {
  it('each window keeps its own tabs and layout', async () => {
    const workspaceStore = new InMemoryWorkspaceStore();
    const main = createWindowSession(workspaceStore, 'main');
    const second = createWindowSession(workspaceStore, 'window-2');
    await main.restore();
    await second.restore();
    await main.openDocument(GUIDE);
    await second.openDocument(PLAN);
    second.updateViewSettings((settings) => ({ ...settings, isSidebarVisible: false }));
    await main.save();
    await second.save();

    const mainAgain = createWindowSession(workspaceStore, 'main');
    const secondAgain = createWindowSession(workspaceStore, 'window-2');
    await mainAgain.restore();
    await secondAgain.restore();

    expect(tabNamesOf(mainAgain)).toEqual(['Guide.md']);
    expect(tabNamesOf(secondAgain)).toEqual(['Plan.md']);
    expect(mainAgain.currentState().viewSettings.isSidebarVisible).toBe(true);
    expect(secondAgain.currentState().viewSettings.isSidebarVisible).toBe(false);
  });

  it('a window opened on a workspace shows it with no tabs of its own yet', async () => {
    const workspaceStore = new InMemoryWorkspaceStore();
    const main = createWindowSession(workspaceStore, 'main');
    await main.restore();
    await main.createWorkspace({ name: 'Handbook', kindId: 'markdownViewer' });
    await main.openDocument(GUIDE);
    await main.switchWorkspace('default');
    await main.save();

    const second = createWindowSession(workspaceStore, 'window-2');
    await second.restore('main-workspace-1');

    expect(second.shownWorkspace()?.name).toBe('Handbook');
    expect(tabNamesOf(second)).toEqual([]);
  });

  it('a preferred workspace that no longer exists falls back to the one shown last', async () => {
    const session = createWindowSession(new InMemoryWorkspaceStore(), 'window-2');

    await session.restore('deleted-workspace');

    expect(session.shownWorkspace()?.id).toBe('default');
  });

  it('a list another window saved replaces this window’s list and leaves its tabs alone', async () => {
    const { workspaceStore, main, second } = await twoWindowsOnTheDefaultWorkspace();
    await second.openDocument(PLAN);
    const guide = await starInMainAndSave(main);
    const saveList = vi.spyOn(workspaceStore, 'saveList');

    await second.reloadWorkspaceList('default', 'favourites');
    await second.save();

    expect(second.currentState().favourites.isFavourite(guide.location.canonicalKey)).toBe(true);
    expect(tabNamesOf(second)).toEqual(['Plan.md']);
    expect(saveList).not.toHaveBeenCalledWith('default', 'favourites', expect.anything());
  });

  it('only the list named is read again', async () => {
    const { main, second } = await twoWindowsOnTheDefaultWorkspace();
    await second.openDocument(PLAN);
    await starInMainAndSave(main);

    await second.reloadWorkspaceList('default', 'recentFiles');

    expect(second.currentState().favourites.favourites()).toEqual([]);
  });

  it('an unsaved change to the list in this window is kept', async () => {
    const { main, second } = await twoWindowsOnTheDefaultWorkspace();
    const plan = await second.openDocument(PLAN);
    second.updateFavourites((favourites) => favourites.add(plan.location, 'file'));
    await starInMainAndSave(main);

    await second.reloadWorkspaceList('default', 'favourites');

    expect(namesOfFavourites(second)).toEqual(['Plan.md']);
  });

  it('a change made while the list is read is kept', async () => {
    const { workspaceStore, main, second } = await twoWindowsOnTheDefaultWorkspace();
    await starInMainAndSave(main);
    const reading = deferredLoad(workspaceStore);

    const reloading = second.reloadWorkspaceList('default', 'favourites');
    const plan = await second.openDocument(PLAN);
    second.updateFavourites((favourites) => favourites.add(plan.location, 'file'));
    reading.finish();
    await reloading;

    expect(namesOfFavourites(second)).toEqual(['Plan.md']);
  });

  it('a list read after the window moved to another workspace is dropped', async () => {
    const { workspaceStore, main, second } = await twoWindowsOnTheDefaultWorkspace();
    await second.createWorkspace({ name: 'Handbook', kindId: 'markdownViewer' });
    await second.switchWorkspace('default');
    await starInMainAndSave(main);
    const reading = deferredLoad(workspaceStore);

    const reloading = second.reloadWorkspaceList('default', 'favourites');
    await second.switchWorkspace('window-2-workspace-1');
    reading.finish();
    await reloading;

    expect(second.shownWorkspace()?.name).toBe('Handbook');
    expect(namesOfFavourites(second)).toEqual([]);
  });

  it('ignores list changes of a workspace it does not show', async () => {
    const workspaceStore = new InMemoryWorkspaceStore();
    const second = createWindowSession(workspaceStore, 'window-2');
    await second.restore();
    const loadWorkspace = vi.spyOn(workspaceStore, 'loadWorkspace');

    await second.reloadWorkspaceList('handbook', 'favourites');

    expect(loadWorkspace).not.toHaveBeenCalled();
  });

  it('a window under a reused label starts empty once the old window’s sessions are gone', async () => {
    const workspaceStore = new InMemoryWorkspaceStore();
    const closed = createWindowSession(workspaceStore, 'window-2');
    await closed.restore();
    await closed.openDocument(GUIDE);
    await closed.save();
    const staleTabs = await sessionTabsOf(workspaceStore, 'window-2');

    workspaceStore.deleteWindowSessions('window-2');
    const reopened = createWindowSession(workspaceStore, 'window-2');
    await reopened.restore();

    expect(staleTabs).toEqual(['Guide.md']);
    expect(tabNamesOf(reopened)).toEqual([]);
  });

  it('a workspace deleted in another window moves this window to the one used before', async () => {
    const { workspaceStore, main, second } = await twoWindowsOnTheDefaultWorkspace();
    await second.createWorkspace({ name: 'Handbook', kindId: 'markdownViewer' });
    await second.openDocument(PLAN);
    const saveList = vi.spyOn(workspaceStore, 'saveList');
    await main.restore();
    await main.deleteWorkspace('window-2-workspace-1');

    const hasMoved = await second.leaveDeletedWorkspace('window-2-workspace-1');

    expect(hasMoved).toBe(true);
    expect(second.shownWorkspace()?.id).toBe('default');
    expect(second.workspaces()?.find('window-2-workspace-1')).toBeUndefined();
    expect(saveList).not.toHaveBeenCalledWith('window-2-workspace-1', expect.anything(), expect.anything());
  });
});

async function twoWindowsOnTheDefaultWorkspace() {
  const workspaceStore = new InMemoryWorkspaceStore();
  const main = createWindowSession(workspaceStore, 'main');
  const second = createWindowSession(workspaceStore, 'window-2');
  await main.restore();
  await second.restore();
  return { workspaceStore, main, second };
}

async function starInMainAndSave(main: ViewerSession) {
  const guide = await main.openDocument(GUIDE);
  main.updateFavourites((favourites) => favourites.add(guide.location, 'file'));
  await main.save();
  return guide;
}

const namesOfFavourites = (session: ViewerSession) =>
  session
    .currentState()
    .favourites.favourites()
    .map((favourite) => favourite.location.fileName);

/** Holds the next workspace read until `finish`, to act in the window while the list is read. */
function deferredLoad(workspaceStore: InMemoryWorkspaceStore) {
  const load = workspaceStore.loadWorkspace.bind(workspaceStore);
  const release: { finish?: () => void } = {};
  const released = new Promise<void>((resolve) => {
    release.finish = resolve;
  });
  vi.spyOn(workspaceStore, 'loadWorkspace').mockImplementationOnce(async (workspaceId, windowId) => {
    await released;
    return load(workspaceId, windowId);
  });
  return { finish: () => release.finish?.() };
}

async function sessionTabsOf(workspaceStore: InMemoryWorkspaceStore, windowId: string) {
  const contents = await workspaceStore.loadWorkspace('default', windowId);
  const session = contents?.windowSession as {
    tabs?: { tabs?: { location: { fileName: string } }[] };
  } | null;
  return (session?.tabs?.tabs ?? []).map((tab) => tab.location.fileName);
}
