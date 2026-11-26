/** A vault-style folder to copy into a Notes location. */
export interface NotesImportRequest {
  readonly location: string;
  /** A folder the user picked. */
  readonly source: string;
  /** The location's excluded paths; files landing under one are copied without being read. */
  readonly excludedPaths: readonly string[];
}

export interface NotesImportProgress {
  readonly done: number;
  readonly total: number;
  /** Files are still being found; `total` is how many so far. */
  readonly isListing: boolean;
}

export type UnsupportedSyntaxKind = 'blockReference' | 'unknownCodeBlock' | 'embed';

export interface RenamedImportFile {
  /** Paths inside the location, with `/` between the parts. */
  readonly wanted: string;
  readonly savedAs: string;
}

export interface ReportedSyntax {
  /** The imported note, as a path inside the location. */
  readonly note: string;
  readonly kind: UnsupportedSyntaxKind;
  /** One-based. */
  readonly line: number;
  /** The link or code block language as written, shortened. */
  readonly detail: string;
}

/** What an import copied, saved under a new name and could not carry over. */
export interface NotesImportReport {
  readonly copiedFiles: number;
  readonly renamedFiles: readonly RenamedImportFile[];
  readonly renamedNotListed: number;
  readonly unsupportedSyntax: readonly ReportedSyntax[];
  readonly unsupportedNotListed: number;
  /** Dot entries, hidden entries and links in the source, which are never copied. */
  readonly skippedEntries: number;
  readonly failedFiles: readonly string[];
  /** Folders in the source that could not be listed, so nothing in them was copied. */
  readonly unreadableFolders: readonly string[];
  readonly wasCancelled: boolean;
}

/** One note with its child notes, a folder of the location, or the whole location. */
export type ExportedNotes =
  | { readonly kind: 'note'; readonly path: string }
  | { readonly kind: 'folder'; readonly path: string }
  | { readonly kind: 'location' };

export interface NotesExportRequest {
  readonly location: string;
  readonly notes: ExportedNotes;
  /** A folder chosen through `pickExportFolder`. */
  readonly destination: string;
  /** Turn wiki-links into relative Markdown links; otherwise every file keeps its bytes. */
  readonly useRelativeLinks: boolean;
  /** The user agreed to replace files already in the destination. */
  readonly replaceExisting: boolean;
  readonly excludedPaths: readonly string[];
}

export interface NotesExportSummary {
  readonly exportedFiles: number;
  /** The folder the files went into. */
  readonly folder: string;
  /** Files a single note shows from outside its folder, which are not copied. */
  readonly attachmentsLeftOut: number;
  /** Files under an excluded path, which export never reads. */
  readonly excludedLeftOut: number;
  readonly failedFiles: readonly string[];
}

export type NotesExportOutcome =
  | ({ readonly outcome: 'exported' } & NotesExportSummary)
  /** Nothing was written: this many files are already in the destination. */
  | { readonly outcome: 'existingFiles'; readonly count: number };

export type ExportFolderChoice =
  | { readonly choice: 'picked'; readonly path: string }
  /** The folder is the location or inside it. */
  | { readonly choice: 'insideLocation' }
  | { readonly choice: 'cancelled' };

/** Copies notes into a Notes location from another folder, and out of it to another folder. */
export interface NoteTransferPort {
  /** The folder to import from, readable for this import only; undefined when the user cancels. */
  pickImportFolder(): Promise<string | undefined>;
  /** Runs off the window's thread; progress arrives as files are copied. */
  importFolder(
    request: NotesImportRequest,
    onProgress: (progress: NotesImportProgress) => void,
  ): Promise<NotesImportReport>;
  /** Stops the running import before its next file; what was copied stays. */
  cancelImport(): Promise<void>;
  pickExportFolder(location: string): Promise<ExportFolderChoice>;
  exportNotes(request: NotesExportRequest): Promise<NotesExportOutcome>;
}
