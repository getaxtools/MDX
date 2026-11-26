import type { DocumentLocation } from './DocumentLocation';

/** Where Notes folders go by default, and which folders a sync program backs up. */
export interface KnownFolders {
  /** The Documents folder, following a redirected or OneDrive-backed one; undefined when it cannot be found. */
  readonly documents: string | undefined;
  /** OneDrive sync roots; a Notes folder inside one gets a notice. */
  readonly syncedFolders: readonly string[];
}

export interface PreparedNotesLocation {
  readonly location: DocumentLocation;
  readonly locationId: string;
  /** The folder already was a Notes location, so it keeps its own id. */
  readonly isExisting: boolean;
}

/**
 * What a folder holds before it becomes a Notes location: `empty` (missing, or only dot entries),
 * `existingFiles` (the user's files, which stay as they are), `notesLocation` (already one), or
 * `refused` (a drive root or the user folder).
 */
export type NotesFolderInspection = 'empty' | 'existingFiles' | 'notesLocation' | 'refused';

export interface NotesLocationPort {
  knownFolders(): Promise<KnownFolders>;
  /** Looks into a folder the user picked, or the default place, without changing anything. */
  inspectFolder(path: string): Promise<NotesFolderInspection>;
  /**
   * Marks the folder as a Notes location and lets the window read it. A new folder is made only at the
   * default place in Documents; any other folder must have been picked by the user.
   */
  prepareLocation(path: string, locationId: string): Promise<PreparedNotesLocation>;
  /** Whether the folder is there and still marked with this location id; a missing folder is never made. */
  checkLocation(path: string, locationId: string): Promise<LocationAvailability>;
  /** A picked folder that is the same location moved; undefined when its marker has another id. */
  locateLocation(path: string, locationId: string): Promise<DocumentLocation | undefined>;
}

export type LocationAvailability = 'available' | 'notAvailable';
