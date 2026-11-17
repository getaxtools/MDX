import { listen } from '@tauri-apps/api/event';
import {
  NotesMoveError,
  type DocumentLocation,
  type KeptFiles,
  type NotesMovePlan,
  type NotesMovePort,
  type NotesMoveProblem,
  type NotesMoveProgress,
  type NotesMoveRequest,
  type OldCopyRemoval,
  type OldNotesCopy,
  type UnfinishedNotesMove,
} from '@mdx/platform';
import { NOTES_MOVE_PROGRESS_EVENT, tauriCommands } from './tauriCommands';

export class TauriNotesMoves implements NotesMovePort {
  planMove(request: NotesMoveRequest): Promise<NotesMovePlan> {
    return refusedAsMoveError(tauriCommands.planNotesMove(request));
  }

  async runMove(locationId: string): Promise<void> {
    await refusedAsMoveError(tauriCommands.runNotesMove(locationId));
  }

  async stopMove(): Promise<void> {
    await tauriCommands.stopNotesMove();
  }

  cancelMove(locationId: string): Promise<KeptFiles> {
    return refusedAsMoveError(tauriCommands.cancelNotesMove(locationId));
  }

  switchMove(locationId: string): Promise<DocumentLocation> {
    return refusedAsMoveError(tauriCommands.switchNotesMove(locationId));
  }

  finishSwitch(locationId: string): Promise<OldNotesCopy> {
    return refusedAsMoveError(tauriCommands.finishNotesMoveSwitch(locationId));
  }

  unfinishedMoves(): Promise<readonly UnfinishedNotesMove[]> {
    return tauriCommands.unfinishedNotesMoves();
  }

  async keepOldCopy(locationId: string): Promise<void> {
    await refusedAsMoveError(tauriCommands.keepOldNotesCopy(locationId));
  }

  removeOldCopy(locationId: string): Promise<OldCopyRemoval> {
    return refusedAsMoveError(tauriCommands.removeOldNotesCopy(locationId));
  }

  async clearMoves(): Promise<void> {
    await refusedAsMoveError(tauriCommands.clearNotesMoves());
  }

  onProgress(listener: (progress: NotesMoveProgress) => void): () => void {
    const stopListening = listen<NotesMoveProgress>(NOTES_MOVE_PROGRESS_EVENT, (event) =>
      listener(event.payload),
    );
    return () => void stopListening.then((unlisten) => unlisten());
  }
}

async function refusedAsMoveError<Reply>(reply: Promise<Reply>): Promise<Reply> {
  try {
    return await reply;
  } catch (error) {
    throw new NotesMoveError(moveProblemOf(error));
  }
}

/** The backend sends a tagged problem; anything else is reported as an unreadable journal. */
function moveProblemOf(error: unknown): NotesMoveProblem {
  const isTagged =
    typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string';
  return isTagged ? (error as NotesMoveProblem) : { code: 'journalUnavailable' };
}
