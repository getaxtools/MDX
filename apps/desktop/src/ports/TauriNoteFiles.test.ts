import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { DocumentOpenError, InMemoryDocumentFiles } from '@mdx/platform';
import { afterEach, describe, expect, it } from 'vitest';
import { TauriNoteFiles } from './TauriNoteFiles';

const LOCATION = 'C:\\Notes';

function mockCommand(handle: (command: string, args: Record<string, unknown>) => unknown) {
  const calls: { command: string; args: unknown }[] = [];
  mockIPC((command, args) => {
    calls.push({ command, args });
    return handle(command, args as Record<string, unknown>);
  });
  return calls;
}

afterEach(() => clearMocks());

describe('TauriNoteFiles', () => {
  it('creates, renames and moves notes through their commands', async () => {
    const plan = InMemoryDocumentFiles.locationOf('C:\\Notes\\Plan.md');
    const calls = mockCommand(() => plan);
    const noteFiles = new TauriNoteFiles();

    await noteFiles.createNote({ location: LOCATION, parent: LOCATION, name: 'Plan' });
    await noteFiles.renameNote({ location: LOCATION, note: plan.displayPath, name: 'Ideas' });
    await noteFiles.moveNote({ location: LOCATION, note: plan.displayPath, into: 'C:\\Notes\\Archive' });

    expect(calls).toEqual([
      { command: 'create_note', args: { location: LOCATION, parent: LOCATION, name: 'Plan' } },
      { command: 'rename_note', args: { location: LOCATION, note: plan.displayPath, name: 'Ideas' } },
      {
        command: 'move_note',
        args: { location: LOCATION, note: plan.displayPath, into: 'C:\\Notes\\Archive' },
      },
    ]);
  });

  it('deletes, lists, restores and empties the trash through their commands', async () => {
    const calls = mockCommand(() => null);
    const noteFiles = new TauriNoteFiles();

    await noteFiles.deleteNote({ location: LOCATION, note: 'C:\\Notes\\Plan.md' });
    await noteFiles.listTrash(LOCATION);
    await noteFiles.restoreNote({ location: LOCATION, entryId: '1000-Plan' });
    await noteFiles.emptyTrash(LOCATION);

    expect(calls).toEqual([
      { command: 'delete_note', args: { location: LOCATION, note: 'C:\\Notes\\Plan.md' } },
      { command: 'list_note_trash', args: { location: LOCATION } },
      { command: 'restore_note', args: { location: LOCATION, entryId: '1000-Plan' } },
      { command: 'empty_note_trash', args: { location: LOCATION } },
    ]);
  });

  it('lists a folder of the location through list_folder_contents', async () => {
    const listing = { folders: [], documents: [] };
    const calls = mockCommand(() => listing);

    expect(await new TauriNoteFiles().listFolder(LOCATION)).toEqual(listing);
    expect(calls).toEqual([{ command: 'list_folder_contents', args: { folder: LOCATION } }]);
  });

  it('a taken name comes back as a typed error', async () => {
    mockCommand(() => {
      throw Object.assign(new Error('backend error'), { code: 'nameTaken' });
    });

    const result = new TauriNoteFiles().renameNote({
      location: LOCATION,
      note: 'C:\\Notes\\Plan.md',
      name: 'Ideas',
    });

    await expect(result).rejects.toEqual(new DocumentOpenError('nameTaken', 'C:\\Notes\\Plan.md'));
  });
});
