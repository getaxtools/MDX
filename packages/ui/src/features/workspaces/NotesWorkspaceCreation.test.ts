import { ViewerSession, WorkspaceKindsState, notesLocationOf, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryNotesLocations,
  InMemoryWorkspaceFiles,
  InMemoryWorkspaceStore,
  type WorkspaceFileContents,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });
const DEFAULT_NOTES_FOLDER = 'C:\\Users\\Ana\\Documents\\MDX Notes';

const JOURNAL_FILE: WorkspaceFileContents = {
  path: 'D:\\team\\journal.mdxworkspace',
  folder: 'D:\\team',
  text: JSON.stringify({
    format: 'mdx-workspace',
    formatVersion: 1,
    name: 'Journal',
    kind: 'notes',
    icon: 'book',
    colour: 'teal',
    roots: ['old-notes'],
    favourites: [{ path: 'old-notes/plan.md', kind: 'file' }],
    favouriteGroups: [],
    settingsOverrides: { theme: 'dark' },
  }),
};

async function startViewer(
  notesLocations = new InMemoryNotesLocations(),
  workspaceFiles = new InMemoryWorkspaceFiles(),
) {
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
    workspaceFiles,
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

  it('a Notes workspace file is created only with a prepared location', async () => {
    const workspaceFiles = new InMemoryWorkspaceFiles();
    workspaceFiles.pickedFile = JOURNAL_FILE;
    const { controller, session, notesLocations, snapshot } = await startViewer(
      new InMemoryNotesLocations(),
      workspaceFiles,
    );

    await controller.execute({ kind: 'openWorkspaceFile' });
    await controller.execute({ kind: 'confirmOpenWorkspaceFile' });
    const workspaceCountBeforeFolder = session.workspaces()?.workspaces().length;
    const dialogBeforeFolder = snapshot().openDialog;
    const fromFile = snapshot().workspaces?.newWorkspaceFromFile;
    await controller.execute({
      kind: 'createWorkspace',
      name: 'Journal',
      kindId: 'notes',
      icon: 'book',
      colour: 'teal',
      notesLocationPath: DEFAULT_NOTES_FOLDER,
    });

    expect(workspaceCountBeforeFolder).toBe(1);
    expect(dialogBeforeFolder).toBe('newWorkspace');
    expect(fromFile).toEqual({ name: 'Journal', icon: 'book', colour: 'teal' });
    const shown = session.shownWorkspace();
    expect(notesLocations.preparedPaths).toEqual([DEFAULT_NOTES_FOLDER]);
    expect(shown && notesLocationOf(shown)?.path).toBe(DEFAULT_NOTES_FOLDER);
    expect(shown?.sourceFile).toBe(JOURNAL_FILE.path);
    expect(shown?.icon).toBe('book');
    expect(shown?.colour).toBe('teal');
    expect(
      snapshot()
        .viewer.explorerFolders.folders()
        .map((folder) => folder.displayPath),
    ).toEqual([DEFAULT_NOTES_FOLDER]);
    expect(
      snapshot()
        .viewer.favourites.favourites()
        .map((favourite) => favourite.location.displayPath),
    ).toEqual([`${DEFAULT_NOTES_FOLDER}\\plan.md`]);
    expect(snapshot().viewer.viewSettings.theme).toBe('dark');
  });

  it('choosing None in the folder step leaves out the icon and colour of the file', async () => {
    const workspaceFiles = new InMemoryWorkspaceFiles();
    workspaceFiles.pickedFile = JOURNAL_FILE;
    const { controller, session } = await startViewer(new InMemoryNotesLocations(), workspaceFiles);
    await controller.execute({ kind: 'openWorkspaceFile' });
    await controller.execute({ kind: 'confirmOpenWorkspaceFile' });

    await controller.execute({
      kind: 'createWorkspace',
      name: 'Journal',
      kindId: 'notes',
      icon: undefined,
      colour: undefined,
      notesLocationPath: DEFAULT_NOTES_FOLDER,
    });

    expect(session.shownWorkspace()?.icon).toBeNull();
    expect(session.shownWorkspace()?.colour).toBeNull();
  });

  it('a folder that cannot be used keeps the workspace file for another try', async () => {
    const workspaceFiles = new InMemoryWorkspaceFiles();
    workspaceFiles.pickedFile = JOURNAL_FILE;
    const notesLocations = new InMemoryNotesLocations();
    const { controller, session, createNotesWorkspace } = await startViewer(notesLocations, workspaceFiles);
    await controller.execute({ kind: 'openWorkspaceFile' });
    await controller.execute({ kind: 'confirmOpenWorkspaceFile' });
    notesLocations.isRefusing = true;
    await createNotesWorkspace('Journal', 'C:\\Windows\\Notes');
    notesLocations.isRefusing = false;

    await createNotesWorkspace('Journal', DEFAULT_NOTES_FOLDER);

    expect(session.workspaces()?.workspaces()).toHaveLength(2);
    expect(session.shownWorkspace()?.sourceFile).toBe(JOURNAL_FILE.path);
  });

  it('New Workspace from the menu forgets a workspace file whose folder step was closed', async () => {
    const workspaceFiles = new InMemoryWorkspaceFiles();
    workspaceFiles.pickedFile = JOURNAL_FILE;
    const { controller, session, snapshot, createNotesWorkspace } = await startViewer(
      new InMemoryNotesLocations(),
      workspaceFiles,
    );
    await controller.execute({ kind: 'openWorkspaceFile' });
    await controller.execute({ kind: 'confirmOpenWorkspaceFile' });
    controller.closeDialog();

    await controller.execute({ kind: 'showNewWorkspace', kindId: 'notes' });
    const fromFile = snapshot().workspaces?.newWorkspaceFromFile;
    await createNotesWorkspace('Ideas', DEFAULT_NOTES_FOLDER);

    expect(fromFile).toBeUndefined();
    expect(session.shownWorkspace()?.sourceFile).toBeUndefined();
    expect(snapshot().viewer.favourites.favourites()).toHaveLength(0);
  });

  it('asks the Notes port what a folder holds, and finds an unknown folder empty', async () => {
    const notesLocations = new InMemoryNotesLocations();
    notesLocations.inspections.set('e:\\vault', 'existingFiles');
    const { controller } = await startViewer(notesLocations);

    expect(await controller.inspectNotesFolder('E:\\Vault')).toBe('existingFiles');
    expect(await controller.inspectNotesFolder('E:\\Elsewhere')).toBe('empty');
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
