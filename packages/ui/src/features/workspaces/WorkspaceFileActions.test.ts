import { ViewerSession, workspaceKindsFor, type WorkspaceKind } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryWorkspaceFiles,
  InMemoryWorkspaceStore,
  type WorkspaceFileContents,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it, vi } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const HANDBOOK_FILE: WorkspaceFileContents = {
  path: 'D:\\team\\handbook.mdxworkspace',
  folder: 'D:\\team',
  text: JSON.stringify({
    format: 'mdx-workspace',
    formatVersion: 1,
    name: 'Handbook',
    kind: 'markdownViewer',
    icon: 'book',
    colour: 'teal',
    roots: ['docs'],
    favourites: [{ path: 'docs/guide.md', kind: 'file' }],
    favouriteGroups: [],
    settingsOverrides: { theme: 'dark' },
  }),
};

async function startViewer({
  kindRegistry = workspaceKindsFor({ allowsPlannedKindPreview: false }),
  workspaceFiles = new InMemoryWorkspaceFiles(),
}: { kindRegistry?: readonly WorkspaceKind[]; workspaceFiles?: InMemoryWorkspaceFiles } = {}) {
  const workspaceStore = new InMemoryWorkspaceStore();
  let nextId = 0;
  const session = new ViewerSession({
    documentFiles: new InMemoryDocumentFiles(),
    appState: new InMemoryAppState(),
    workspaceStore,
    kindRegistry,
    now: () => 1_000,
    createId: () => `workspace-${String((nextId += 1))}`,
  });
  const controller = new ViewerController({
    session,
    requests: new InMemoryDocumentRequests(),
    renderer: createMarkdownRenderer({ window }),
    translator: createTranslator(),
    workspaceFiles,
  });
  let latest: ViewerSnapshot | undefined;
  controller.subscribe((snapshot) => (latest = snapshot));
  await controller.start();
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  const workspaceNames = () =>
    snapshot()
      .workspaces?.registry.workspaces()
      .map((workspace) => workspace.name) ?? [];
  return { controller, session, workspaceStore, workspaceFiles, snapshot, workspaceNames };
}

describe('workspace files', () => {
  it('exports the shown workspace with relative paths and says how many are not', async () => {
    const { controller, session, workspaceFiles, snapshot } = await startViewer();
    await controller.execute({ kind: 'renameWorkspace', name: 'Handbook' });
    session.updateExplorerFolders((folders) =>
      folders.add({ canonicalKey: 'd:\\team\\docs', displayPath: 'D:\\team\\docs', fileName: 'docs' }),
    );
    session.updateExplorerFolders((folders) =>
      folders.add({ canonicalKey: 'e:\\shared', displayPath: 'E:\\shared', fileName: 'shared' }),
    );

    await controller.execute({ kind: 'exportWorkspace' });

    const written = JSON.parse(
      workspaceFiles.writtenFiles.get('D:\\team\\Handbook.mdxworkspace') ?? '{}',
    ) as {
      roots: string[];
    };
    expect(written.roots).toEqual(['docs', 'E:/shared']);
    expect(snapshot().notice).toBe(
      'Saved Handbook.mdxworkspace. 1 path is on another drive or share, so it was written in full.',
    );
  });

  it('does nothing when the save dialog is cancelled', async () => {
    const workspaceFiles = new InMemoryWorkspaceFiles();
    workspaceFiles.exportFolder = undefined;
    const { controller, snapshot } = await startViewer({ workspaceFiles });

    await controller.execute({ kind: 'exportWorkspace' });

    expect(workspaceFiles.writtenFiles.size).toBe(0);
    expect(snapshot().notice).toBeUndefined();
  });

  it('asks before opening a workspace file, and nothing is created or granted until then', async () => {
    const workspaceFiles = new InMemoryWorkspaceFiles();
    workspaceFiles.pickedFile = HANDBOOK_FILE;
    const { controller, snapshot, workspaceStore, workspaceNames } = await startViewer({ workspaceFiles });

    await controller.execute({ kind: 'openWorkspaceFile' });
    const grantedBeforeConfirming = [...workspaceStore.grantedWorkspaceIds];

    expect(snapshot().openDialog).toBe('openWorkspaceFile');
    expect(snapshot().workspaces?.pendingFile?.workspace.name).toBe('Handbook');
    expect(workspaceNames()).toEqual([null]);
    expect(grantedBeforeConfirming).toEqual(['default']);
  });

  it('confirming creates the workspace with its folders, favourites and settings, and shows it', async () => {
    const workspaceFiles = new InMemoryWorkspaceFiles();
    workspaceFiles.pickedFile = HANDBOOK_FILE;
    const { controller, snapshot, workspaceNames } = await startViewer({ workspaceFiles });

    await controller.execute({ kind: 'openWorkspaceFile' });
    await controller.execute({ kind: 'confirmOpenWorkspaceFile' });

    const viewer = snapshot().viewer;
    expect(workspaceNames()).toEqual([null, 'Handbook']);
    expect(viewer.explorerFolders.folders().map((folder) => folder.displayPath)).toEqual(['D:\\team\\docs']);
    expect(viewer.favourites.favourites().map((favourite) => favourite.location.displayPath)).toEqual([
      'D:\\team\\docs\\guide.md',
    ]);
    expect(viewer.viewSettings.theme).toBe('dark');
    expect(snapshot().openDialog).toBeUndefined();
  });

  it('cancelling creates nothing', async () => {
    const workspaceFiles = new InMemoryWorkspaceFiles();
    workspaceFiles.pickedFile = HANDBOOK_FILE;
    const { controller, snapshot, workspaceNames } = await startViewer({ workspaceFiles });

    await controller.execute({ kind: 'openWorkspaceFile' });
    await controller.execute({ kind: 'cancelOpenWorkspaceFile' });

    expect(workspaceNames()).toEqual([null]);
    expect(snapshot().openDialog).toBeUndefined();
  });

  it('reopening the same file switches instead of creating', async () => {
    const workspaceFiles = new InMemoryWorkspaceFiles();
    workspaceFiles.pickedFile = HANDBOOK_FILE;
    const { controller, snapshot, workspaceNames } = await startViewer({ workspaceFiles });
    await controller.execute({ kind: 'openWorkspaceFile' });
    await controller.execute({ kind: 'confirmOpenWorkspaceFile' });
    await controller.execute({ kind: 'switchWorkspace', workspaceId: 'default' });

    workspaceFiles.openFromWindows({ ...HANDBOOK_FILE, path: 'd:\\TEAM\\Handbook.mdxworkspace' });
    await vi.waitFor(() => expect(snapshot().workspaces?.shownWorkspaceId).toBe('workspace-1'));

    expect(workspaceNames()).toEqual([null, 'Handbook']);
    expect(snapshot().openDialog).toBeUndefined();
  });

  it('a second, different file with the same name gets a free name', async () => {
    const workspaceFiles = new InMemoryWorkspaceFiles();
    const { controller, workspaceNames } = await startViewer({ workspaceFiles });
    workspaceFiles.pickedFile = HANDBOOK_FILE;
    await controller.execute({ kind: 'openWorkspaceFile' });
    await controller.execute({ kind: 'confirmOpenWorkspaceFile' });

    workspaceFiles.pickedFile = {
      ...HANDBOOK_FILE,
      path: 'E:\\copy\\handbook.mdxworkspace',
      folder: 'E:\\copy',
    };
    await controller.execute({ kind: 'openWorkspaceFile' });
    await controller.execute({ kind: 'confirmOpenWorkspaceFile' });

    expect(workspaceNames()).toEqual([null, 'Handbook', 'Handbook 2']);
  });

  it.each([
    [
      'an unknown kind',
      { kind: 'timeMachine' },
      'This kind of workspace is not supported in this version of MDX.',
    ],
    ['a newer format', { formatVersion: 2 }, 'This workspace file was made by a newer version of MDX.'],
  ])('refuses a file with %s and says why', async (_description, change, message) => {
    const workspaceFiles = new InMemoryWorkspaceFiles();
    workspaceFiles.pickedFile = {
      ...HANDBOOK_FILE,
      text: JSON.stringify({ ...(JSON.parse(HANDBOOK_FILE.text) as object), ...change }),
    };
    const { controller, snapshot, workspaceNames } = await startViewer({ workspaceFiles });

    await controller.execute({ kind: 'openWorkspaceFile' });

    expect(snapshot().notice).toBe(message);
    expect(workspaceNames()).toEqual([null]);
  });

  it('a file for a turned-off kind offers to turn it on', async () => {
    const kindRegistry = workspaceKindsFor({ allowsPlannedKindPreview: true });
    const workspaceFiles = new InMemoryWorkspaceFiles();
    workspaceFiles.pickedFile = {
      ...HANDBOOK_FILE,
      text: JSON.stringify({
        ...(JSON.parse(HANDBOOK_FILE.text) as object),
        kind: 'specViewer',
        name: 'Specs',
      }),
    };
    const { controller, snapshot } = await startViewer({ kindRegistry, workspaceFiles });

    await controller.execute({ kind: 'openWorkspaceFile' });
    const isKindDisabled = snapshot().workspaces?.pendingFile?.isKindDisabled;
    await controller.execute({ kind: 'confirmOpenWorkspaceFile' });

    expect(isKindDisabled).toBe(true);
    expect(snapshot().viewer.workspaceKinds.isEnabled('specViewer')).toBe(true);
    expect(snapshot().viewer.workspaceKinds.activeKindId()).toBe('specViewer');
  });

  it('offers the workspace file the app was started with', async () => {
    const workspaceFiles = new InMemoryWorkspaceFiles();
    workspaceFiles.startupFile = HANDBOOK_FILE;

    const { snapshot } = await startViewer({ workspaceFiles });

    expect(snapshot().openDialog).toBe('openWorkspaceFile');
  });
});
