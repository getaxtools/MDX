import { ViewerSession, WorkspaceKindsState, notesLocationOf, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryFolders,
  InMemoryNotesLocations,
  InMemoryNotesMoves,
  InMemoryWorkspaceStore,
  type UnfinishedNotesMove,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });
const NOTES_FOLDER = 'C:\\Users\\Ana\\Documents\\MDX Notes';
const NEW_FOLDER = 'E:\\Notes';
const PLAN_NOTE = `${NOTES_FOLDER}\\Plan.md`;

interface StartOptions {
  readonly unfinished?: (workspaceId: string, locationId: string) => UnfinishedNotesMove;
}

async function startNotesWorkspace({ unfinished }: StartOptions = {}) {
  const notesLocations = new InMemoryNotesLocations();
  const notesMoves = new InMemoryNotesMoves();
  const folders = new InMemoryFolders();
  const documentFiles = new InMemoryDocumentFiles({ [PLAN_NOTE]: '# Plan' });
  const workspaceStore = new InMemoryWorkspaceStore();
  const sessionOptions = {
    documentFiles,
    appState: new InMemoryAppState(),
    workspaceStore,
    kindRegistry: ALL_KINDS_BUILT,
    now: () => 1_000,
    createId: () => 'workspace-notes',
  };
  const session = new ViewerSession(sessionOptions);
  const controller = new ViewerController({
    session,
    requests: new InMemoryDocumentRequests(),
    renderer: createMarkdownRenderer({ window }),
    translator: createTranslator(),
    notesLocations,
    notesMoves,
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
  await controller.execute({
    kind: 'createWorkspace',
    name: 'Journal',
    kindId: 'notes',
    notesLocationPath: NOTES_FOLDER,
  });
  const notesLocation = () => {
    const shown = session.shownWorkspace();
    return shown ? notesLocationOf(shown) : undefined;
  };
  const locationId = notesLocation()?.locationId ?? '';
  notesLocations.existingLocationIds.set(NEW_FOLDER.toLowerCase(), locationId);
  if (unfinished) {
    notesMoves.unfinished.push(unfinished(session.shownWorkspace()?.id ?? '', locationId));
    await notesMoves.unfinishedMoves();
  }
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  return { controller, session, notesMoves, folders, snapshot, notesLocation, locationId };
}

describe('Change location', () => {
  it('plans the move to a picked folder, shows the plan and makes the notes read-only', async () => {
    const { controller, notesMoves, folders, snapshot } = await startNotesWorkspace();
    folders.pickedFolder = NEW_FOLDER;

    await controller.execute({ kind: 'changeNotesLocation' });

    expect(notesMoves.calls).toEqual([`plan ${NEW_FOLDER}`]);
    expect(snapshot().notesMoveDialog).toMatchObject({ kind: 'plan', target: NEW_FOLDER });
    expect(snapshot().notesMoveStatus).toBe('Notes are being moved and are read-only');
  });

  it('refuses a folder inside the notes folder before planning', async () => {
    const { controller, notesMoves, folders, snapshot } = await startNotesWorkspace();
    folders.pickedFolder = `${NOTES_FOLDER}\\Copy`;

    await controller.execute({ kind: 'changeNotesLocation' });

    expect(notesMoves.calls).toEqual([]);
    expect(snapshot().notice).toBe('That folder is inside your notes folder. Choose a folder outside it.');
  });

  it('too little free space is refused with both sizes, and the notes stay writable', async () => {
    const { controller, notesMoves, folders, snapshot } = await startNotesWorkspace();
    folders.pickedFolder = NEW_FOLDER;
    notesMoves.planProblem = {
      code: 'notEnoughSpace',
      requiredBytes: 2.2 * 1024 ** 3,
      availableBytes: 1024 ** 3,
    };

    await controller.execute({ kind: 'changeNotesLocation' });

    expect(snapshot().notice).toBe(
      'The drive of that folder has 1 GB free, and the move needs 2.2 GB. Free some space or choose another drive.',
    );
    expect(snapshot().notesMoveStatus).toBeUndefined();
  });

  it('switches the workspace only after the move is verified, then offers the old copy', async () => {
    const { controller, notesMoves, folders, snapshot, notesLocation, locationId } =
      await startNotesWorkspace();
    folders.pickedFolder = NEW_FOLDER;
    await controller.execute({ kind: 'changeNotesLocation' });

    await controller.execute({ kind: 'startNotesMove' });

    expect(notesMoves.calls).toEqual([
      `plan ${NEW_FOLDER}`,
      `run ${locationId}`,
      `switch ${locationId}`,
      `finish ${locationId}`,
    ]);
    expect(notesLocation()).toMatchObject({ path: NEW_FOLDER, locationId });
    expect(
      snapshot()
        .viewer.explorerFolders.folders()
        .map((folder) => folder.displayPath),
    ).toEqual([NEW_FOLDER]);
    expect(snapshot().notesMoveDialog).toMatchObject({
      kind: 'removalOffer',
      oldCopy: { path: NOTES_FOLDER },
    });
    expect(snapshot().notesMoveStatus).toBeUndefined();
  });

  it('a full drive keeps the old location and offers Resume, which then finishes the move', async () => {
    const { controller, notesMoves, folders, snapshot, notesLocation } = await startNotesWorkspace();
    folders.pickedFolder = NEW_FOLDER;
    await controller.execute({ kind: 'changeNotesLocation' });
    notesMoves.runProblem = { code: 'diskFull', path: 'Projects/Ideas.md' };

    await controller.execute({ kind: 'startNotesMove' });

    expect(notesLocation()?.path).toBe(NOTES_FOLDER);
    expect(snapshot().notesMoveDialog).toMatchObject({
      kind: 'resume',
      problem: { key: 'notesLocation.move.problem.diskFull', values: { path: 'Projects/Ideas.md' } },
    });
    expect(snapshot().notesMoveStatus).toBe('Notes move paused; notes are read-only');

    await controller.execute({ kind: 'resumeNotesMove' });

    expect(notesLocation()?.path).toBe(NEW_FOLDER);
  });

  it('Later keeps a stopped move paused, and Change Location offers it again', async () => {
    const { controller, notesMoves, folders, snapshot } = await startNotesWorkspace();
    folders.pickedFolder = NEW_FOLDER;
    await controller.execute({ kind: 'changeNotesLocation' });
    notesMoves.runProblem = { code: 'stopped' };
    await controller.execute({ kind: 'startNotesMove' });

    await controller.execute({ kind: 'postponeNotesMove' });
    expect(snapshot().notesMoveDialog).toBeUndefined();
    expect(snapshot().noticeActions?.map((action) => action.label)).toEqual(['Resume', 'Cancel Move']);
    await controller.execute({ kind: 'changeNotesLocation' });

    expect(snapshot().notesMoveDialog).toMatchObject({ kind: 'resume', target: NEW_FOLDER });
    expect(notesMoves.calls.filter((call) => call.startsWith('plan'))).toHaveLength(1);
  });

  it('Cancel on the plan removes the plan and makes the notes writable again', async () => {
    const { controller, notesMoves, folders, snapshot, locationId } = await startNotesWorkspace();
    folders.pickedFolder = NEW_FOLDER;
    await controller.execute({ kind: 'changeNotesLocation' });

    await controller.execute({ kind: 'cancelNotesMove' });

    expect(notesMoves.calls.at(-1)).toBe(`cancel ${locationId}`);
    expect(snapshot().notesMoveDialog).toBeUndefined();
    expect(snapshot().notesMoveStatus).toBeUndefined();
    expect(snapshot().notice).toBe(`The move was cancelled. Your notes stay in ${NOTES_FOLDER}.`);
  });

  it('typing in a note is refused during a move', async () => {
    const { controller, folders, snapshot, session } = await startNotesWorkspace();
    await session.openDocument(PLAN_NOTE);
    folders.pickedFolder = NEW_FOLDER;
    await controller.execute({ kind: 'changeNotesLocation' });
    const noteKey = PLAN_NOTE.toLowerCase();

    controller.updateEditedText(noteKey, '# Plan, changed');

    expect(snapshot().unsavedDocumentKeys.has(noteKey)).toBe(false);
    expect(snapshot().isActiveDocumentReadOnly).toBe(true);
  });

  it('a note with unsaved changes stops the move before it is planned', async () => {
    const { controller, notesMoves, folders, snapshot, session } = await startNotesWorkspace();
    await session.openDocument(PLAN_NOTE);
    await controller.execute({ kind: 'toggleEditing' });
    controller.updateEditedText(PLAN_NOTE.toLowerCase(), '# Plan, changed');
    folders.pickedFolder = NEW_FOLDER;

    await controller.execute({ kind: 'changeNotesLocation' });

    expect(notesMoves.calls).toEqual([]);
    expect(snapshot().notice).toBe('Save your changed notes before you move the notes folder.');
  });
});

describe('the old copy after a move', () => {
  async function switched() {
    const started = await startNotesWorkspace();
    started.folders.pickedFolder = NEW_FOLDER;
    await started.controller.execute({ kind: 'changeNotesLocation' });
    await started.controller.execute({ kind: 'startNotesMove' });
    return started;
  }

  it('Keep the Old Copy, the default choice, keeps it and says where', async () => {
    const { controller, notesMoves, snapshot, locationId } = await switched();

    await controller.execute({ kind: 'keepOldNotesCopy' });

    expect(notesMoves.calls.at(-1)).toBe(`keep ${locationId}`);
    expect(snapshot().notice).toBe(`The old copy of your notes is kept in ${NOTES_FOLDER}.`);
    expect(snapshot().notesMoveDialog).toBeUndefined();
  });

  it('removal needs a second explicit confirmation', async () => {
    const { controller, notesMoves, snapshot, locationId } = await switched();

    await controller.execute({ kind: 'removeOldNotesCopy' });
    expect(notesMoves.calls).not.toContain(`remove ${locationId}`);

    await controller.execute({ kind: 'askToRemoveOldNotesCopy' });
    expect(snapshot().notesMoveDialog?.kind).toBe('removalConfirmation');
    await controller.execute({ kind: 'removeOldNotesCopy' });

    expect(notesMoves.calls.at(-1)).toBe(`remove ${locationId}`);
    expect(snapshot().notice).toBe('The old copy went to the Recycle Bin: 3 files.');
  });

  it('a changed file is kept and listed', async () => {
    const { controller, notesMoves, snapshot } = await switched();
    notesMoves.removal = { recycledCount: 2, kept: { paths: ['Plan.md'], count: 1 }, hasNoRecycleBin: false };
    await controller.execute({ kind: 'askToRemoveOldNotesCopy' });

    await controller.execute({ kind: 'removeOldNotesCopy' });

    expect(snapshot().notice).toBe(
      `2 files went to the Recycle Bin. 1 file was kept in ${NOTES_FOLDER} because they changed after the move: Plan.md`,
    );
  });

  it('a folder without a Recycle Bin keeps everything and says where', async () => {
    const { controller, notesMoves, snapshot } = await switched();
    notesMoves.removal = { recycledCount: 0, kept: { paths: [], count: 0 }, hasNoRecycleBin: true };
    await controller.execute({ kind: 'askToRemoveOldNotesCopy' });

    await controller.execute({ kind: 'removeOldNotesCopy' });

    expect(snapshot().notice).toBe(`${NOTES_FOLDER} has no Recycle Bin, so the old copy is kept there.`);
  });
});

describe('an unfinished move at start', () => {
  const unfinishedMove =
    (state: UnfinishedNotesMove['state']) =>
    (workspaceId: string, locationId: string): UnfinishedNotesMove => ({
      workspaceId,
      locationId,
      path: NOTES_FOLDER,
      target: NEW_FOLDER,
      state,
      fileCount: 3,
      totalBytes: 1_200,
    });

  it('offers Resume or Cancel for a move that did not switch', async () => {
    const { controller, snapshot } = await startNotesWorkspace({ unfinished: unfinishedMove('copying') });

    await controller.start();

    expect(snapshot().notesMoveDialog).toMatchObject({
      kind: 'resume',
      source: NOTES_FOLDER,
      target: NEW_FOLDER,
    });
    expect(snapshot().notesMoveStatus).toBe('Notes move paused; notes are read-only');
  });

  it('Cancel removes only what the move made and makes the notes writable', async () => {
    const { controller, notesMoves, snapshot, locationId } = await startNotesWorkspace({
      unfinished: unfinishedMove('copying'),
    });
    await controller.start();

    await controller.execute({ kind: 'cancelNotesMove' });

    expect(notesMoves.calls.at(-1)).toBe(`cancel ${locationId}`);
    expect(snapshot().notesMoveStatus).toBeUndefined();
  });

  it('offers the old copy again after a switch whose offer was not answered', async () => {
    const { controller, snapshot } = await startNotesWorkspace({ unfinished: unfinishedMove('switched') });

    await controller.start();

    expect(snapshot().notesMoveDialog?.kind).toBe('removalOffer');
  });
});
