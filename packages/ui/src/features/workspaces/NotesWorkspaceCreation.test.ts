import { ViewerSession, WorkspaceKindsState, notesLocationOf, workspaceKindsFor } from '@mdx/core';
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
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });
const DEFAULT_NOTES_FOLDER = 'C:\\Users\\Ana\\Documents\\MDX Notes';

async function startViewer(notesLocations = new InMemoryNotesLocations()) {
  let nextId = 0;
  const session = new ViewerSession({
    documentFiles: new InMemoryDocumentFiles(),
    appState: new InMemoryAppState(),
    workspaceStore: new InMemoryWorkspaceStore(),
    kindRegistry: ALL_KINDS_BUILT,
    now: () => 1_000,
    createId: () => `workspace-${String((nextId += 1))}`,
  });
  const controller = new ViewerController({
    session,
    requests: new InMemoryDocumentRequests(),
    renderer: createMarkdownRenderer({ window }),
    translator: createTranslator(),
    notesLocations,
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
  const createNotesWorkspace = (name: string, notesLocationPath: string) =>
    controller.execute({ kind: 'createWorkspace', name, kindId: 'notes', notesLocationPath });
  return { controller, session, notesLocations, snapshot, createNotesWorkspace };
}

describe('creating a Notes workspace', () => {
  it('marks the folder as its location, keeps the location and shows the folder', async () => {
    const { session, notesLocations, snapshot, createNotesWorkspace } = await startViewer();

    await createNotesWorkspace('Journal', DEFAULT_NOTES_FOLDER);

    const shown = session.shownWorkspace();
    expect(notesLocations.preparedPaths).toEqual([DEFAULT_NOTES_FOLDER]);
    expect(shown?.kindId).toBe('notes');
    expect(shown && notesLocationOf(shown)?.path).toBe(DEFAULT_NOTES_FOLDER);
    expect(
      snapshot()
        .viewer.explorerFolders.folders()
        .map((folder) => folder.displayPath),
    ).toEqual([DEFAULT_NOTES_FOLDER]);
  });

  it('keeps the id of a folder that already was a Notes location', async () => {
    const notesLocations = new InMemoryNotesLocations();
    notesLocations.existingLocationIds.set(DEFAULT_NOTES_FOLDER.toLowerCase(), 'location-from-before');
    const { session, createNotesWorkspace } = await startViewer(notesLocations);

    await createNotesWorkspace('Journal', DEFAULT_NOTES_FOLDER);

    const shown = session.shownWorkspace();
    expect(shown && notesLocationOf(shown)?.locationId).toBe('location-from-before');
  });

  it('creates nothing and says so when the folder cannot be used', async () => {
    const notesLocations = new InMemoryNotesLocations();
    notesLocations.isRefusing = true;
    const { session, snapshot, createNotesWorkspace } = await startViewer(notesLocations);

    await createNotesWorkspace('Journal', 'C:\\Windows\\Notes');

    expect(session.workspaces()?.workspaces()).toHaveLength(1);
    expect(snapshot().notice).toBe('MDX could not use C:\\Windows\\Notes for notes.');
  });

  it('New Workspace knows the folders other Notes workspaces use', async () => {
    const { controller, snapshot, createNotesWorkspace } = await startViewer();
    await createNotesWorkspace('Journal', DEFAULT_NOTES_FOLDER);

    await controller.execute({ kind: 'showNewWorkspace', kindId: 'notes' });

    expect(snapshot().workspaces?.notesSetup).toEqual({
      documents: 'C:\\Users\\Ana\\Documents',
      syncedFolders: [],
      claimedPaths: [DEFAULT_NOTES_FOLDER],
    });
  });
});
