import { ViewerSession, WorkspaceKindsState, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryNotesLocations,
  InMemoryWorkspaceStore,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';
import { paletteCommands } from '../command-palette/paletteCommands';
import { COMMAND_SHORTCUTS } from '../shortcuts/commandShortcuts';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const GUIDE = 'C:\\Docs\\Guide.md';
const NOTES = 'C:\\Docs\\Notes.md';
const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });

async function startViewer(startupPaths: readonly string[] = [GUIDE]) {
  const documentFiles = new InMemoryDocumentFiles({ [GUIDE]: '# Guide', [NOTES]: '# Notes' });
  let nextId = 0;
  const session = new ViewerSession({
    documentFiles,
    appState: new InMemoryAppState(),
    workspaceStore: new InMemoryWorkspaceStore(),
    kindRegistry: ALL_KINDS_BUILT,
    now: () => Date.now(),
    createId: () => `workspace-${String((nextId += 1))}`,
  });
  const controller = new ViewerController({
    session,
    requests: new InMemoryDocumentRequests([...startupPaths]),
    renderer: createMarkdownRenderer({ window }),
    translator: createTranslator(),
    notesLocations: new InMemoryNotesLocations(),
  });
  let latest: ViewerSnapshot | undefined;
  controller.subscribe((snapshot) => (latest = snapshot));
  await controller.start();
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  const tabNames = () =>
    snapshot()
      .viewer.tabStrip.tabs()
      .map((tab) => tab.location.fileName);
  return { controller, session, snapshot, tabNames };
}

/** Shows Default, with a notes workspace Journal shown last of its kind. */
async function startViewerWithJournal() {
  const viewer = await startViewer();
  viewer.session.updateWorkspaceKinds(() =>
    WorkspaceKindsState.fromSaved(
      { enabledKindIds: ['markdownViewer', 'notes'], activeKindId: 'markdownViewer' },
      ALL_KINDS_BUILT,
    ),
  );
  await viewer.controller.execute({
    kind: 'createWorkspace',
    name: 'Journal',
    kindId: 'notes',
    notesLocationPath: 'C:\\Users\\Ana\\Documents\\MDX Notes',
  });
  await viewer.controller.execute({ kind: 'switchWorkspaceKind', kindId: 'markdownViewer' });
  return viewer;
}

describe('workspace actions', () => {
  it('creates a workspace from the palette, switches to it and back', async () => {
    const { controller, snapshot, tabNames } = await startViewer();

    await controller.execute({ kind: 'showNewWorkspace' });
    expect(snapshot().openDialog).toBe('newWorkspace');
    await controller.execute({ kind: 'createWorkspace', name: 'Handbook', kindId: 'markdownViewer' });
    const tabsInHandbook = tabNames();
    await controller.execute({ kind: 'switchWorkspace', workspaceId: 'default' });

    expect(snapshot().openDialog).toBeUndefined();
    expect(tabsInHandbook).toEqual([]);
    expect(tabNames()).toEqual(['Guide.md']);
    expect(snapshot().activeDocument?.fileName).toBe('Guide.md');
  });

  it('unsaved edits prompt before switching, and cancelling stays put', async () => {
    const { controller, snapshot, tabNames } = await startViewer();
    await controller.execute({ kind: 'createWorkspace', name: 'Handbook', kindId: 'markdownViewer' });
    await controller.execute({ kind: 'switchWorkspace', workspaceId: 'default' });
    await controller.execute({ kind: 'toggleEditing' });
    controller.updateEditedText(snapshot().activeDocument?.canonicalKey ?? '', '# Changed');

    const switching = controller.execute({ kind: 'switchWorkspace', workspaceId: 'workspace-1' });
    const askedAbout = snapshot().unsavedChanges?.fileNames;
    await controller.answerUnsavedChanges('cancel');
    await switching;

    expect(askedAbout).toEqual(['Guide.md']);
    expect(snapshot().workspaces?.shownWorkspaceId).toBe('default');
    expect(tabNames()).toEqual(['Guide.md']);
  });

  it('switches after the unsaved edits are discarded', async () => {
    const { controller, snapshot } = await startViewer();
    await controller.execute({ kind: 'createWorkspace', name: 'Handbook', kindId: 'markdownViewer' });
    await controller.execute({ kind: 'switchWorkspace', workspaceId: 'default' });
    await controller.execute({ kind: 'toggleEditing' });
    controller.updateEditedText(snapshot().activeDocument?.canonicalKey ?? '', '# Changed');

    const switching = controller.execute({ kind: 'switchWorkspace', workspaceId: 'workspace-1' });
    await controller.answerUnsavedChanges('discard');
    await switching;

    expect(snapshot().workspaces?.shownWorkspaceId).toBe('workspace-1');
    expect(snapshot().unsavedDocumentKeys.size).toBe(0);
  });

  it('renames the shown workspace', async () => {
    const { controller, snapshot } = await startViewer();

    await controller.execute({ kind: 'showRenameWorkspace' });
    await controller.execute({ kind: 'renameWorkspace', name: 'Reading' });

    expect(snapshot().workspaces?.registry.find('default')?.name).toBe('Reading');
    expect(snapshot().openDialog).toBeUndefined();
  });

  it('refuses to delete the only Markdown viewer workspace and says why', async () => {
    const { controller, snapshot } = await startViewer();

    await controller.execute({ kind: 'confirmDeleteWorkspace' });

    expect(snapshot().openDialog).toBeUndefined();
    expect(snapshot().notice).toBe("Default is the only Markdown viewer workspace, so it can't be deleted.");
  });

  it('deletes a workspace after asking and returns to the one used before', async () => {
    const { controller, snapshot, tabNames } = await startViewer();
    await controller.execute({ kind: 'createWorkspace', name: 'Handbook', kindId: 'markdownViewer' });

    await controller.execute({ kind: 'confirmDeleteWorkspace' });
    expect(snapshot().openDialog).toBe('deleteWorkspace');
    await controller.execute({ kind: 'deleteWorkspace' });

    expect(snapshot().workspaces?.shownWorkspaceId).toBe('default');
    expect(tabNames()).toEqual(['Guide.md']);
    expect(snapshot().notice).toBe('Handbook was deleted. Its files and folders are unchanged.');
  });

  it('choosing a kind opens its last workspace', async () => {
    const { controller, session, snapshot } = await startViewer();
    session.updateWorkspaceKinds(() =>
      WorkspaceKindsState.fromSaved(
        { enabledKindIds: ['markdownViewer', 'notes'], activeKindId: 'markdownViewer' },
        ALL_KINDS_BUILT,
      ),
    );
    await controller.execute({
      kind: 'createWorkspace',
      name: 'Journal',
      kindId: 'notes',
      notesLocationPath: 'C:\\Users\\Ana\\Documents\\MDX Notes',
    });
    await controller.execute({ kind: 'switchWorkspaceKind', kindId: 'markdownViewer' });

    expect(snapshot().workspaces?.shownWorkspaceId).toBe('default');
    await controller.execute({ kind: 'switchWorkspaceKind', kindId: 'notes' });

    expect(snapshot().workspaces?.shownWorkspaceId).toBe('workspace-1');
    expect(snapshot().viewer.workspaceKinds.activeKindId()).toBe('notes');
  });

  it('choosing a kind that opens its last workspace announces the kind', async () => {
    const { controller, snapshot } = await startViewerWithJournal();

    await controller.execute({ kind: 'switchWorkspaceKind', kindId: 'notes' });

    expect(snapshot().workspaces?.shownWorkspaceId).toBe('workspace-1');
    expect(snapshot().notice).toBe('Showing Notes.');
  });

  it('choosing a kind and cancelling at the unsaved edits announces nothing', async () => {
    const { controller, snapshot } = await startViewerWithJournal();
    await controller.execute({ kind: 'toggleEditing' });
    controller.updateEditedText(snapshot().activeDocument?.canonicalKey ?? '', '# Changed');

    const switching = controller.execute({ kind: 'switchWorkspaceKind', kindId: 'notes' });
    await controller.answerUnsavedChanges('cancel');
    await switching;

    expect(snapshot().workspaces?.shownWorkspaceId).toBe('default');
    expect(snapshot().notice).not.toBe('Showing Notes.');
  });

  it('lists New, Rename, Delete and the other workspaces in the palette', async () => {
    const { controller, snapshot } = await startViewer();
    await controller.execute({ kind: 'createWorkspace', name: 'Handbook', kindId: 'markdownViewer' });

    const labels = paletteCommands(createTranslator(), {
      shortcuts: COMMAND_SHORTCUTS,
      workspaceKinds: snapshot().viewer.workspaceKinds,
      ...(snapshot().workspaces ? { workspaces: snapshot().workspaces } : {}),
    }).map((command) => command.label);

    expect(labels).toEqual(
      expect.arrayContaining([
        'New Workspace…',
        'Rename Workspace…',
        'Delete Workspace…',
        'Workspace: Default',
      ]),
    );
    expect(labels).not.toContain('Workspace: Handbook');
  });
});
