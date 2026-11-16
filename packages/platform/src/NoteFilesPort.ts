import type { DocumentLocation } from './DocumentLocation';
import type { FolderListing } from './FolderPort';
import type { AppliedLinkUpdates, LinkUpdatesToApply } from './NoteLinkUpdates';

export interface NoteCreation {
  readonly location: string;
  /** The location, a folder in it, or a note to create the new note under as its child. */
  readonly parent: string;
  readonly name: string;
}

export interface NoteInFolder {
  readonly location: string;
  /** A folder inside the location, with `/` between its parts, made on first use; empty for the location. */
  readonly folder: string;
  readonly name: string;
  readonly text: string;
}

export interface NoteRename {
  readonly location: string;
  readonly note: string;
  readonly name: string;
}

export interface NoteMove {
  readonly location: string;
  readonly note: string;
  /** A folder of the location, or a note to move the note under. */
  readonly into: string;
}

export interface NoteDeletion {
  readonly location: string;
  readonly note: string;
}

export interface NoteRestore {
  readonly location: string;
  readonly entryId: string;
}

/** A deleted note in the location's trash. */
export interface NoteTrashEntry {
  readonly id: string;
  readonly name: string;
  /** Where the note was, inside the location, with forward slashes. */
  readonly originalPath: string;
  readonly deletedAtMs: number;
  readonly hasChildNotes: boolean;
}

/**
 * The notes of a Notes location. Every path must be inside the location; a refusal comes as a
 * `DocumentOpenError`, `nameTaken` for a name another note in the folder has.
 */
export interface NoteFilesPort {
  listFolder(folderPath: string): Promise<FolderListing>;
  /** Every note in the location and its folders, for resolving wiki-links. */
  findNotes(location: string): Promise<DocumentLocation[]>;
  createNote(creation: NoteCreation): Promise<DocumentLocation>;
  /** Makes a note with its first text, such as today's note from the daily template. */
  createNoteInFolder(note: NoteInFolder): Promise<DocumentLocation>;
  /** The text of a note, such as a template. */
  readNote(path: string): Promise<string>;
  /** Renames the note and the folder of its child notes. */
  renameNote(rename: NoteRename): Promise<DocumentLocation>;
  /** Moves the note and its child notes. */
  moveNote(move: NoteMove): Promise<DocumentLocation>;
  /** Moves the note and its child notes into the location's trash. */
  deleteNote(deletion: NoteDeletion): Promise<NoteTrashEntry>;
  /** Most recently deleted first. */
  listTrash(location: string): Promise<NoteTrashEntry[]>;
  /** Puts the note back where it was, as "Name (restored)" when that name is taken. */
  restoreNote(restore: NoteRestore): Promise<DocumentLocation>;
  /** Removes the trash entries for good; resolves with how many there were. */
  emptyTrash(location: string): Promise<number>;
  /**
   * Changes only the planned link targets of each note; a note changed since the plan is left as it
   * is and reported. Resolves with the edits that undo the change.
   */
  applyLinkUpdates(updates: LinkUpdatesToApply): Promise<AppliedLinkUpdates>;
}
