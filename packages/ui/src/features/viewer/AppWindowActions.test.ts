import { ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryAppWindows,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryWorkspaceStore,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it, vi } from 'vitest';
import { ViewerController, type ViewerSnapshot } from './ViewerController';

const GUIDE = 'C:\\Docs\\Guide.md';
const PLAN = 'C:\\Docs\\Plan.md';

function createWindow(workspaceStore: InMemoryWorkspaceStore, appWindows: InMemoryAppWindows) {
  const documentFiles = new InMemoryDocumentFiles({ [GUIDE]: '# Guide', [PLAN]: '# Plan' });
  let nextId = 0;
  const session = new ViewerSession({
    documentFiles,
    appState: new InMemoryAppState(),
    workspaceStore,
    now: () => Date.now(),
    createId: () => `workspace-${String((nextId += 1))}`,
    windowId: appWindows.windowId,
  });
  const controller = new ViewerController({
    session,
    requests: new InMemoryDocumentRequests([GUIDE]),
    renderer: createMarkdownRenderer({ window }),
    translator: createTranslator(),
    appWindows,
  });
  let latest: ViewerSnapshot | undefined;
  controller.subscribe((snapshot) => (latest = snapshot));
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  return { controller, session, snapshot };
}

async function startWindow(appWindows = new InMemoryAppWindows()) {
  const workspaceStore = new InMemoryWorkspaceStore();
  const window = createWindow(workspaceStore, appWindows);
  await window.controller.start();
  return { ...window, appWindows, workspaceStore };
}

describe('app windows', () => {
  it('switching to a workspace shown elsewhere focuses that window instead', async () => {
    const { controller, session, appWindows } = await startWindow();
    await controller.execute({ kind: 'createWorkspace', name: 'Handbook', kindId: 'markdownViewer' });
    await controller.execute({ kind: 'switchWorkspace', workspaceId: 'default' });
    appWindows.shownElsewhere.add('workspace-1');

    await controller.execute({ kind: 'switchWorkspace', workspaceId: 'workspace-1' });

    expect(appWindows.focusedWorkspaces).toEqual(['workspace-1']);
    expect(session.shownWorkspace()?.id).toBe('default');
  });

  it('a workspace Windows asks this window to show is shown here', async () => {
    const { controller, session, appWindows } = await startWindow();
    await controller.execute({ kind: 'createWorkspace', name: 'Handbook', kindId: 'markdownViewer' });
    await controller.execute({ kind: 'switchWorkspace', workspaceId: 'default' });
    appWindows.shownElsewhere.add('workspace-1');

    appWindows.askToShow('workspace-1');

    await vi.waitFor(() => expect(session.shownWorkspace()?.id).toBe('workspace-1'));
    expect(appWindows.focusedWorkspaces).toEqual([]);
  });

  it('reports its workspace, documents and folders, once per change', async () => {
    const { controller, appWindows } = await startWindow();
    const reportsAtStart = appWindows.reports.length;

    await controller.execute({ kind: 'toggleSidebar' });
    await controller.execute({ kind: 'newDocument' });

    expect(appWindows.reports.at(-1)).toEqual({
      workspaceId: 'default',
      openDocumentPaths: [GUIDE],
      rootPaths: [],
    });
    expect(appWindows.reports.length).toBe(reportsAtStart);
  });

  it('reports again when its documents change', async () => {
    const { controller, appWindows } = await startWindow();
    const reportsAtStart = appWindows.reports.length;

    await controller.execute({ kind: 'closeActiveTab' });

    expect(appWindows.reports.length).toBe(reportsAtStart + 1);
    expect(appWindows.reports.at(-1)?.openDocumentPaths).toEqual([]);
  });

  it('a favourite starred in another window of the workspace appears here', async () => {
    const appWindows = new InMemoryAppWindows('window-2');
    const { controller, snapshot, workspaceStore } = await startWindow(appWindows);
    const other = createWindow(workspaceStore, new InMemoryAppWindows('main'));
    await other.controller.start();
    await other.controller.execute({ kind: 'toggleFavourite' });
    await other.controller.saveNow();

    appWindows.changeListsElsewhere('default');

    await vi.waitFor(() => expect(snapshot().viewer.favourites.favourites()).toHaveLength(1));
    controller.stop();
    other.controller.stop();
  });

  it('opens on the workspace it was opened for', async () => {
    const workspaceStore = new InMemoryWorkspaceStore();
    const first = createWindow(workspaceStore, new InMemoryAppWindows('main'));
    await first.controller.start();
    await first.controller.execute({ kind: 'createWorkspace', name: 'Handbook', kindId: 'markdownViewer' });
    await first.controller.execute({ kind: 'switchWorkspace', workspaceId: 'default' });
    await first.controller.saveNow();
    const appWindows = new InMemoryAppWindows('window-2');
    appWindows.startupWorkspace = 'workspace-1';

    const second = createWindow(workspaceStore, appWindows);
    await second.controller.start();

    expect(second.session.shownWorkspace()?.name).toBe('Handbook');
  });

  it('says so when the workspace it was started with does not exist', async () => {
    const appWindows = new InMemoryAppWindows();
    appWindows.hasStartupWorkspaceNotice = true;

    const { snapshot } = await startWindow(appWindows);

    expect(snapshot().notice).toBe(
      'The workspace MDX was started with no longer exists, so this window shows the workspace used last.',
    );
  });

  it('says so when Windows asks for a workspace that does not exist', async () => {
    const { snapshot, appWindows } = await startWindow();

    appWindows.askForMissingWorkspace();

    expect(snapshot().notice).toBe('That workspace no longer exists.');
  });

  it('New Window saves this window first, so the new one starts from its lists', async () => {
    const { controller, appWindows, workspaceStore } = await startWindow();
    await controller.execute({ kind: 'toggleFavourite' });
    const saveList = vi.spyOn(workspaceStore, 'saveList');

    await controller.execute({ kind: 'openNewWindow' });

    expect(saveList).toHaveBeenCalled();
    expect(appWindows.openedWindowCount).toBe(1);
  });
});
