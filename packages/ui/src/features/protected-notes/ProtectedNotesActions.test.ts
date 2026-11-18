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
import { describe, expect, it, vi } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });
const JOURNAL = 'E:\\Journal';
const PASSWORD = 'correct horse battery';

async function startInJournal(protectedNotes = new InMemoryProtectedNotes()) {
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
  await vi.waitFor(() => expect(snapshot().protectedNotes).toBeDefined());
  return { controller, session, protectedNotes, snapshot };
}

describe('setting up a protected section', () => {
  it('shows a Notes workspace without a section as not set up', async () => {
    const { snapshot } = await startInJournal();

    expect(snapshot().protectedNotes).toEqual({
      state: 'notSetUp',
      canUnlockOnThisPc: false,
      notes: [],
      isBusy: false,
    });
  });

  it('offers no section outside a Notes workspace', async () => {
    const { controller, snapshot } = await startInJournal();

    await controller.execute({ kind: 'createWorkspace', name: 'Docs', kindId: 'markdownViewer' });

    await vi.waitFor(() => expect(snapshot().protectedNotes).toBeUndefined());
  });

  it('shows the recovery key once and an empty, unlocked section after it is confirmed', async () => {
    const { controller, snapshot } = await startInJournal();

    await controller.execute({ kind: 'showProtectedSetUp' });
    await controller.execute({ kind: 'setUpProtectedSection', password: PASSWORD });
    const recoveryKey = snapshot().protectedNotes?.recoveryKey;
    await controller.execute({ kind: 'finishProtectedSetUp' });

    expect(recoveryKey).toMatch(/^RCVR-/);
    expect(snapshot().openDialog).toBeUndefined();
    expect(snapshot().protectedNotes).toEqual({
      state: 'unlocked',
      canUnlockOnThisPc: false,
      notes: [],
      isBusy: false,
    });
  });

  it('keeps the set-up dialog open with the reason when set-up is refused', async () => {
    const { controller, snapshot } = await startInJournal();

    await controller.execute({ kind: 'showProtectedSetUp' });
    await controller.execute({ kind: 'setUpProtectedSection', password: 'short' });

    expect(snapshot().openDialog).toBe('protectedSetUp');
    expect(snapshot().protectedNotes?.setUpProblem).toBe('protectedNotes.setUp.tooShort');
    expect(snapshot().protectedNotes?.state).toBe('notSetUp');
  });

  it('does not offer set-up again once the section exists', async () => {
    const protectedNotes = new InMemoryProtectedNotes();
    await protectedNotes.setUp(JOURNAL, PASSWORD);
    await protectedNotes.lock(JOURNAL);
    const { controller, snapshot } = await startInJournal(protectedNotes);

    await controller.execute({ kind: 'showProtectedSetUp' });

    expect(snapshot().openDialog).toBeUndefined();
    expect(snapshot().protectedNotes?.state).toBe('locked');
  });
});
