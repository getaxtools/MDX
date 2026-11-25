import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** The app's own folder inside a Notes folder; what it keeps there is not a note. */
const NOTES_APP_FOLDER = '.mdx-notes';

/** The SHA-256 of every note under a folder, taken so a test can show the app left the notes as they were. */
export class NotesFolderSnapshot {
  private constructor(
    private readonly folder: string,
    private readonly hashByNote: ReadonlyMap<string, string>,
  ) {}

  static take(folder: string): NotesFolderSnapshot {
    return new NotesFolderSnapshot(folder, hashNotesUnder(folder));
  }

  /** The notes added, removed or changed since the snapshot, by path from the folder with `/` between names. */
  changedNotes(): string[] {
    const hashByNoteNow = hashNotesUnder(this.folder);
    const notes = new Set([...this.hashByNote.keys(), ...hashByNoteNow.keys()]);
    return [...notes].filter((note) => this.hashByNote.get(note) !== hashByNoteNow.get(note)).sort();
  }
}

function hashNotesUnder(folder: string): ReadonlyMap<string, string> {
  if (!existsSync(folder)) return new Map();
  const files = readdirSync(folder, { recursive: true, withFileTypes: true }).filter((entry) =>
    entry.isFile(),
  );
  const hashByNote = new Map<string, string>();
  for (const file of files) {
    const path = join(file.parentPath, file.name);
    const note = relative(folder, path).split(sep).join('/');
    if (note.startsWith(`${NOTES_APP_FOLDER}/`)) continue;
    hashByNote.set(note, createHash('sha256').update(readFileSync(path)).digest('hex'));
  }
  return hashByNote;
}
