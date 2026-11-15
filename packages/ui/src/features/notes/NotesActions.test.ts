import { ViewerSession, WorkspaceKindsState, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryNoteFiles,
  InMemoryNotesLocations,
  InMemoryWorkspaceStore,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });
const JOURNAL = 'E:\\Journal';

async function startInJournal(paths: { notes?: readonly string[]; folders?: readonly string[] } = {}) {
  const documents = Object.fromEntries((paths.notes ?? []).map((path) => [path, `# ${path}`]));
  const documentFiles = new InMemoryDocumentFiles(documents);
  const noteFiles = new InMemoryNoteFiles(paths);
  let nextId = 0;
  const session = new ViewerSession({
    documentFiles,
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
    noteFiles,
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
  const tabPaths = () =>
    snapshot()
      .viewer.tabStrip.tabs()
      .map((tab) => tab.location.displayPath);
  return { controller, session, documentFiles, noteFiles, snapshot, tabPaths };
}

describe('notes in a Notes workspace', () => {
  it('shows the note tree of the workspace’s folder', async () => {
    const { snapshot } = await startInJournal();

    expect(snapshot().notes).toEqual({ locationPath: JOURNAL, revision: 0 });
  });

  it('a new note is created and opened for typing', async () => {
    const { controller, documentFiles, noteFiles, snapshot, tabPaths } = await startInJournal();
    documentFiles.write('E:\\Journal\\Ideas.md', '');

    await controller.execute({ kind: 'createNote', parent: JOURNAL, name: 'Ideas' });

    expect(noteFiles.notePaths()).toEqual(['E:\\Journal\\Ideas.md']);
    expect(tabPaths()).toEqual(['E:\\Journal\\Ideas.md']);
    expect(snapshot().isActiveDocumentEditing).toBe(true);
    expect(snapshot().notes?.revision).toBe(1);
  });

  it('a renamed note keeps its tab, and its child note’s tab follows', async () => {
    const { controller, snapshot, tabPaths } = await startInJournal({
      folders: ['E:\\Journal\\Projects'],
      notes: ['E:\\Journal\\Projects.md', 'E:\\Journal\\Projects\\Plan.md'],
    });
    await controller.openDocuments(['E:\\Journal\\Projects\\Plan.md', 'E:\\Journal\\Projects.md']);
    const projects = snapshot().viewer.tabStrip.activeTab()?.location;
    if (!projects) throw new Error('no active tab');

    await controller.execute({ kind: 'renameNote', note: projects, name: 'Work' });

    expect(tabPaths()).toEqual(['E:\\Journal\\Work\\Plan.md', 'E:\\Journal\\Work.md']);
  });

  it('a note moved under another note keeps its tab', async () => {
    const { controller, noteFiles, snapshot, tabPaths } = await startInJournal({
      notes: ['E:\\Journal\\Plan.md', 'E:\\Journal\\Projects.md'],
    });
    await controller.openDocuments(['E:\\Journal\\Plan.md']);
    const plan = snapshot().viewer.tabStrip.activeTab()?.location;
    if (!plan) throw new Error('no active tab');

    await controller.execute({ kind: 'moveNote', note: plan, into: 'E:\\Journal\\Projects.md' });

    expect(noteFiles.notePaths()).toEqual(['E:\\Journal\\Projects.md', 'E:\\Journal\\Projects\\Plan.md']);
    expect(tabPaths()).toEqual(['E:\\Journal\\Projects\\Plan.md']);
  });

  it('a note with unsaved changes is not renamed and the user is asked to save it', async () => {
    const { controller, noteFiles, snapshot } = await startInJournal({ notes: ['E:\\Journal\\Plan.md'] });
    await controller.openDocuments(['E:\\Journal\\Plan.md']);
    const plan = snapshot().viewer.tabStrip.activeTab()?.location;
    if (!plan) throw new Error('no active tab');
    controller.updateEditedText(plan.canonicalKey, '# Changed');

    await controller.execute({ kind: 'renameNote', note: plan, name: 'Ideas' });

    expect(noteFiles.notePaths()).toEqual(['E:\\Journal\\Plan.md']);
    expect(snapshot().notice).toBe('Save Plan before you rename or move it.');
  });

  it('a deleted note goes to the trash, its tabs close, and Undo brings it back', async () => {
    const { controller, noteFiles, snapshot, tabPaths } = await startInJournal({
      folders: ['E:\\Journal\\Projects'],
      notes: ['E:\\Journal\\Projects.md', 'E:\\Journal\\Projects\\Plan.md', 'E:\\Journal\\Inbox.md'],
    });
    await controller.openDocuments(['E:\\Journal\\Inbox.md', 'E:\\Journal\\Projects\\Plan.md']);
    const projects = {
      canonicalKey: 'e:\\journal\\projects.md',
      displayPath: 'E:\\Journal\\Projects.md',
      fileName: 'Projects.md',
    };

    await controller.execute({ kind: 'deleteNote', note: projects });
    expect(noteFiles.notePaths()).toEqual(['E:\\Journal\\Inbox.md']);
    expect(tabPaths()).toEqual(['E:\\Journal\\Inbox.md']);
    expect(snapshot().notice).toBe('Moved Projects to the trash.');
    const undo = snapshot().noticeActions?.[0];
    if (!undo) throw new Error('no Undo offered');
    await controller.runNoticeAction(undo);

    expect(noteFiles.notePaths()).toEqual([
      'E:\\Journal\\Inbox.md',
      'E:\\Journal\\Projects.md',
      'E:\\Journal\\Projects\\Plan.md',
    ]);
    expect(snapshot().notice).toBe('Restored Projects.');
  });

  it('the trash view lists deleted notes and follows a restore and Empty Trash', async () => {
    const { controller, snapshot } = await startInJournal({
      notes: ['E:\\Journal\\Inbox.md', 'E:\\Journal\\Plan.md'],
    });
    const at = (fileName: string) => ({
      canonicalKey: `e:\\journal\\${fileName.toLowerCase()}`,
      displayPath: `E:\\Journal\\${fileName}`,
      fileName,
    });
    await controller.execute({ kind: 'deleteNote', note: at('Inbox.md') });
    await controller.execute({ kind: 'deleteNote', note: at('Plan.md') });

    await controller.execute({ kind: 'showNoteTrash' });
    expect(snapshot().openDialog).toBe('noteTrash');
    expect(snapshot().notes?.trash?.map((entry) => entry.name)).toEqual(['Plan', 'Inbox']);
    const plan = snapshot().notes?.trash?.[0];
    if (!plan) throw new Error('no entry');
    await controller.execute({ kind: 'restoreNote', entryId: plan.id });
    expect(snapshot().notes?.trash?.map((entry) => entry.name)).toEqual(['Inbox']);
    await controller.execute({ kind: 'emptyNoteTrash' });

    expect(snapshot().notes?.trash).toEqual([]);
    expect(snapshot().notice).toBe('Removed 1 note from the trash for good.');
  });

  it('a note with unsaved changes is not deleted', async () => {
    const { controller, noteFiles, snapshot } = await startInJournal({ notes: ['E:\\Journal\\Plan.md'] });
    await controller.openDocuments(['E:\\Journal\\Plan.md']);
    const plan = snapshot().viewer.tabStrip.activeTab()?.location;
    if (!plan) throw new Error('no active tab');
    controller.updateEditedText(plan.canonicalKey, '# Changed');

    await controller.execute({ kind: 'deleteNote', note: plan });

    expect(noteFiles.notePaths()).toEqual(['E:\\Journal\\Plan.md']);
    expect(snapshot().notice).toBe('Save Plan before you delete it.');
  });

  it('a taken name is refused with a message', async () => {
    const { controller, snapshot } = await startInJournal({ notes: ['E:\\Journal\\Ideas.md'] });

    await controller.execute({ kind: 'createNote', parent: JOURNAL, name: 'ideas' });

    expect(snapshot().notice).toBe('Another note in this folder already has that name. Choose another name.');
    expect(snapshot().notes?.revision).toBe(0);
  });
});
