import type { LineEnding } from './DocumentFilePort';

/** Why a protected section operation failed; never more than a code. */
export const PROTECTED_NOTES_FAILURES = [
  'wrongPassword',
  'unlockFailed',
  'notEnoughMemory',
  'tampered',
  'vaultMissing',
  'locked',
  'notSetUp',
  'alreadySetUp',
  'notRemembered',
  'passwordTooShort',
  'unsupportedVersion',
  'tooLarge',
  'unavailable',
  'notFound',
  'invalidRequest',
  'accessDenied',
  'reencryptionPending',
] as const;

export type ProtectedNotesFailure = (typeof PROTECTED_NOTES_FAILURES)[number];

export function isProtectedNotesFailure(code: unknown): code is ProtectedNotesFailure {
  return typeof code === 'string' && (PROTECTED_NOTES_FAILURES as readonly string[]).includes(code);
}

export class ProtectedNotesError extends Error {
  constructor(readonly failure: ProtectedNotesFailure) {
    super(`The protected notes operation failed: ${failure}`);
    this.name = 'ProtectedNotesError';
  }
}

export interface ProtectedStatus {
  readonly isSetUp: boolean;
  readonly isUnlocked: boolean;
  /** The section has a slot for this PC; whether its key is still stored shows on unlock. */
  readonly canUnlockOnThisPc: boolean;
  /** A re-encryption is not finished; once unlocked, `continueReencryption` carries it on. */
  readonly isReencrypting: boolean;
}

export interface PasswordChange {
  readonly currentPassword: string;
  readonly newPassword: string;
  /**
   * Seals every note again with a new key, for when the old password may be known: the old
   * password and recovery key then open nothing, and a new recovery key is given once.
   */
  readonly shouldReencrypt: boolean;
}

export interface PasswordChangeResult {
  /** With a re-encryption, the new recovery key to show once. */
  readonly recoveryKey?: string;
}

export interface ReencryptionProgress {
  /** Files still to seal again; none once the re-encryption is over. */
  readonly remaining: number;
  /** Files that were damaged already and are left as they were. */
  readonly damaged: number;
}

export type ProtectedNoteState = 'current' | 'olderCopy' | 'newerThanManifest' | 'unlisted' | 'missing';

export interface ProtectedNoteSummary {
  /** 32 hexadecimal characters. */
  readonly noteId: string;
  readonly title: string;
  /** The folder inside the section, with `/` between parts; empty at its top. */
  readonly folder: string;
  readonly kind: 'note' | 'attachment' | 'draft' | 'manifest';
  readonly modifiedMs: number;
  readonly state: ProtectedNoteState;
}

export interface ProtectedNoteText {
  readonly text: string;
  readonly encoding: string;
  readonly hasByteOrderMark: boolean;
  readonly hasDecodingErrors: boolean;
  readonly lineEnding: LineEnding;
  readonly revision: number;
  /** An older copy replaced the note's file, as a sync tool restoring an old version would. */
  readonly isOlderCopy: boolean;
}

export interface ProtectedNoteEdit {
  readonly noteId: string;
  readonly text: string;
  readonly encoding: string;
  readonly hasByteOrderMark: boolean;
}

/**
 * `olderNotes`: the section's manifest is older than this PC last saw, as when an older copy of the
 * folder was put back. `changedVault`: its password or unlock methods were changed on another PC or
 * restored from a backup, which can bring back an old password. `checkUnavailable`: what this PC saw
 * before could not be read. The user may keep the folder as it is with `acceptFolder`, or lock.
 */
export type ProtectedFolderWarning = 'olderNotes' | 'changedVault' | 'checkUnavailable';

export interface UnlockResult {
  readonly folderWarning?: ProtectedFolderWarning;
}

export interface NewProtectedNote {
  readonly title: string;
  readonly folder: string;
}

export type ProtectedNotesLockedListener = (locationKeys: readonly string[]) => void;

/**
 * Saves this window's unsaved edits of the notes of these sections, by their notes locations'
 * canonical keys, before they lock; resolves to whether everything was saved.
 */
export type ProtectedNotesLockRequestListener = (locationKeys: readonly string[]) => Promise<boolean>;

/**
 * The protected section of a Notes workspace, by its notes location. Keys stay in the app's native
 * layer: the window sends a password only to set up or unlock, gets the recovery key once at set-up,
 * and never receives a key.
 */
export interface ProtectedNotesPort {
  status(location: string): Promise<ProtectedStatus>;
  /** Sets up a section with a password of at least 10 characters; resolves to the recovery key to show once. */
  setUp(location: string, password: string): Promise<{ readonly recoveryKey: string }>;
  unlock(location: string, password: string, shouldRemember: boolean): Promise<UnlockResult>;
  /** Unlocks with the recovery key and replaces the password with a new one. */
  unlockWithRecoveryKey(
    location: string,
    recovery: { readonly recoveryKey: string; readonly newPassword: string },
  ): Promise<UnlockResult>;
  unlockOnThisPc(location: string): Promise<UnlockResult>;
  /**
   * Changes the password after the current one is confirmed; other PCs need the new one. With
   * `shouldReencrypt`, call `continueReencryption` until nothing remains.
   */
  changePassword(location: string, change: PasswordChange): Promise<PasswordChangeResult>;
  /** Seals the next few files again; resolves to how many remain. Resumes after a restart once unlocked. */
  continueReencryption(location: string): Promise<ReencryptionProgress>;
  /** A new recovery key in place of the old one, after the password is confirmed; resolves to it, to show once. */
  newRecoveryKey(location: string, password: string): Promise<{ readonly recoveryKey: string }>;
  /** Keeps the folder as it is after a folder warning; this PC remembers it as seen. */
  acceptFolder(location: string): Promise<void>;
  forgetThisPc(location: string): Promise<void>;
  /**
   * Asks every window to save its unsaved edits of the section's notes, waiting a few seconds at most,
   * before the user locks it; resolves to whether all of them were saved.
   */
  saveBeforeLock(location: string): Promise<boolean>;
  lock(location: string): Promise<void>;
  /** Locks every section once every window has saved what it could, as on sleep or quit. */
  lockAll(): Promise<void>;
  list(location: string): Promise<ProtectedNoteSummary[]>;
  /** Resolves to the new note's id. */
  create(location: string, note: NewProtectedNote): Promise<string>;
  open(location: string, noteId: string): Promise<ProtectedNoteText>;
  /** Resolves to the note's new revision. */
  save(location: string, edit: ProtectedNoteEdit): Promise<number>;
  /**
   * Tells the listener which sections locked, in any window, by their notes locations' canonical keys,
   * so every window closes their notes; returns how to stop listening.
   */
  onLocked(listener: ProtectedNotesLockedListener): () => void;
  /** Hears that sections are about to lock, so this window saves its edits of them first; returns how to stop. */
  onLockRequested(listener: ProtectedNotesLockRequestListener): () => void;
}
