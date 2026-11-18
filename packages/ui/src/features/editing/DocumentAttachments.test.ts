import { ViewerSession, WorkspaceKindsState, workspaceKindsFor } from '@mdx/core';
import {
  InMemoryAppState,
  InMemoryAttachments,
  InMemoryDocumentFiles,
  type ChosenPicture,
  InMemoryWorkspaceStore,
  protectedNoteLocation,
} from '@mdx/platform';
import { describe, expect, it, vi } from 'vitest';
import { DocumentAttachments, type AttachmentCallbacks, type LinkPlace } from './DocumentAttachments';

const GUIDE = 'C:\\Docs\\Guide.md';
const NOTES = 'C:\\Docs\\Notes.md';
const GUIDE_KEY = GUIDE.toLowerCase();

async function attachmentsFor({ isUntitled = false, isEditing = true, isProtected = false } = {}) {
  const session = new ViewerSession({
    documentFiles: new InMemoryDocumentFiles({ [GUIDE]: '# Guide', [NOTES]: '# Notes' }),
    appState: new InMemoryAppState(),
    now: () => 0,
  });
  if (isUntitled) session.openUntitledDocument('', (number) => `Untitled-${String(number)}.md`);
  else await session.openDocument(GUIDE);
  if (isProtected) {
    const location = protectedNoteLocation('c:\\docs', 'a'.repeat(32), 'Bank details');
    session.openProtectedNote(
      { location, text: '', encoding: 'utf-8', hasByteOrderMark: false, lineEnding: 'lf', modifiedAtMs: 0 },
      () => Promise.resolve(),
    );
  }
  const port = new InMemoryAttachments();
  const callbacks: AttachmentCallbacks = {
    isEditing: () => isEditing,
    // Like the app, links go in only while their document is still the active one.
    insertLinks: vi.fn(
      (_links: readonly string[], place: LinkPlace) =>
        session.currentState().tabStrip.activeTab()?.location.canonicalKey === place.canonicalKey,
    ),
    notify: vi.fn(),
    askToSaveFirst: vi.fn(),
  };
  const attachments = new DocumentAttachments(session, port, callbacks);
  return { attachments, port, callbacks, session };
}

/** A picture dialog that stays open until the test closes it with the pictures it returns. */
function holdPictureDialog(port: InMemoryAttachments) {
  let close: (chosen: readonly ChosenPicture[]) => void = () => undefined;
  const show = vi.spyOn(port, 'addPictureFiles').mockImplementation(
    () =>
      new Promise((resolve) => {
        close = resolve;
      }),
  );
  return { show, close: (chosen: readonly ChosenPicture[]) => close(chosen) };
}

describe('DocumentAttachments', () => {
  it('copies dropped pictures into the assets folder and inserts a link for each at the drop point', async () => {
    const { attachments, port, callbacks } = await attachmentsFor();

    await attachments.addDroppedPictures({
      paths: ['C:\\Pictures\\team photo.png', 'D:\\b.jpg'],
      x: 10,
      y: 20,
    });

    expect(port.saved.map(({ target, fileName }) => [target.attachmentFolder, fileName])).toEqual([
      ['assets', 'team photo.png'],
      ['assets', 'b.jpg'],
    ]);
    expect(callbacks.insertLinks).toHaveBeenCalledWith(
      ['![team photo](assets/team%20photo.png)', '![b](assets/b.jpg)'],
      { canonicalKey: GUIDE_KEY, point: { x: 10, y: 20 } },
    );
  });

  it('Untitled drop asks to save and copies nothing', async () => {
    const { attachments, port, callbacks } = await attachmentsFor({ isUntitled: true });

    await attachments.addDroppedPictures({ paths: ['C:\\Pictures\\a.png'], x: 0, y: 0 });

    expect(callbacks.askToSaveFirst).toHaveBeenCalledOnce();
    expect(port.saved).toEqual([]);
  });

  it('adds no picture to a protected note, which would leave it outside the section', async () => {
    const { attachments, port, callbacks } = await attachmentsFor({ isProtected: true });

    await attachments.addDroppedPictures({ paths: ['C:\\Pictures\\a.png'], x: 0, y: 0 });

    expect(callbacks.notify).toHaveBeenCalledWith('protectedNotes.attachments.unavailable');
    expect(port.saved).toEqual([]);
  });

  it('asks to open the editor when the document is shown as a preview', async () => {
    const { attachments, port, callbacks } = await attachmentsFor({ isEditing: false });

    await attachments.addDroppedPictures({ paths: ['C:\\Pictures\\a.png'], x: 0, y: 0 });

    expect(callbacks.notify).toHaveBeenCalledWith('attachments.notEditing');
    expect(port.saved).toEqual([]);
  });

  it('refused file is named in a message saying why, and the others are still added', async () => {
    const { attachments, port, callbacks } = await attachmentsFor();
    port.refusedNames.add('tool.png');

    await attachments.addDroppedPictures({ paths: ['C:\\tool.png', 'C:\\ok.png'], x: 0, y: 0 });

    expect(callbacks.notify).toHaveBeenCalledWith('errors.document.notAnImage', { path: 'tool.png' });
    expect(callbacks.insertLinks).toHaveBeenCalledWith(['![ok](assets/ok.png)'], {
      canonicalKey: GUIDE_KEY,
      point: { x: 0, y: 0 },
    });
  });

  it('pasted image bytes go through the port under the document name and time', async () => {
    const { attachments, port } = await attachmentsFor();
    const bytes = new Uint8Array([137, 80, 78, 71]);

    const link = await attachments.pastePicture(bytes);

    expect(port.saved[0]?.bytes).toBe(bytes);
    expect(port.saved[0]?.fileName).toMatch(/^Guide \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.png$/);
    expect(link).toMatch(/^!\[Guide \d{4}/);
  });

  it('listens to drops while started', async () => {
    const { attachments, port, callbacks } = await attachmentsFor();
    const stop = attachments.start();

    port.drop({ paths: ['C:\\a.png'], x: 1, y: 2 });
    await vi.waitFor(() => expect(callbacks.insertLinks).toHaveBeenCalled());
    stop();

    expect(port.saved).toHaveLength(1);
  });

  it('returned links of chosen pictures are inserted at the caret', async () => {
    const { attachments, port, callbacks } = await attachmentsFor();
    port.pictureChoice = ['C:\\Pictures\\chart.png', 'C:\\Pictures\\map.webp'];

    await attachments.addPictureFiles('Pictures');

    expect(port.pictureDialogFilters).toEqual(['Pictures']);
    expect(callbacks.insertLinks).toHaveBeenCalledWith(
      ['![chart](assets/chart.png)', '![map](assets/map.webp)'],
      { canonicalKey: GUIDE_KEY },
    );
  });

  it('a chosen file that is not a picture is named and the others are linked', async () => {
    const { attachments, port, callbacks } = await attachmentsFor();
    port.pictureChoice = ['C:\\notes.txt', 'C:\\ok.png'];
    port.refusedNames.add('notes.txt');

    await attachments.addPictureFiles('Pictures');

    expect(callbacks.notify).toHaveBeenCalledWith('errors.document.notAnImage', { path: 'notes.txt' });
    expect(callbacks.insertLinks).toHaveBeenCalledWith(['![ok](assets/ok.png)'], {
      canonicalKey: GUIDE_KEY,
    });
  });

  it('a picture larger than the preview shows says so', async () => {
    const { attachments, port, callbacks } = await attachmentsFor();
    vi.spyOn(port, 'addPictureFiles').mockResolvedValue([
      { kind: 'failed', fileName: 'poster.png', reason: 'tooLarge' },
    ]);

    await attachments.addPictureFiles('Pictures');

    expect(callbacks.notify).toHaveBeenCalledWith('attachments.tooLarge', { path: 'poster.png' });
    expect(callbacks.insertLinks).not.toHaveBeenCalled();
  });

  it('an Untitled document asks to save first and shows no picture dialog', async () => {
    const { attachments, port, callbacks } = await attachmentsFor({ isUntitled: true });
    port.pictureChoice = ['C:\\Pictures\\chart.png'];

    await attachments.addPictureFiles('Pictures');

    expect(callbacks.askToSaveFirst).toHaveBeenCalledOnce();
    expect(port.pictureDialogFilters).toEqual([]);
    expect(port.saved).toEqual([]);
  });

  it('a cancelled picture dialog inserts nothing', async () => {
    const { attachments, callbacks } = await attachmentsFor();

    await attachments.addPictureFiles('Pictures');

    expect(callbacks.insertLinks).not.toHaveBeenCalled();
  });

  it('switching tabs while the picture dialog is open adds no link to the other document', async () => {
    const { attachments, port, callbacks, session } = await attachmentsFor();
    const dialog = holdPictureDialog(port);

    const adding = attachments.addPictureFiles('Pictures');
    await session.openDocument(NOTES);
    dialog.close([{ kind: 'saved', relativePath: 'assets/chart.png' }]);
    await adding;

    expect(callbacks.insertLinks).toHaveBeenCalledWith(['![chart](assets/chart.png)'], {
      canonicalKey: GUIDE_KEY,
    });
    expect(callbacks.insertLinks).toHaveLastReturnedWith(false);
    expect(callbacks.notify).toHaveBeenCalledWith('attachments.linksNotAdded', { fileName: 'Guide.md' });
  });

  it('a second Image press while the picture dialog is open does nothing', async () => {
    const { attachments, port } = await attachmentsFor();
    const dialog = holdPictureDialog(port);

    const first = attachments.addPictureFiles('Pictures');
    await attachments.addPictureFiles('Pictures');
    dialog.close([]);
    await first;
    const afterTheDialogClosed = attachments.addPictureFiles('Pictures');
    dialog.close([]);
    await afterTheDialogClosed;

    expect(dialog.show).toHaveBeenCalledTimes(2);
  });
});

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });

describe('DocumentAttachments in a Notes workspace', () => {
  async function noteAttachments(settings?: Record<string, unknown>) {
    const notesFolder = 'E:\\Notes';
    const note = 'E:\\Notes\\Projects\\Plan.md';
    const session = new ViewerSession({
      documentFiles: new InMemoryDocumentFiles({ [note]: '# Plan' }),
      appState: new InMemoryAppState(),
      workspaceStore: new InMemoryWorkspaceStore(),
      kindRegistry: ALL_KINDS_BUILT,
      now: () => 0,
      createId: () => 'workspace-notes',
    });
    await session.restore();
    session.updateWorkspaceKinds(() =>
      WorkspaceKindsState.fromSaved(
        { enabledKindIds: ['markdownViewer', 'notes'], activeKindId: 'markdownViewer' },
        ALL_KINDS_BUILT,
      ),
    );
    const location = { path: notesFolder, canonicalKey: notesFolder.toLowerCase(), locationId: 'location-1' };
    await session.createWorkspace({ name: 'Journal', kindId: 'notes', kindData: { location, ...settings } });
    await session.openDocument(note);
    const port = new InMemoryAttachments();
    const callbacks: AttachmentCallbacks = {
      isEditing: () => true,
      insertLinks: vi.fn(),
      notify: vi.fn(),
      askToSaveFirst: vi.fn(),
    };
    return { attachments: new DocumentAttachments(session, port, callbacks), port, notesFolder, callbacks };
  }

  it('saves a pasted picture into the Attachments folder of the notes folder, linked from the note', async () => {
    const { attachments, port, notesFolder } = await noteAttachments();

    const link = await attachments.pastePicture(new Uint8Array([137, 80, 78, 71]));

    expect(port.saved[0]?.target).toMatchObject({ attachmentFolder: 'Attachments', notesFolder });
    expect(link).toMatch(/^!\[Plan [^\]]+\]\(\.\.\/Attachments\/Plan%20/);
  });

  it('pictures chosen with the Image button go to the same Attachments folder as pasted ones', async () => {
    const { attachments, port, notesFolder, callbacks } = await noteAttachments();
    port.pictureChoice = [String.raw`C:\Pictures\chart.png`];

    await attachments.addPictureFiles('Pictures');

    expect(port.saved[0]?.target).toMatchObject({ attachmentFolder: 'Attachments', notesFolder });
    expect(callbacks.insertLinks).toHaveBeenCalledWith(['![chart](../Attachments/chart.png)'], {
      canonicalKey: String.raw`E:\Notes\Projects\Plan.md`.toLowerCase(),
    });
  });

  it('uses the attachments folder chosen in the settings', async () => {
    const { attachments, port } = await noteAttachments({ settings: { attachmentsFolder: 'Media' } });

    await attachments.addDroppedPictures({ paths: ['C:\\Pictures\\chart.png'], x: 0, y: 0 });

    expect(port.saved[0]?.target.attachmentFolder).toBe('Media');
  });
});
