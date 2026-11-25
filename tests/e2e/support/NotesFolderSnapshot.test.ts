import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotesFolderSnapshot } from './NotesFolderSnapshot';

describe('NotesFolderSnapshot', () => {
  let notesFolder: string;

  beforeEach(() => {
    notesFolder = mkdtempSync(join(tmpdir(), 'mdx-notes-snapshot-'));
    mkdirSync(join(notesFolder, 'Trips'));
    writeFileSync(join(notesFolder, 'Plan.md'), '# Plan\n');
    writeFileSync(join(notesFolder, 'Trips', 'Paris.md'), '# Paris\n');
  });

  afterEach(() => {
    rmSync(notesFolder, { recursive: true, force: true });
  });

  it('reports no change when every note is as it was', () => {
    const snapshot = NotesFolderSnapshot.take(notesFolder);

    expect(snapshot.changedNotes()).toEqual([]);
  });

  it('reports a note whose text changed but not its size', () => {
    const snapshot = NotesFolderSnapshot.take(notesFolder);

    writeFileSync(join(notesFolder, 'Trips', 'Paris.md'), '# Paree\n');

    expect(snapshot.changedNotes()).toEqual(['Trips/Paris.md']);
  });

  it('reports notes added and removed in any subfolder', () => {
    const snapshot = NotesFolderSnapshot.take(notesFolder);

    unlinkSync(join(notesFolder, 'Plan.md'));
    mkdirSync(join(notesFolder, 'Trips', 'Old'));
    writeFileSync(join(notesFolder, 'Trips', 'Old', 'Rome.md'), '# Rome\n');

    expect(snapshot.changedNotes()).toEqual(['Plan.md', 'Trips/Old/Rome.md']);
  });

  it('leaves out what the app keeps in its own folder', () => {
    const snapshot = NotesFolderSnapshot.take(notesFolder);

    mkdirSync(join(notesFolder, '.mdx-notes'));
    writeFileSync(join(notesFolder, '.mdx-notes', 'notes-location.json'), '{}');

    expect(snapshot.changedNotes()).toEqual([]);
  });

  it('still checks a folder of the same name deeper in the notes', () => {
    const snapshot = NotesFolderSnapshot.take(notesFolder);

    mkdirSync(join(notesFolder, 'Trips', '.mdx-notes'));
    writeFileSync(join(notesFolder, 'Trips', '.mdx-notes', 'Nice.md'), '# Nice\n');

    expect(snapshot.changedNotes()).toEqual(['Trips/.mdx-notes/Nice.md']);
  });

  it('reports every note of a folder removed after the snapshot', () => {
    const snapshot = NotesFolderSnapshot.take(notesFolder);

    rmSync(join(notesFolder, 'Trips'), { recursive: true });

    expect(snapshot.changedNotes()).toEqual(['Trips/Paris.md']);
  });

  it('reports every note of a folder made after the snapshot', () => {
    const laterFolder = join(notesFolder, 'Later');
    const snapshot = NotesFolderSnapshot.take(laterFolder);

    mkdirSync(laterFolder);
    writeFileSync(join(laterFolder, 'Idea.md'), '# Idea\n');

    expect(snapshot.changedNotes()).toEqual(['Idea.md']);
  });
});
