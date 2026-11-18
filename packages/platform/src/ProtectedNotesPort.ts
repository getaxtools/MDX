import type { LineEnding } from './DocumentFilePort';

/** Why a protected section operation failed; never more than a code. */
export const PROTECTED_NOTES_FAILURES = [
  'wrongPassword',
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

export interface NewProtectedNote {
  readonly title: string;
  readonly folder: string;
}

export type ProtectedNotesLockedListener = (locationKeys: readonly string[]) => void;

/**
 * The protected section of a Notes workspace, by its notes location. Keys stay in the app's native
 * layer: the window sends a password only to set up or unlock, gets the recovery key once at set-up,
 * and never receives a key.
 */
export interface ProtectedNotesPort {
  status(location: string): Promise<ProtectedStatus>;
  /** Sets up a section with a password of at least 10 characters; resolves to the recovery key to show once. */
  setUp(location: string, password: string): Promise<{ readonly recoveryKey: string }>;
  unlock(location: string, password: string, shouldRemember: boolean): Promise<void>;
  /** Unlocks with the recovery key and replaces the password with a new one. */
  unlockWithRecoveryKey(
    location: string,
    recovery: { readonly recoveryKey: string; readonly newPassword: string },
  ): Promise<void>;
  unlockOnThisPc(location: string): Promise<void>;
  forgetThisPc(location: string): Promise<void>;
  lock(location: string): Promise<void>;
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
}
