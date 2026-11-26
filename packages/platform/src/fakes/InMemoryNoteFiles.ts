import type { DocumentLocation } from '../DocumentLocation';
import { DocumentOpenError, type DocumentOpenFailure } from '../DocumentOpenError';
import type { FolderListing } from '../FolderPort';
import type {
  NoteCreation,
  NoteDeletion,
  NoteFilesPort,
  NoteInFolder,
  NoteMove,
  NoteRename,
  NoteRestore,
  NoteTrashEntry,
} from '../NoteFilesPort';
import type {
  AppliedLinkUpdates,
  LinkEdit,
  LinkUpdatesToApply,
  NoteLinkEdits,
  NotUpdatedNote,
} from '../NoteLinkUpdates';
import { InMemoryDocumentFiles } from './InMemoryDocumentFiles';

const NOTE_EXTENSION = /\.(md|markdown|mdown|mkd|mdx)$/i;

interface TrashedNote {
  readonly entry: NoteTrashEntry;
  readonly location: string;
  readonly folders: readonly string[];
  readonly notes: readonly string[];
}

/** Notes and folders as Windows paths; names compare ignoring case, as on NTFS. */
export class InMemoryNoteFiles implements NoteFilesPort {
  private readonly folders = new Map<string, string>();
  private readonly notes = new Map<string, string>();
  /** The text of notes, by lowercased path; a note without one is empty. */
  private readonly texts = new Map<string, string>();
  private readonly trash: TrashedNote[] = [];
  private deletedAtMs = 0;

  constructor(
    paths: {
      readonly folders?: readonly string[];
      readonly notes?: readonly string[];
      readonly texts?: Readonly<Record<string, string>>;
    } = {},
  ) {
    for (const folder of paths.folders ?? []) this.folders.set(keyOf(folder), folder);
    for (const note of paths.notes ?? []) this.notes.set(keyOf(note), note);
    for (const [path, text] of Object.entries(paths.texts ?? {})) {
      this.notes.set(keyOf(path), path);
      this.texts.set(keyOf(path), text);
    }
  }

  /** A stand-in for the SHA-256 the app uses: any change to the text changes it. */
  static contentHashOf(text: string): string {
    let hash = FNV_OFFSET_BASIS;
    for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
    return `${hash.toString(HEX_RADIX)}-${String(text.length)}`;
  }

  textOf(path: string): string | undefined {
    return this.notes.has(keyOf(path)) ? (this.texts.get(keyOf(path)) ?? '') : undefined;
  }

  readNote(path: string): Promise<string> {
    const text = this.textOf(path);
    return text === undefined
      ? Promise.reject(new DocumentOpenError('notFound', path))
      : Promise.resolve(text);
  }

  createNoteInFolder({ location, folder, name, text }: NoteInFolder): Promise<DocumentLocation> {
    return this.attempt(name, () => {
      const parts = folder.split('/').filter((part) => part !== '');
      if (parts.some((part) => part.startsWith('.') || part === '..')) refuse('invalidName');
      let current = location;
      for (const part of parts) {
        current = `${current}\\${part}`;
        this.folders.set(keyOf(current), current);
      }
      this.refuseTakenName(current, name);
      const path = `${current}\\${name}.md`;
      this.notes.set(keyOf(path), path);
      this.texts.set(keyOf(path), text);
      return locationOf(path);
    });
  }

  notePaths(): string[] {
    return [...this.notes.values()].sort();
  }

  folderPaths(): string[] {
    return [...this.folders.values()].sort();
  }

  listFolder(folderPath: string): Promise<FolderListing> {
    const inFolder = (path: string) => keyOf(parentOf(path)) === keyOf(folderPath);
    return Promise.resolve({
      folders: [...this.folders.values()].filter(inFolder).map(locationOf),
      documents: [...this.notes.values()].filter(inFolder).map(locationOf),
    });
  }

  findNotes(location: string): Promise<DocumentLocation[]> {
    return Promise.resolve(
      this.notePaths()
        .filter((path) => isInside(path, location))
        .map(locationOf),
    );
  }

  createNote({ location, parent, name }: NoteCreation): Promise<DocumentLocation> {
    return this.attempt(parent, () => {
      const folder = this.folderForChildren(location, parent);
      this.refuseTakenName(folder, name);
      this.folders.set(keyOf(folder), folder);
      const path = `${folder}\\${name}.md`;
      this.notes.set(keyOf(path), path);
      return locationOf(path);
    });
  }

  renameNote({ location, note, name }: NoteRename): Promise<DocumentLocation> {
    return this.attempt(note, () => {
      this.requireNote(location, note);
      const folder = parentOf(note);
      const existing = this.noteNamed(folder, name);
      if (existing !== undefined && keyOf(existing) !== keyOf(note)) refuse('nameTaken');
      const extension = NOTE_EXTENSION.exec(note)?.[0] ?? '.md';
      return this.moveWithChildren(note, `${folder}\\${name}${extension}`);
    });
  }

  moveNote({ location, note, into }: NoteMove): Promise<DocumentLocation> {
    return this.attempt(note, () => {
      this.requireNote(location, note);
      const folder = this.folderForChildren(location, into);
      if (isInside(folder, childrenFolderOf(note))) refuse('invalidRequest');
      this.refuseTakenName(folder, nameOf(note));
      this.folders.set(keyOf(folder), folder);
      return this.moveWithChildren(note, `${folder}\\${note.split('\\').at(-1) ?? note}`);
    });
  }

  deleteNote({ location, note }: NoteDeletion): Promise<NoteTrashEntry> {
    return this.attempt(note, () => {
      this.requireNote(location, note);
      const children = childrenFolderOf(note);
      const isMoved = (path: string) => keyOf(path) === keyOf(note) || isInside(path, children);
      const folders = [...this.folders.values()].filter(isMoved);
      const notes = [...this.notes.values()].filter(isMoved);
      for (const path of folders) this.folders.delete(keyOf(path));
      for (const path of notes) this.notes.delete(keyOf(path));
      this.deletedAtMs += 1;
      const entry: NoteTrashEntry = {
        id: `trash-${String(this.deletedAtMs)}`,
        name: nameOf(note),
        originalPath: note.slice(location.length + 1).replaceAll('\\', '/'),
        deletedAtMs: this.deletedAtMs,
        hasChildNotes: folders.length > 0,
      };
      this.trash.unshift({ entry, location, folders, notes });
      return entry;
    });
  }

  listTrash(location: string): Promise<NoteTrashEntry[]> {
    return Promise.resolve(
      this.trash.filter((trashed) => keyOf(trashed.location) === keyOf(location)).map(({ entry }) => entry),
    );
  }

  restoreNote({ location, entryId }: NoteRestore): Promise<DocumentLocation> {
    return this.attempt(entryId, () => {
      const index = this.trash.findIndex(({ entry }) => entry.id === entryId);
      const trashed = this.trash[index];
      if (!trashed || keyOf(trashed.location) !== keyOf(location)) refuse('notFound');
      this.trash.splice(index, 1);
      const original = `${location}\\${trashed.entry.originalPath.replaceAll('/', '\\')}`;
      const target = this.freePlaceFor(original);
      const [fromChildren, toChildren] = [childrenFolderOf(original), childrenFolderOf(target)];
      const placed = (path: string) =>
        isInside(path, fromChildren) ? toChildren + path.slice(fromChildren.length) : target;
      for (const path of trashed.folders) this.folders.set(keyOf(placed(path)), placed(path));
      for (const path of trashed.notes) this.notes.set(keyOf(placed(path)), placed(path));
      return locationOf(target);
    });
  }

  emptyTrash(location: string): Promise<number> {
    const kept = this.trash.filter((trashed) => keyOf(trashed.location) !== keyOf(location));
    const removed = this.trash.length - kept.length;
    this.trash.splice(0, this.trash.length, ...kept);
    return Promise.resolve(removed);
  }

  applyLinkUpdates({ location, updates }: LinkUpdatesToApply): Promise<AppliedLinkUpdates> {
    const notUpdated: NotUpdatedNote[] = [];
    const undo: NoteLinkEdits[] = [];
    let updatedLinks = 0;
    for (const note of updates) {
      const path = `${location}\\${note.path.replaceAll('/', '\\')}`;
      const text = this.textOf(path);
      const edited =
        text !== undefined && InMemoryNoteFiles.contentHashOf(text) === note.contentHash
          ? textWithEdits(text, note.edits)
          : undefined;
      if (!edited) {
        notUpdated.push({ path: note.path, reason: 'changedSincePlanned' });
        continue;
      }
      this.texts.set(keyOf(path), edited.text);
      updatedLinks += note.edits.length;
      undo.push({
        path: note.pathOnceUndone,
        pathOnceUndone: note.path,
        contentHash: InMemoryNoteFiles.contentHashOf(edited.text),
        edits: edited.undo,
      });
    }
    return Promise.resolve({ updatedNotes: undo.length, updatedLinks, notUpdated, undo });
  }

  private freePlaceFor(original: string): string {
    const folder = parentOf(original);
    const extension = NOTE_EXTENSION.exec(original)?.[0] ?? '.md';
    const name = nameOf(original);
    const candidates = [name, `${name} (restored)`];
    const free =
      candidates.find((candidate) => this.noteNamed(folder, candidate) === undefined) ??
      `${name} (restored 2)`;
    return `${folder}\\${free}${extension}`;
  }

  private attempt<Result>(path: string, work: () => Result): Promise<Result> {
    try {
      return Promise.resolve(work());
    } catch (error) {
      const failure = error instanceof DocumentOpenError ? error.failure : 'unreadable';
      return Promise.reject(new DocumentOpenError(failure, path));
    }
  }

  private folderForChildren(location: string, parent: string): string {
    if (!isInside(parent, location)) refuse('accessDenied');
    if (keyOf(parent) === keyOf(location) || this.folders.has(keyOf(parent))) return parent;
    if (!this.notes.has(keyOf(parent))) refuse('notFound');
    return childrenFolderOf(parent);
  }

  private requireNote(location: string, note: string): void {
    if (!isInside(note, location)) refuse('accessDenied');
    if (!this.notes.has(keyOf(note))) refuse('notFound');
  }

  private refuseTakenName(folder: string, name: string): void {
    if (this.noteNamed(folder, name) !== undefined) refuse('nameTaken');
  }

  private noteNamed(folder: string, name: string): string | undefined {
    return [...this.notes.values()].find(
      (path) => keyOf(parentOf(path)) === keyOf(folder) && nameOf(path).toLowerCase() === name.toLowerCase(),
    );
  }

  private moveWithChildren(note: string, target: string): DocumentLocation {
    const children = childrenFolderOf(note);
    const targetChildren = childrenFolderOf(target);
    this.notes.delete(keyOf(note));
    this.notes.set(keyOf(target), target);
    this.moveText(note, target);
    for (const map of [this.folders, this.notes]) {
      for (const path of [...map.values()].filter((path) => isInside(path, children))) {
        map.delete(keyOf(path));
        const moved = `${targetChildren}${path.slice(children.length)}`;
        map.set(keyOf(moved), moved);
        this.moveText(path, moved);
      }
    }
    return locationOf(target);
  }

  private moveText(from: string, to: string): void {
    const text = this.texts.get(keyOf(from));
    if (text === undefined) return;
    this.texts.delete(keyOf(from));
    this.texts.set(keyOf(to), text);
  }
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HEX_RADIX = 16;

/** The text with the edits made on its UTF-8 bytes, as the app makes them, and the edits undoing them. */
function textWithEdits(
  text: string,
  edits: readonly LinkEdit[],
): { readonly text: string; readonly undo: LinkEdit[] } | undefined {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const decoder = new TextDecoder();
  const parts: Uint8Array[] = [];
  const undo: LinkEdit[] = [];
  let copiedUpTo = 0;
  let editedLength = 0;
  for (const edit of edits) {
    if (edit.start < copiedUpTo || decoder.decode(bytes.slice(edit.start, edit.end)) !== edit.before)
      return undefined;
    const unchanged = bytes.slice(copiedUpTo, edit.start);
    const replacement = encoder.encode(edit.after);
    parts.push(unchanged, replacement);
    const start = editedLength + unchanged.length;
    editedLength = start + replacement.length;
    undo.push({ start, end: editedLength, before: edit.after, after: edit.before });
    copiedUpTo = edit.end;
  }
  parts.push(bytes.slice(copiedUpTo));
  return { text: decoder.decode(concatenated(parts)), undo };
}

function concatenated(parts: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

function refuse(failure: DocumentOpenFailure): never {
  throw new DocumentOpenError(failure, '');
}

function keyOf(path: string): string {
  return path.toLowerCase();
}

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf('\\'));
}

function nameOf(path: string): string {
  return (path.split('\\').at(-1) ?? path).replace(NOTE_EXTENSION, '');
}

function childrenFolderOf(note: string): string {
  return note.replace(NOTE_EXTENSION, '');
}

function isInside(path: string, folder: string): boolean {
  return keyOf(path) === keyOf(folder) || keyOf(path).startsWith(`${keyOf(folder)}\\`);
}

function locationOf(path: string): DocumentLocation {
  return InMemoryDocumentFiles.locationOf(path);
}
