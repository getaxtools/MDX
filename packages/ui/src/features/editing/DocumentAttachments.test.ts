import { ViewerSession } from '@mdx/core';
import { InMemoryAppState, InMemoryAttachments, InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it, vi } from 'vitest';
import { DocumentAttachments, type AttachmentCallbacks } from './DocumentAttachments';

const GUIDE = 'C:\\Docs\\Guide.md';

async function attachmentsFor({ isUntitled = false, isEditing = true } = {}) {
  const session = new ViewerSession({
    documentFiles: new InMemoryDocumentFiles({ [GUIDE]: '# Guide' }),
    appState: new InMemoryAppState(),
    now: () => 0,
  });
  if (isUntitled) session.openUntitledDocument('', (number) => `Untitled-${String(number)}.md`);
  else await session.openDocument(GUIDE);
  const port = new InMemoryAttachments();
  const callbacks: AttachmentCallbacks = {
    isEditing: () => isEditing,
    insertLinks: vi.fn(),
    notify: vi.fn(),
    askToSaveFirst: vi.fn(),
  };
  const attachments = new DocumentAttachments(session, port, callbacks);
  return { attachments, port, callbacks };
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
      { x: 10, y: 20 },
    );
  });

  it('Untitled drop asks to save and copies nothing', async () => {
    const { attachments, port, callbacks } = await attachmentsFor({ isUntitled: true });

    await attachments.addDroppedPictures({ paths: ['C:\\Pictures\\a.png'], x: 0, y: 0 });

    expect(callbacks.askToSaveFirst).toHaveBeenCalledOnce();
    expect(port.saved).toEqual([]);
  });

  it('asks to open the editor when the document is shown as a preview', async () => {
    const { attachments, port, callbacks } = await attachmentsFor({ isEditing: false });

    await attachments.addDroppedPictures({ paths: ['C:\\Pictures\\a.png'], x: 0, y: 0 });

    expect(callbacks.notify).toHaveBeenCalledWith('attachments.notEditing');
    expect(port.saved).toEqual([]);
  });

  it('refused file is named in the message and the others are still added', async () => {
    const { attachments, port, callbacks } = await attachmentsFor();
    port.refusedNames.add('tool.png');

    await attachments.addDroppedPictures({ paths: ['C:\\tool.png', 'C:\\ok.png'], x: 0, y: 0 });

    expect(callbacks.notify).toHaveBeenCalledWith('attachments.failed', { path: 'tool.png' });
    expect(callbacks.insertLinks).toHaveBeenCalledWith(['![ok](assets/ok.png)'], { x: 0, y: 0 });
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
});
