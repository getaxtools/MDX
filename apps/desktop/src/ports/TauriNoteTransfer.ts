import { listen } from '@tauri-apps/api/event';
import type {
  ExportFolderChoice,
  NotesExportOutcome,
  NotesExportRequest,
  NotesImportProgress,
  NotesImportReport,
  NotesImportRequest,
  NoteTransferPort,
} from '@mdx/platform';
import { knownCodeLanguages } from '@mdx/renderer';
import { documentOpenErrorOf } from './documentOpenErrorOf';
import { NOTES_IMPORT_PROGRESS_EVENT, tauriCommands } from './tauriCommands';

export class TauriNoteTransfer implements NoteTransferPort {
  async pickImportFolder(): Promise<string | undefined> {
    return (await tauriCommands.pickNotesImportFolder()) ?? undefined;
  }

  async importFolder(
    request: NotesImportRequest,
    onProgress: (progress: NotesImportProgress) => void,
  ): Promise<NotesImportReport> {
    const stopListening = await listen<NotesImportProgress>(NOTES_IMPORT_PROGRESS_EVENT, (event) =>
      onProgress(event.payload),
    );
    try {
      return await tauriCommands.importNotesFolder({
        ...request,
        knownCodeLanguages: await knownCodeLanguages(),
      });
    } catch (error) {
      throw documentOpenErrorOf(error, request.source);
    } finally {
      stopListening();
    }
  }

  async cancelImport(): Promise<void> {
    await tauriCommands.cancelNotesImport();
  }

  pickExportFolder(location: string): Promise<ExportFolderChoice> {
    return tauriCommands.pickNotesExportFolder(location);
  }

  async exportNotes(request: NotesExportRequest): Promise<NotesExportOutcome> {
    try {
      return await tauriCommands.exportNotesToFolder(request);
    } catch (error) {
      throw documentOpenErrorOf(error, request.destination);
    }
  }
}
