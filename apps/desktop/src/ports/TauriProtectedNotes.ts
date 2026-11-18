import {
  isProtectedNotesFailure,
  ProtectedNotesError,
  type NewProtectedNote,
  type PasswordChange,
  type PasswordChangeResult,
  type ReencryptionProgress,
  type ProtectedNoteEdit,
  type ProtectedNoteSummary,
  type ProtectedNoteText,
  type ProtectedNotesLockedListener,
  type ProtectedNotesLockRequestListener,
  type ProtectedNotesPort,
  type ProtectedStatus,
  type UnlockResult,
} from '@mdx/platform';
import { invoke } from '@tauri-apps/api/core';
import { listenInThisWindow } from './windowEvents';

export const PROTECTED_NOTES_LOCKED_EVENT = 'protected-notes-locked';
export const PROTECTED_NOTES_LOCK_REQUESTED_EVENT = 'protected-notes-lock-requested';

interface LockRequest {
  readonly requestId: number;
  readonly locationKeys: string[];
}

/** A code from the native layer, or `unavailable` for anything else; never more than the code. */
function protectedNotesErrorOf(error: unknown): ProtectedNotesError {
  const code: unknown =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return new ProtectedNotesError(isProtectedNotesFailure(code) ? code : 'unavailable');
}

async function call<Result>(command: string, args: Record<string, unknown>): Promise<Result> {
  try {
    return await invoke<Result>(command, args);
  } catch (error) {
    throw protectedNotesErrorOf(error);
  }
}

/** The protected section through its native commands; passwords go one way, keys never come back. */
export class TauriProtectedNotes implements ProtectedNotesPort {
  status(location: string): Promise<ProtectedStatus> {
    return call('protected_status', { location });
  }

  setUp(location: string, password: string): Promise<{ readonly recoveryKey: string }> {
    return call('protected_set_up', { location, password });
  }

  unlock(location: string, password: string, shouldRemember: boolean): Promise<UnlockResult> {
    return call('protected_unlock', { location, password, remember: shouldRemember });
  }

  unlockWithRecoveryKey(
    location: string,
    recovery: { readonly recoveryKey: string; readonly newPassword: string },
  ): Promise<UnlockResult> {
    return call('protected_unlock_with_recovery', { location, recovery });
  }

  changePassword(
    location: string,
    { currentPassword, newPassword, shouldReencrypt }: PasswordChange,
  ): Promise<PasswordChangeResult> {
    return call('protected_change_password', {
      location,
      change: { currentPassword, newPassword, reencrypt: shouldReencrypt },
    });
  }

  continueReencryption(location: string): Promise<ReencryptionProgress> {
    return call('protected_continue_reencryption', { location });
  }

  finishReencryption(location: string, password: string, discardCount?: number): Promise<void> {
    return call('protected_finish_reencryption', { location, password, discardCount: discardCount ?? null });
  }

  newRecoveryKey(location: string, password: string): Promise<{ readonly recoveryKey: string }> {
    return call('protected_new_recovery_key', { location, password });
  }

  unlockOnThisPc(location: string): Promise<UnlockResult> {
    return call('protected_unlock_on_this_pc', { location });
  }

  acceptFolder(location: string): Promise<void> {
    return call('protected_accept_folder', { location });
  }

  forgetThisPc(location: string): Promise<void> {
    return call('protected_forget_this_pc', { location });
  }

  lock(location: string): Promise<void> {
    return call('protected_lock', { location });
  }

  lockAll(): Promise<void> {
    return call('protected_lock_all', {});
  }

  list(location: string): Promise<ProtectedNoteSummary[]> {
    return call('protected_list', { location });
  }

  create(location: string, note: NewProtectedNote): Promise<string> {
    return call('protected_create', { location, note });
  }

  open(location: string, noteId: string): Promise<ProtectedNoteText> {
    return call('protected_open', { location, noteId });
  }

  save(location: string, edit: ProtectedNoteEdit): Promise<number> {
    return call('protected_save', { location, note: edit });
  }

  async saveBeforeLock(location: string): Promise<boolean> {
    const { isEverythingSaved } = await call<{ readonly isEverythingSaved: boolean }>(
      'protected_save_before_lock',
      { location },
    );
    return isEverythingSaved;
  }

  onLocked(listener: ProtectedNotesLockedListener): () => void {
    return listenInThisWindow<{ readonly locationKeys: string[] }>(PROTECTED_NOTES_LOCKED_EVENT, (event) =>
      listener(event.payload.locationKeys),
    );
  }

  /** Answers every lock request, saved or not, so the lock waits no longer than it must. */
  onLockRequested(listener: ProtectedNotesLockRequestListener): () => void {
    return listenInThisWindow<LockRequest>(PROTECTED_NOTES_LOCK_REQUESTED_EVENT, (event) => {
      const { requestId, locationKeys } = event.payload;
      void listener(locationKeys)
        .catch(() => false)
        .then((isEverythingSaved) =>
          invoke('protected_answer_lock_request', { answer: { requestId, isEverythingSaved } }),
        );
    });
  }
}
