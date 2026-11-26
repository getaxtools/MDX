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
import { describe, expect, it, vi } from 'vitest';
import { ViewerController, type ViewerSnapshot } from './ViewerController';

const GUIDE = 'C:\\Docs\\Guide.md';
const NOTES = 'C:\\Docs\\Notes.md';
const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });

async function startViewer() {
  const requests = new InMemoryDocumentRequests([GUIDE]);
  let nextId = 0;
  const session = new ViewerSession({
    documentFiles: new InMemoryDocumentFiles({ [GUIDE]: '# Guide', [NOTES]: '# Notes' }),
    appState: new InMemoryAppState(),
    workspaceStore: new InMemoryWorkspaceStore(),
    kindRegistry: ALL_KINDS_BUILT,
    now: () => Date.now(),
    createId: () => `workspace-${String((nextId += 1))}`,
  });
  const controller = new ViewerController({
    session,
    requests,
    renderer: createMarkdownRenderer({ window }),
    translator: createTranslator(),
    notesLocations: new InMemoryNotesLocations(),
  });
  let latest: ViewerSnapshot | undefined;
  controller.subscribe((snapshot) => (latest = snapshot));
  await controller.start();
  session.updateWorkspaceKinds(() =>
    WorkspaceKindsState.fromSaved(
      { enabledKindIds: ['markdownViewer', 'notes'], activeKindId: 'markdownViewer' },
      ALL_KINDS_BUILT,
    ),
  );
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  return { controller, requests, snapshot };
}

/** Shows Default, with a notes workspace Journal shown last of its kind. */
async function startViewerWithJournal() {
  const viewer = await startViewer();
  await viewer.controller.execute({
    kind: 'createWorkspace',
    name: 'Journal',
    kindId: 'notes',
    notesLocationPath: 'C:\\Users\\Ana\\Documents\\MDX Notes',
  });
  await viewer.controller.execute({ kind: 'switchWorkspaceKind', kindId: 'markdownViewer' });
  viewer.controller.dismissNotice();
  return viewer;
}

describe('ViewerController workspace kinds page', () => {
  it('shows the kinds page and closes it again', async () => {
    const { controller, snapshot } = await startViewer();

    await controller.execute({ kind: 'showWorkspaceKindsPage' });
    const isShownAfterOpening = snapshot().isWorkspaceKindsPageShown;
    await controller.execute({ kind: 'closeWorkspaceKindsPage' });

    expect(isShownAfterOpening).toBe(true);
    expect(snapshot().isWorkspaceKindsPageShown).toBeUndefined();
  });

  it('a kind chosen on the page shows no app notice, since the page announces it', async () => {
    const { controller, snapshot } = await startViewer();
    await controller.execute({ kind: 'showWorkspaceKindsPage' });

    await controller.runWorkspaceKindsPageCommand({ kind: 'switchWorkspaceKind', kindId: 'notes' });

    expect(snapshot().viewer.workspaceKinds.activeKindId()).toBe('notes');
    expect(snapshot().notice).toBeUndefined();
  });

  it('a kind turned off on the page shows no app notice', async () => {
    const { controller, snapshot } = await startViewer();
    await controller.execute({ kind: 'showWorkspaceKindsPage' });

    await controller.runWorkspaceKindsPageCommand({
      kind: 'setWorkspaceKindEnabled',
      kindId: 'markdownViewer',
      isEnabled: false,
    });

    expect(snapshot().viewer.workspaceKinds.activeKindId()).toBe('notes');
    expect(snapshot().notice).toBeUndefined();
  });

  it('the control wheel still announces a kind chosen while the page is shown', async () => {
    const { controller, snapshot } = await startViewer();
    await controller.execute({ kind: 'showWorkspaceKindsPage' });

    await controller.execute({ kind: 'switchWorkspaceKind', kindId: 'notes' });

    expect(snapshot().notice).toBe('Showing Notes.');
  });

  it('a page command after the page closed shows the switch notice', async () => {
    const { controller, snapshot } = await startViewer();
    await controller.execute({ kind: 'showWorkspaceKindsPage' });

    await controller.execute({ kind: 'closeWorkspaceKindsPage' });
    await controller.runWorkspaceKindsPageCommand({ kind: 'switchWorkspaceKind', kindId: 'notes' });

    expect(snapshot().isWorkspaceKindsPageShown).toBeUndefined();
    expect(snapshot().notice).toBe('Showing Notes.');
  });

  it('opening a document closes the page', async () => {
    const { controller, requests, snapshot } = await startViewer();
    await controller.execute({ kind: 'showWorkspaceKindsPage' });

    requests.requestDocuments([NOTES]);

    await vi.waitFor(() => expect(snapshot().activeDocument?.fileName).toBe('Notes.md'));
    expect(snapshot().isWorkspaceKindsPageShown).toBeUndefined();
  });

  it('a kind that shows another workspace keeps the page open', async () => {
    const { controller, snapshot } = await startViewerWithJournal();
    await controller.execute({ kind: 'showWorkspaceKindsPage' });

    await controller.runWorkspaceKindsPageCommand({ kind: 'switchWorkspaceKind', kindId: 'notes' });

    expect(snapshot().workspaces?.shownWorkspaceId).toBe('workspace-1');
    expect(snapshot().isWorkspaceKindsPageShown).toBe(true);
    expect(snapshot().notice).toBeUndefined();
  });

  it('settings and the control wheel open over the page', async () => {
    const { controller, snapshot } = await startViewer();
    await controller.execute({ kind: 'showWorkspaceKindsPage' });

    await controller.execute({ kind: 'showSettings' });
    const dialogOverPage = snapshot().openDialog;
    controller.closeDialog();
    await controller.execute({ kind: 'toggleControlWheel' });

    expect(dialogOverPage).toBe('settings');
    expect(snapshot().openDialog).toBe('controlWheel');
    expect(snapshot().isWorkspaceKindsPageShown).toBe(true);
  });
});
