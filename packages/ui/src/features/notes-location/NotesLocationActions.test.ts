import { ViewerSession, WorkspaceKindsState, notesLocationOf, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryFolders,
  InMemoryNotesLocations,
  InMemoryWorkspaceStore,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });
const JOURNAL_FOLDER = 'E:\\Notes\\Journal';
const MOVED_FOLDER = 'D:\\Archive\\Journal';

async function startWithMissingJournal() {
  let nextId = 0;
  const notesLocations = new InMemoryNotesLocations();
  const folders = new InMemoryFolders();
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
    folders,
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
  const defaultWorkspaceId = session.shownWorkspace()?.id ?? '';
  await controller.execute({
    kind: 'createWorkspace',
    name: 'Journal',
    kindId: 'notes',
    notesLocationPath: JOURNAL_FOLDER,
  });
  const journalId = session.shownWorkspace()?.id ?? '';
  const journalLocationId = journalLocation()?.locationId ?? '';
  await controller.execute({ kind: 'switchWorkspace', workspaceId: defaultWorkspaceId });
  notesLocations.missingPaths.add(JOURNAL_FOLDER.toLowerCase());
  await controller.execute({ kind: 'switchWorkspace', workspaceId: journalId });

  function journalLocation() {
    const shown = session.shownWorkspace();
    return shown ? notesLocationOf(shown) : undefined;
  }
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  const explorerPaths = () =>
    snapshot()
      .viewer.explorerFolders.folders()
      .map((folder) => folder.displayPath);
  return { controller, notesLocations, folders, snapshot, journalLocation, journalLocationId, explorerPaths };
}

describe('a Notes workspace whose folder is missing', () => {
  it('a missing path reports not available without creating it', async () => {
    const { notesLocations, snapshot } = await startWithMissingJournal();

    expect(snapshot().missingNotesLocation).toBe(JOURNAL_FOLDER);
    expect(notesLocations.preparedPaths).toEqual([JOURNAL_FOLDER]);
  });

  it('Try Again shows the workspace once the folder is back', async () => {
    const { controller, notesLocations, snapshot } = await startWithMissingJournal();
    notesLocations.missingPaths.delete(JOURNAL_FOLDER.toLowerCase());

    await controller.execute({ kind: 'retryNotesLocation' });

    expect(snapshot().missingNotesLocation).toBeUndefined();
    expect(snapshot().notice).toBeUndefined();
  });

  it('Try Again says so while the folder is still missing', async () => {
    const { controller, snapshot } = await startWithMissingJournal();

    await controller.execute({ kind: 'retryNotesLocation' });

    expect(snapshot().missingNotesLocation).toBe(JOURNAL_FOLDER);
    expect(snapshot().notice).toBe('The notes folder is still not available.');
  });

  it('Locate accepts a folder with the same id and refuses another id', async () => {
    const {
      controller,
      notesLocations,
      folders,
      snapshot,
      journalLocation,
      journalLocationId,
      explorerPaths,
    } = await startWithMissingJournal();
    notesLocations.existingLocationIds.set('d:\\archive\\other', 'another-location');
    folders.pickedFolder = 'D:\\Archive\\Other';

    await controller.execute({ kind: 'locateNotesLocation' });

    expect(snapshot().missingNotesLocation).toBe(JOURNAL_FOLDER);
    expect(snapshot().notice).toBe(
      "That folder is not this workspace's notes folder. Choose the folder it was moved to.",
    );

    notesLocations.existingLocationIds.set(MOVED_FOLDER.toLowerCase(), journalLocationId);
    folders.pickedFolder = MOVED_FOLDER;

    await controller.execute({ kind: 'locateNotesLocation' });

    expect(snapshot().missingNotesLocation).toBeUndefined();
    expect(journalLocation()).toMatchObject({ path: MOVED_FOLDER, locationId: journalLocationId });
    expect(explorerPaths()).toEqual([MOVED_FOLDER]);
  });

  it('Choose Another starts a new location and leaves the missing folder alone', async () => {
    const {
      controller,
      notesLocations,
      folders,
      snapshot,
      journalLocation,
      journalLocationId,
      explorerPaths,
    } = await startWithMissingJournal();
    folders.pickedFolder = 'D:\\Fresh Notes';

    await controller.execute({ kind: 'chooseNotesLocation' });

    expect(snapshot().missingNotesLocation).toBeUndefined();
    expect(notesLocations.preparedPaths).toEqual([JOURNAL_FOLDER, 'D:\\Fresh Notes']);
    expect(journalLocation()?.path).toBe('D:\\Fresh Notes');
    expect(journalLocation()?.locationId).not.toBe(journalLocationId);
    expect(explorerPaths()).toEqual(['D:\\Fresh Notes']);
  });

  it('Choose Another refuses a folder another Notes workspace uses', async () => {
    const { controller, notesLocations, folders, snapshot } = await startWithMissingJournal();
    await controller.execute({
      kind: 'createWorkspace',
      name: 'Work',
      kindId: 'notes',
      notesLocationPath: 'D:\\Work',
    });
    notesLocations.missingPaths.add(JOURNAL_FOLDER.toLowerCase());
    const journalId = snapshot()
      .workspaces?.registry.workspaces()
      .find((workspace) => workspace.name === 'Journal')?.id;
    await controller.execute({ kind: 'switchWorkspace', workspaceId: journalId ?? '' });
    folders.pickedFolder = 'D:\\Work';

    await controller.execute({ kind: 'chooseNotesLocation' });

    expect(snapshot().missingNotesLocation).toBe(JOURNAL_FOLDER);
    expect(snapshot().notice).toBe('Another Notes workspace already uses this folder.');
  });

  it("Choose Another refuses a copy of another workspace's notes folder", async () => {
    const { controller, notesLocations, folders, snapshot } = await startWithMissingJournal();
    await controller.execute({
      kind: 'createWorkspace',
      name: 'Work',
      kindId: 'notes',
      notesLocationPath: 'D:\\Work',
    });
    const workId = notesLocations.existingLocationIds.get('d:\\work') ?? '';
    notesLocations.existingLocationIds.set('d:\\work copy', workId);
    notesLocations.missingPaths.add(JOURNAL_FOLDER.toLowerCase());
    const journalId = snapshot()
      .workspaces?.registry.workspaces()
      .find((workspace) => workspace.name === 'Journal')?.id;
    await controller.execute({ kind: 'switchWorkspace', workspaceId: journalId ?? '' });
    folders.pickedFolder = 'D:\\Work Copy';

    await controller.execute({ kind: 'chooseNotesLocation' });

    expect(snapshot().missingNotesLocation).toBe(JOURNAL_FOLDER);
    expect(snapshot().notice).toBe(
      "This notes folder is a copy of another Notes workspace's folder. Choose another folder, or remove the copy first.",
    );
  });

  it('cancelling the folder picker changes nothing', async () => {
    const { controller, snapshot, journalLocation } = await startWithMissingJournal();

    await controller.execute({ kind: 'chooseNotesLocation' });
    await controller.execute({ kind: 'locateNotesLocation' });

    expect(snapshot().missingNotesLocation).toBe(JOURNAL_FOLDER);
    expect(journalLocation()?.path).toBe(JOURNAL_FOLDER);
  });
});
