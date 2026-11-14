import { InMemoryAppState, InMemoryDocumentFiles, InMemoryWorkspaceStore } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { ViewerSession } from './ViewerSession';

const GUIDE = 'C:\\Docs\\Guide.md';
const NOTES = 'C:\\Docs\\Notes.md';
const PLAN = 'C:\\Docs\\Plan.md';

function createSession(workspaceStore = new InMemoryWorkspaceStore(), appState = new InMemoryAppState()) {
  const documentFiles = new InMemoryDocumentFiles({
    [GUIDE]: '# Guide',
    [NOTES]: '# Notes',
    [PLAN]: '# Plan',
  });
  let nextId = 0;
  let clockMs = 1_000;
  const session = new ViewerSession({
    documentFiles,
    appState,
    workspaceStore,
    now: () => (clockMs += 1),
    createId: () => `workspace-${String((nextId += 1))}`,
  });
  return { session, workspaceStore, appState };
}

const tabNamesOf = (session: ViewerSession) =>
  session
    .currentState()
    .tabStrip.tabs()
    .map((tab) => tab.location.fileName);

describe('ViewerSession workspaces', () => {
  it('starts in the Default workspace, named from the catalog', async () => {
    const { session } = createSession();

    await session.restore();

    expect(session.shownWorkspace()).toMatchObject({ id: 'default', name: null, kindId: 'markdownViewer' });
  });

  it('creating a workspace shows it with no tabs', async () => {
    const { session } = createSession();
    await session.restore();
    await session.openDocument(GUIDE);

    const change = await session.createWorkspace({ name: 'Handbook', kindId: 'markdownViewer' });

    expect(change?.outcome).toBe('changed');
    expect(session.shownWorkspace()?.name).toBe('Handbook');
    expect(tabNamesOf(session)).toEqual([]);
  });

  it('switch and back restores both tab sets', async () => {
    const { session } = createSession();
    await session.restore();
    await session.openDocument(GUIDE);
    await session.openDocument(NOTES);
    await session.openDocument(PLAN);
    session.updateTabs((tabStrip) => tabStrip.activate(tabStrip.tabs()[1]?.location.canonicalKey ?? ''));
    await session.createWorkspace({ name: 'Handbook', kindId: 'markdownViewer' });
    await session.openDocument(PLAN);

    await session.switchWorkspace('default');
    const defaultTabs = tabNamesOf(session);
    const defaultActive = session.currentState().tabStrip.activeTab()?.location.fileName;
    await session.switchWorkspace('workspace-1');

    expect(defaultTabs).toEqual(['Guide.md', 'Notes.md', 'Plan.md']);
    expect(defaultActive).toBe('Notes.md');
    expect(tabNamesOf(session)).toEqual(['Plan.md']);
  });

  it('recent files and favourites are per workspace', async () => {
    const { session } = createSession();
    await session.restore();
    const guide = await session.openDocument(GUIDE);
    session.updateFavourites((favourites) => favourites.add(guide.location, 'file'));

    await session.createWorkspace({ name: 'Handbook', kindId: 'markdownViewer' });

    expect(session.currentState().recentFiles.entries()).toEqual([]);
    expect(session.currentState().favourites.favourites()).toEqual([]);
    await session.switchWorkspace('default');
    expect(session.currentState().favourites.isFavourite(guide.location.canonicalKey)).toBe(true);
  });

  it('keeps app-wide settings across a switch', async () => {
    const { session } = createSession();
    await session.restore();
    session.updateViewSettings((settings) => ({ ...settings, zoomPercent: 150, sidebarView: 'outline' }));

    await session.createWorkspace({ name: 'Handbook', kindId: 'markdownViewer' });

    expect(session.currentState().viewSettings.zoomPercent).toBe(150);
    expect(session.currentState().viewSettings.sidebarView).toBe('explorer');
  });

  it('grants access to the folders of the workspace it shows', async () => {
    const { session, workspaceStore } = createSession();
    await session.restore();

    await session.createWorkspace({ name: 'Handbook', kindId: 'markdownViewer' });

    expect(workspaceStore.grantedWorkspaceIds).toEqual(['default', 'workspace-1']);
  });

  it('restart restores the workspace shown last with its tabs', async () => {
    const first = createSession();
    await first.session.restore();
    await first.session.createWorkspace({ name: 'Handbook', kindId: 'markdownViewer' });
    await first.session.openDocument(PLAN);
    await first.session.save();

    const second = createSession(first.workspaceStore, first.appState);
    await second.session.restore();

    expect(second.session.shownWorkspace()?.name).toBe('Handbook');
    expect(tabNamesOf(second.session)).toEqual(['Plan.md']);
  });

  it('renames a workspace and refuses a duplicate name', async () => {
    const { session } = createSession();
    await session.restore();
    await session.createWorkspace({ name: 'Handbook', kindId: 'markdownViewer' });

    const renamed = await session.renameWorkspace('default', 'Reading');
    const duplicate = await session.renameWorkspace('default', 'handbook');

    expect(renamed?.outcome).toBe('changed');
    expect(session.workspaces()?.find('default')?.name).toBe('Reading');
    expect(duplicate).toEqual({ outcome: 'refused', problem: 'duplicate' });
  });

  it('deleting the shown workspace shows the Markdown viewer workspace used before it', async () => {
    const { session } = createSession();
    await session.restore();
    await session.openDocument(GUIDE);
    await session.createWorkspace({ name: 'Handbook', kindId: 'markdownViewer' });

    const removal = await session.deleteWorkspace('workspace-1');

    expect(removal?.outcome).toBe('removed');
    expect(session.shownWorkspace()?.id).toBe('default');
    expect(tabNamesOf(session)).toEqual(['Guide.md']);
    expect(
      session
        .workspaces()
        ?.workspaces()
        .map((workspace) => workspace.id),
    ).toEqual(['default']);
  });

  it('has no workspaces when it keeps the earlier single state file', async () => {
    const legacy = new ViewerSession({
      documentFiles: new InMemoryDocumentFiles(),
      appState: new InMemoryAppState(),
      now: () => 0,
    });

    await legacy.restore();

    expect(legacy.workspaces()).toBeUndefined();
    expect(await legacy.createWorkspace({ name: 'Handbook', kindId: 'markdownViewer' })).toBeUndefined();
  });
});
