import type {
  AppliedLinkUpdates,
  DocumentLocation,
  FolderListing,
  LinkUpdatesToApply,
  NoteCreation,
  NoteDeletion,
  NoteFilesPort,
  NoteInFolder,
  NoteMove,
  NoteRename,
  NoteRestore,
  NoteTrashEntry,
} from '@mdx/platform';
import { documentOpenErrorOf } from './documentOpenErrorOf';
import { tauriCommands } from './tauriCommands';

export class TauriNoteFiles implements NoteFilesPort {
  listFolder(folderPath: string): Promise<FolderListing> {
    return tauriCommands.listFolderContents(folderPath);
  }

  findNotes(location: string): Promise<DocumentLocation[]> {
    return tauriCommands.findFolderDocuments([location]);
  }

  async createNote(creation: NoteCreation): Promise<DocumentLocation> {
    try {
      return await tauriCommands.createNote(creation);
    } catch (error) {
      throw documentOpenErrorOf(error, creation.name);
    }
  }

  async createNoteInFolder(note: NoteInFolder): Promise<DocumentLocation> {
    try {
      return await tauriCommands.createNoteInFolder(note);
    } catch (error) {
      throw documentOpenErrorOf(error, note.name);
    }
  }

  async readNote(path: string): Promise<string> {
    try {
      return (await tauriCommands.openDocument(path)).text;
    } catch (error) {
      throw documentOpenErrorOf(error, path);
    }
  }

  async renameNote(rename: NoteRename): Promise<DocumentLocation> {
    try {
      return await tauriCommands.renameNote(rename);
    } catch (error) {
      throw documentOpenErrorOf(error, rename.note);
    }
  }

  async moveNote(move: NoteMove): Promise<DocumentLocation> {
    try {
      return await tauriCommands.moveNote(move);
    } catch (error) {
      throw documentOpenErrorOf(error, move.note);
    }
  }

  async deleteNote(deletion: NoteDeletion): Promise<NoteTrashEntry> {
    try {
      return await tauriCommands.deleteNote(deletion);
    } catch (error) {
      throw documentOpenErrorOf(error, deletion.note);
    }
  }

  listTrash(location: string): Promise<NoteTrashEntry[]> {
    return tauriCommands.listNoteTrash(location);
  }

  async restoreNote(restore: NoteRestore): Promise<DocumentLocation> {
    try {
      return await tauriCommands.restoreNote(restore);
    } catch (error) {
      throw documentOpenErrorOf(error, restore.entryId);
    }
  }

  emptyTrash(location: string): Promise<number> {
    return tauriCommands.emptyNoteTrash(location);
  }

  async applyLinkUpdates(updates: LinkUpdatesToApply): Promise<AppliedLinkUpdates> {
    try {
      return await tauriCommands.applyNoteLinkUpdates(updates);
    } catch (error) {
      throw documentOpenErrorOf(error, updates.location);
    }
  }
}
