import { describe, expect, it } from 'vitest';
import { DocumentOpenError } from '../DocumentOpenError';
import { InMemoryNoteFiles } from './InMemoryNoteFiles';

const LOCATION = 'C:\\Notes';

describe('InMemoryNoteFiles', () => {
  it('a child note creates its folder', async () => {
    const noteFiles = new InMemoryNoteFiles({ notes: ['C:\\Notes\\Projects.md'] });

    await noteFiles.createNote({ location: LOCATION, parent: 'C:\\Notes\\Projects.md', name: 'Plan' });

    expect(noteFiles.folderPaths()).toEqual(['C:\\Notes\\Projects']);
    expect(noteFiles.notePaths()).toEqual(['C:\\Notes\\Projects.md', 'C:\\Notes\\Projects\\Plan.md']);
  });

  it('rename takes the child notes along and refuses a taken name', async () => {
    const noteFiles = new InMemoryNoteFiles({
      folders: ['C:\\Notes\\Projects'],
      notes: ['C:\\Notes\\Projects.md', 'C:\\Notes\\Projects\\Plan.md', 'C:\\Notes\\Ideas.md'],
    });

    const taken = noteFiles.renameNote({ location: LOCATION, note: 'C:\\Notes\\Projects.md', name: 'ideas' });
    await expect(taken).rejects.toEqual(new DocumentOpenError('nameTaken', 'C:\\Notes\\Projects.md'));
    await noteFiles.renameNote({ location: LOCATION, note: 'C:\\Notes\\Projects.md', name: 'Work' });

    expect(noteFiles.notePaths()).toEqual([
      'C:\\Notes\\Ideas.md',
      'C:\\Notes\\Work.md',
      'C:\\Notes\\Work\\Plan.md',
    ]);
  });

  it('a deleted note with children comes back together, renamed when its name was taken', async () => {
    const noteFiles = new InMemoryNoteFiles({
      folders: ['C:\\Notes\\Projects'],
      notes: ['C:\\Notes\\Projects.md', 'C:\\Notes\\Projects\\Plan.md'],
    });

    const entry = await noteFiles.deleteNote({ location: LOCATION, note: 'C:\\Notes\\Projects.md' });
    await noteFiles.createNote({ location: LOCATION, parent: LOCATION, name: 'Projects' });
    const restored = await noteFiles.restoreNote({ location: LOCATION, entryId: entry.id });

    expect(entry).toMatchObject({ name: 'Projects', originalPath: 'Projects.md', hasChildNotes: true });
    expect(restored.fileName).toBe('Projects (restored).md');
    expect(noteFiles.notePaths()).toEqual([
      'C:\\Notes\\Projects (restored).md',
      'C:\\Notes\\Projects (restored)\\Plan.md',
      'C:\\Notes\\Projects.md',
    ]);
    expect(await noteFiles.listTrash(LOCATION)).toEqual([]);
  });

  it('refuses paths outside the location and moves into a note’s own children', async () => {
    const noteFiles = new InMemoryNoteFiles({ folders: ['C:\\Notes\\Plan'], notes: ['C:\\Notes\\Plan.md'] });

    await expect(
      noteFiles.moveNote({ location: LOCATION, note: 'C:\\Notes\\Plan.md', into: 'D:\\Elsewhere' }),
    ).rejects.toMatchObject({ failure: 'accessDenied' });
    await expect(
      noteFiles.moveNote({ location: LOCATION, note: 'C:\\Notes\\Plan.md', into: 'C:\\Notes\\Plan' }),
    ).rejects.toMatchObject({ failure: 'invalidRequest' });
  });
});
