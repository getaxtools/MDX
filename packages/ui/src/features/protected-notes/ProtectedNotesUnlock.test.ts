import { ViewerSession, WorkspaceKindsState, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryNoteFiles,
  InMemoryNotesLocations,
  InMemoryProtectedNotes,
  InMemoryWorkspaceStore,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });
const JOURNAL = 'E:\\Journal';
const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'a brand new password';

async function startWithLockedSection() {
  const protectedNotes = new InMemoryProtectedNotes();
  const { recoveryKey } = await protectedNotes.setUp(JOURNAL, PASSWORD);
  const noteId = await protectedNotes.create(JOURNAL, { title: 'Bank details', folder: '' });
  await protectedNotes.save(JOURNAL, {
    noteId,
    text: 'PIN 4821',
    encoding: 'utf-8',
    hasByteOrderMark: false,
  });
  await protectedNotes.lock(JOURNAL);
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
    notesLocations: new InMemoryNotesLocations(),
    noteFiles: new InMemoryNoteFiles(),
    protectedNotes,
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
    notesLocationPath: JOURNAL,
  });
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  await vi.waitFor(() => expect(snapshot().protectedNotes?.state).toBe('locked'));
  const unlock = (password: string, shouldRemember = false) =>
    controller.execute({ kind: 'unlockProtectedSection', password, shouldRemember });
  return { controller, session, protectedNotes, snapshot, recoveryKey, noteId, unlock };
}

const tabKeysOf = (snapshot: ViewerSnapshot) =>
  snapshot.viewer.tabStrip.tabs().map((tab) => tab.location.canonicalKey);

afterEach(() => {
  vi.useRealTimers();
});

describe('unlocking a protected section', () => {
  it('unlocks with the password and lists its notes', async () => {
    const { snapshot, noteId, unlock } = await startWithLockedSection();

    await unlock(PASSWORD);

    expect(snapshot().protectedNotes?.state).toBe('unlocked');
    expect(snapshot().protectedNotes?.notes).toEqual([
      { noteId, title: 'Bank details', canonicalKey: `protected:e:\\journal|${noteId}` },
    ]);
  });

  it('stays locked after a wrong password and says only that it did not open the notes', async () => {
    const { snapshot, unlock } = await startWithLockedSection();

    await unlock('not the password');

    expect(snapshot().protectedNotes).toMatchObject({
      state: 'locked',
      notes: [],
      unlockProblem: 'protectedNotes.unlock.wrongPassword',
    });
  });

  it('waits a second before each try after the third wrong password', async () => {
    const { protectedNotes, snapshot, unlock } = await startWithLockedSection();
    const tries = vi.spyOn(protectedNotes, 'unlock');
    await unlock('wrong one');
    await unlock('wrong two');
    await unlock('wrong three');
    vi.useFakeTimers();

    const fourthTry = unlock(PASSWORD);
    await vi.advanceTimersByTimeAsync(999);
    expect(tries).toHaveBeenCalledTimes(3);
    expect(snapshot().protectedNotes?.isBusy).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await fourthTry;

    expect(tries).toHaveBeenCalledTimes(4);
    expect(snapshot().protectedNotes?.state).toBe('unlocked');
  });

  it('unlocks with the recovery key, after which only the new password opens the section', async () => {
    const { controller, protectedNotes, snapshot, recoveryKey } = await startWithLockedSection();

    await controller.execute({
      kind: 'unlockProtectedWithRecoveryKey',
      recoveryKey,
      newPassword: NEW_PASSWORD,
    });
    expect(snapshot().protectedNotes?.state).toBe('unlocked');
    await protectedNotes.lock(JOURNAL);

    await expect(protectedNotes.unlock(JOURNAL, PASSWORD, false)).rejects.toThrow();
    await expect(protectedNotes.unlock(JOURNAL, NEW_PASSWORD, false)).resolves.toEqual({});
  });

  it('says when the recovery key did not open the section', async () => {
    const { controller, snapshot } = await startWithLockedSection();

    await controller.execute({
      kind: 'unlockProtectedWithRecoveryKey',
      recoveryKey: 'NOT-THE-KEY',
      newPassword: NEW_PASSWORD,
    });

    expect(snapshot().protectedNotes?.unlockProblem).toBe('protectedNotes.unlock.wrongRecoveryKey');
  });
});

describe('a folder warning on unlock', () => {
  it('hides the notes, and keeps the folder only when the user chooses to', async () => {
    const { controller, protectedNotes, snapshot, noteId, unlock } = await startWithLockedSection();
    const realUnlock = protectedNotes.unlock.bind(protectedNotes);
    vi.spyOn(protectedNotes, 'unlock').mockImplementation(async (...attempt) => ({
      ...(await realUnlock(...attempt)),
      folderWarning: 'olderNotes',
    }));
    const acceptFolder = vi.spyOn(protectedNotes, 'acceptFolder');
    await unlock(PASSWORD);

    expect(snapshot().protectedNotes).toMatchObject({
      state: 'unlocked',
      folderWarning: 'olderNotes',
      notes: [],
    });
    await controller.execute({ kind: 'openProtectedNote', noteId });
    expect(tabKeysOf(snapshot())).toEqual([]);
    expect(acceptFolder).not.toHaveBeenCalled();
    await controller.execute({ kind: 'acceptProtectedFolder' });

    expect(acceptFolder).toHaveBeenCalledWith(JOURNAL);
    expect(snapshot().protectedNotes?.folderWarning).toBeUndefined();
    expect(snapshot().protectedNotes?.notes).toHaveLength(1);
  });
});

describe('protected notes in tabs', () => {
  it('opens a note as a protected tab from its decrypted text, outside recent files', async () => {
    const { controller, snapshot, noteId, unlock } = await startWithLockedSection();
    await unlock(PASSWORD);

    await controller.execute({ kind: 'openProtectedNote', noteId });

    await vi.waitFor(() => expect(snapshot().activeDocument?.source).toBe('PIN 4821'));
    expect(tabKeysOf(snapshot())).toEqual([`protected:e:\\journal|${noteId}`]);
    expect(snapshot().viewer.recentFiles.entries()).toEqual([]);
    expect(snapshot().viewer.tabStrip.activeTab()?.location.fileName).toBe('Bank details');
  });

  it('saves an edited note back into the section only', async () => {
    const { controller, session, protectedNotes, noteId, unlock } = await startWithLockedSection();
    await unlock(PASSWORD);
    await controller.execute({ kind: 'openProtectedNote', noteId });

    await session.saveEditedDocument(`protected:e:\\journal|${noteId}`, 'PIN 4822');

    expect((await protectedNotes.open(JOURNAL, noteId)).text).toBe('PIN 4822');
  });

  it('creates a protected note and opens it for typing', async () => {
    const { controller, snapshot, unlock } = await startWithLockedSection();
    await unlock(PASSWORD);

    await controller.execute({ kind: 'createProtectedNote', title: '  Passport  ' });

    expect(snapshot().protectedNotes?.notes.map((note) => note.title)).toEqual(['Bank details', 'Passport']);
    expect(snapshot().viewer.tabStrip.activeTab()?.location.fileName).toBe('Passport');
    expect(snapshot().isActiveDocumentEditing).toBe(true);
  });

  it('opens no note while the section is locked', async () => {
    const { controller, snapshot, noteId } = await startWithLockedSection();

    await controller.execute({ kind: 'openProtectedNote', noteId });

    expect(tabKeysOf(snapshot())).toEqual([]);
  });
});
