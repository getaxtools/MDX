import type {
  ExportFolderChoice,
  NotesExportOutcome,
  NotesExportRequest,
  NotesImportProgress,
  NotesImportReport,
  NotesImportRequest,
  NoteTransferPort,
} from '../NoteTransferPort';

export const EMPTY_IMPORT_REPORT: NotesImportReport = {
  copiedFiles: 0,
  renamedFiles: [],
  renamedNotListed: 0,
  unsupportedSyntax: [],
  unsupportedNotListed: 0,
  skippedEntries: 0,
  failedFiles: [],
  unreadableFolders: [],
  wasCancelled: false,
};

/** Records the imports and exports asked for and answers with what a test sets up. */
export class InMemoryNoteTransfer implements NoteTransferPort {
  pickedImportFolder: string | undefined;
  exportFolderChoice: ExportFolderChoice = { choice: 'cancelled' };
  importReport: NotesImportReport = EMPTY_IMPORT_REPORT;
  importProgress: readonly NotesImportProgress[] = [];
  /** Files already in the destination; an export without replacing is then refused with their count. */
  existingFileCount = 0;
  readonly imports: NotesImportRequest[] = [];
  readonly exports: NotesExportRequest[] = [];
  cancelCount = 0;
  /** Set to make the next import fail, as the app does for a folder that holds the notes folder. */
  importFailure: Error | undefined;
  private finishImport: (() => void) | undefined;
  /** While true, an import waits until `finishPendingImport` is called. */
  isImportHeld = false;

  pickImportFolder(): Promise<string | undefined> {
    return Promise.resolve(this.pickedImportFolder);
  }

  async importFolder(
    request: NotesImportRequest,
    onProgress: (progress: NotesImportProgress) => void,
  ): Promise<NotesImportReport> {
    this.imports.push(request);
    if (this.importFailure) throw this.importFailure;
    for (const progress of this.importProgress) onProgress(progress);
    if (this.isImportHeld) await new Promise<void>((resolve) => (this.finishImport = resolve));
    return this.importReport;
  }

  finishPendingImport(): void {
    this.finishImport?.();
    this.finishImport = undefined;
  }

  cancelImport(): Promise<void> {
    this.cancelCount += 1;
    this.importReport = { ...this.importReport, wasCancelled: true };
    this.finishPendingImport();
    return Promise.resolve();
  }

  pickExportFolder(): Promise<ExportFolderChoice> {
    return Promise.resolve(this.exportFolderChoice);
  }

  exportNotes(request: NotesExportRequest): Promise<NotesExportOutcome> {
    this.exports.push(request);
    if (this.existingFileCount > 0 && !request.replaceExisting)
      return Promise.resolve({ outcome: 'existingFiles', count: this.existingFileCount });
    return Promise.resolve({
      outcome: 'exported',
      exportedFiles: 1,
      folder: request.destination,
      attachmentsLeftOut: 0,
      excludedLeftOut: 0,
      failedFiles: [],
    });
  }
}
