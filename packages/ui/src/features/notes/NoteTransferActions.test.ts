import { DEFAULT_NOTES_SETTINGS, ViewerSession, WorkspaceKindsState, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  DocumentOpenError,
  EMPTY_IMPORT_REPORT,
  InMemoryAppState,
  InMemoryDocumentExport,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryNoteFiles,
  InMemoryNotesLocations,
  InMemoryNoteTransfer,
  InMemoryWorkspaceStore,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });
const JOURNAL = 'E:\\Journal';
const PLAN = 'E:\\Journal\\Projects\\Plan.md';

async function startInJournal() {
  const documentFiles = new InMemoryDocumentFiles({ [PLAN]: '# Plan' });
  const noteTransfer = new InMemoryNoteTransfer();
  const printed: string[] = [];
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
    noteFiles: new InMemoryNoteFiles({ folders: ['E:\\Journal\\Projects'], notes: [PLAN] }),
    noteTransfer,
    documentExport: new InMemoryDocumentExport(),
    printer: { printActiveDocument: () => void printed.push(snapshot().activeDocument?.displayPath ?? '') },
  });
  let latest: ViewerSnapshot | undefined;
  controller.subscribe((shown) => (latest = shown));
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
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
  await controller.execute({
    kind: 'updateNotesSettings',
    settings: { ...DEFAULT_NOTES_SETTINGS, excludedPaths: ['Private'] },
  });
  return { controller, noteTransfer, snapshot, printed };
}

const FOLDER_EXPORT = { kind: 'folder', path: 'E:\\Journal\\Projects' } as const;

describe('importing and exporting notes', () => {
  it('imports a picked folder into the location with its excluded paths, and shows the report', async () => {
    const { controller, noteTransfer, snapshot } = await startInJournal();
    noteTransfer.pickedImportFolder = 'D:\\Vault';
    noteTransfer.importProgress = [{ done: 1, total: 2, isListing: false }];
    noteTransfer.importReport = {
      ...EMPTY_IMPORT_REPORT,
      copiedFiles: 2,
      unsupportedSyntax: [{ note: 'Plan.md', kind: 'blockReference', line: 3, detail: 'Plan#^a1b2' }],
    };

    await controller.execute({ kind: 'importNotesFolder' });

    expect(noteTransfer.imports).toEqual([
      { location: JOURNAL, source: 'D:\\Vault', excludedPaths: ['Private'] },
    ]);
    expect(snapshot().openDialog).toBe('noteImport');
    expect(snapshot().notes?.noteImport?.report?.unsupportedSyntax).toHaveLength(1);
    expect(snapshot().notes?.revision).toBe(1);
  });

  it('imports nothing when no folder is picked', async () => {
    const { controller, noteTransfer, snapshot } = await startInJournal();

    await controller.execute({ kind: 'importNotesFolder' });

    expect(noteTransfer.imports).toEqual([]);
    expect(snapshot().openDialog).toBeUndefined();
  });

  it('keeps an import running when its dialog closes, and says when it is done', async () => {
    const { controller, noteTransfer, snapshot } = await startInJournal();
    noteTransfer.pickedImportFolder = 'D:\\Vault';
    noteTransfer.isImportHeld = true;
    noteTransfer.importReport = { ...EMPTY_IMPORT_REPORT, copiedFiles: 3 };
    const importing = controller.execute({ kind: 'importNotesFolder' });
    await Promise.resolve();

    await controller.execute({ kind: 'closeNotesTransfer' });
    noteTransfer.finishPendingImport();
    await importing;

    expect(snapshot().notice).toBe('The notes import is done: 3 files copied.');
    const showReport = snapshot().noticeActions?.[0];
    if (showReport) await controller.runNoticeAction(showReport);
    expect(snapshot().openDialog).toBe('noteImport');
  });

  it('shows the running import again instead of starting a second one', async () => {
    const { controller, noteTransfer, snapshot } = await startInJournal();
    noteTransfer.pickedImportFolder = 'D:\\Vault';
    noteTransfer.isImportHeld = true;
    const importing = controller.execute({ kind: 'importNotesFolder' });
    await Promise.resolve();
    await controller.execute({ kind: 'closeNotesTransfer' });

    await controller.execute({ kind: 'importNotesFolder' });

    expect(noteTransfer.imports).toHaveLength(1);
    expect(snapshot().openDialog).toBe('noteImport');
    noteTransfer.finishPendingImport();
    await importing;
  });

  it('says why an import was refused, such as a folder holding the notes folder', async () => {
    const { controller, noteTransfer, snapshot } = await startInJournal();
    noteTransfer.pickedImportFolder = 'E:\\';
    noteTransfer.importFailure = new DocumentOpenError('sourceOverlapsLocation', 'E:\\');

    await controller.execute({ kind: 'importNotesFolder' });

    expect(snapshot().notes?.noteImport?.failure).toEqual({
      messageKey: 'errors.document.sourceOverlapsLocation',
      path: 'E:\\',
    });
  });

  it('stops an import on request', async () => {
    const { controller, noteTransfer, snapshot } = await startInJournal();
    noteTransfer.pickedImportFolder = 'D:\\Vault';
    noteTransfer.isImportHeld = true;
    const importing = controller.execute({ kind: 'importNotesFolder' });
    await Promise.resolve();

    await controller.execute({ kind: 'cancelNotesImport' });
    await importing;

    expect(noteTransfer.cancelCount).toBe(1);
    expect(snapshot().notes?.noteImport?.report?.wasCancelled).toBe(true);
  });

  it('refuses a destination inside the location', async () => {
    const { controller, noteTransfer, snapshot } = await startInJournal();
    noteTransfer.exportFolderChoice = { choice: 'insideLocation' };
    await controller.execute({ kind: 'showNotesExport', notes: FOLDER_EXPORT, name: 'Projects' });

    await controller.execute({ kind: 'chooseNotesExportFolder' });
    await controller.execute({ kind: 'startNotesExport' });

    expect(snapshot().notes?.noteExport?.isDestinationRefused).toBe(true);
    expect(noteTransfer.exports).toEqual([]);
  });

  it('exports byte for byte by default, or with relative links when chosen', async () => {
    const { controller, noteTransfer, snapshot } = await startInJournal();
    noteTransfer.exportFolderChoice = { choice: 'picked', path: 'D:\\Exports' };
    await controller.execute({ kind: 'showNotesExport', notes: FOLDER_EXPORT, name: 'Projects' });
    await controller.execute({ kind: 'chooseNotesExportFolder' });

    await controller.execute({ kind: 'startNotesExport' });
    await controller.execute({ kind: 'showNotesExport', notes: FOLDER_EXPORT, name: 'Projects' });
    await controller.execute({ kind: 'chooseNotesExportFolder' });
    await controller.execute({ kind: 'setNotesExportRelativeLinks', isOn: true });
    await controller.execute({ kind: 'startNotesExport' });

    expect(noteTransfer.exports.map((request) => request.useRelativeLinks)).toEqual([false, true]);
    expect(noteTransfer.exports[0]).toMatchObject({
      location: JOURNAL,
      notes: FOLDER_EXPORT,
      destination: 'D:\\Exports',
      replaceExisting: false,
      excludedPaths: ['Private'],
    });
    expect(snapshot().notes?.noteExport?.summary?.exportedFiles).toBe(1);
  });

  it('asks before replacing files already in the destination', async () => {
    const { controller, noteTransfer, snapshot } = await startInJournal();
    noteTransfer.exportFolderChoice = { choice: 'picked', path: 'D:\\Exports' };
    noteTransfer.existingFileCount = 2;
    await controller.execute({ kind: 'showNotesExport', notes: FOLDER_EXPORT, name: 'Projects' });
    await controller.execute({ kind: 'chooseNotesExportFolder' });

    await controller.execute({ kind: 'startNotesExport' });
    const asked = snapshot().notes?.noteExport?.existingFileCount;
    await controller.execute({ kind: 'replaceExportedNotes' });

    expect(asked).toBe(2);
    expect(noteTransfer.exports.map((request) => request.replaceExisting)).toEqual([false, true]);
    expect(snapshot().notes?.noteExport?.summary).toBeDefined();
  });

  it('prints a note through the app’s own printing, after showing it', async () => {
    const { controller, printed, snapshot } = await startInJournal();
    const note = { canonicalKey: PLAN.toLowerCase(), displayPath: PLAN, fileName: 'Plan.md' };

    await controller.execute({ kind: 'printNote', note });
    const printRequest = snapshot().printRequest;
    controller.printShownDocument();

    expect(printRequest).toBe(1);
    expect(printed).toEqual([PLAN]);
  });
});
