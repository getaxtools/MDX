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

async function startUnlocked() {
  const protectedNotes = new InMemoryProtectedNotes();
  await protectedNotes.setUp(JOURNAL, PASSWORD);
  const bankId = await protectedNotes.create(JOURNAL, { title: 'Bank details', folder: '' });
  const passportId = await protectedNotes.create(JOURNAL, { title: 'Passport', folder: '' });
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
  await unlock(PASSWORD);
  await controller.execute({ kind: 'openProtectedNote', noteId: bankId });
  await controller.execute({ kind: 'openProtectedNote', noteId: passportId });
  return { controller, session, protectedNotes, snapshot, unlock, bankId };
}

const tabNamesOf = (snapshot: ViewerSnapshot) =>
  snapshot.viewer.tabStrip.tabs().map((tab) => tab.location.fileName);

afterEach(() => {
  vi.useRealTimers();
});

describe('locking a protected section', () => {
  it('closes both protected tabs and shows the section as locked', async () => {
    const { controller, snapshot } = await startUnlocked();
    expect(tabNamesOf(snapshot())).toEqual(['Bank details', 'Passport']);

    await controller.execute({ kind: 'lockProtectedNotes' });

    expect(tabNamesOf(snapshot())).toEqual([]);
    expect(snapshot().protectedNotes).toMatchObject({ state: 'locked', notes: [] });
  });

  it('saves unsaved edits into the section before it locks', async () => {
    const { controller, protectedNotes, bankId } = await startUnlocked();
    await controller.execute({ kind: 'activateTabNumber', numberKey: 1 });
    controller.updateEditedText(`protected:e:\\journal|${bankId}`, 'PIN 4821');

    await controller.execute({ kind: 'lockProtectedNotes' });
    await protectedNotes.unlock(JOURNAL, PASSWORD, false);

    expect((await protectedNotes.open(JOURNAL, bankId)).text).toBe('PIN 4821');
  });

  it('closes the protected tabs when the section locks in another window', async () => {
    const { protectedNotes, snapshot } = await startUnlocked();

    await protectedNotes.lockAll();

    await vi.waitFor(() => expect(tabNamesOf(snapshot())).toEqual([]));
    expect(snapshot().protectedNotes?.state).toBe('locked');
  });

  it('starts counting wrong passwords again after the right one', async () => {
    const { controller, protectedNotes, unlock } = await startUnlocked();
    await controller.execute({ kind: 'lockProtectedNotes' });
    await unlock('wrong one');
    await unlock('wrong two');
    await unlock('wrong three');
    vi.useFakeTimers();
    const fourthTry = unlock(PASSWORD);
    await vi.advanceTimersByTimeAsync(1_000);
    await fourthTry;
    await controller.execute({ kind: 'lockProtectedNotes' });
    const tries = vi.spyOn(protectedNotes, 'unlock');

    await unlock('wrong again');

    expect(tries).toHaveBeenCalledTimes(1);
  });

  it('opens a remembered section without the password, until this PC is forgotten', async () => {
    const { controller, snapshot, unlock } = await startUnlocked();
    await controller.execute({ kind: 'lockProtectedNotes' });
    await unlock(PASSWORD, true);
    await controller.execute({ kind: 'lockProtectedNotes' });

    await controller.execute({ kind: 'unlockProtectedOnThisPc' });
    expect(snapshot().protectedNotes?.state).toBe('unlocked');
    await controller.execute({ kind: 'forgetProtectedOnThisPc' });
    await controller.execute({ kind: 'lockProtectedNotes' });

    expect(snapshot().protectedNotes?.canUnlockOnThisPc).toBe(false);
    expect(snapshot().notice).toBe(
      'This PC no longer remembers the protected notes. Unlocking needs the password again.',
    );
  });
});
