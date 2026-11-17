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

  it('lists another window saved replace this window’s lists and leave its tabs alone', async () => {
    const workspaceStore = new InMemoryWorkspaceStore();
    const main = createWindowSession(workspaceStore, 'main');
    const second = createWindowSession(workspaceStore, 'window-2');
    await main.restore();
    await second.restore();
    await second.openDocument(PLAN);
    const guide = await main.openDocument(GUIDE);
    main.updateFavourites((favourites) => favourites.add(guide.location, 'file'));
    await main.save();
    const saveList = vi.spyOn(workspaceStore, 'saveList');

    await second.reloadWorkspaceLists('default');
    await second.save();

    expect(second.currentState().favourites.isFavourite(guide.location.canonicalKey)).toBe(true);
    expect(tabNamesOf(second)).toEqual(['Plan.md']);
    expect(saveList).not.toHaveBeenCalled();
  });

  it('ignores list changes of a workspace it does not show', async () => {
    const workspaceStore = new InMemoryWorkspaceStore();
    const second = createWindowSession(workspaceStore, 'window-2');
    await second.restore();
    const loadWorkspace = vi.spyOn(workspaceStore, 'loadWorkspace');

    await second.reloadWorkspaceLists('handbook');

    expect(loadWorkspace).not.toHaveBeenCalled();
  });
});
