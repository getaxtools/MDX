import type { DocumentLocation } from './DocumentLocation';

/** Which Notes workspace moves its folder where. */
export interface NotesMoveRequest {
  readonly workspaceId: string;
  readonly locationId: string;
  readonly source: string;
  readonly target: string;
}

/** What a move will copy, shown before it starts. */
export interface NotesMovePlan {
  readonly fileCount: number;
  readonly totalBytes: number;
  /** Files kept online only by OneDrive, which are downloaded to be copied. */
  readonly onlineOnlyCount: number;
  readonly onlineOnlyBytes: number;
  readonly availableBytes: number;
}

/** Paths are relative to the notes folder; `count` says how many there are when only some are listed. */
export type NotesMoveProblem =
  | { readonly code: 'targetNotEmpty' }
  | { readonly code: 'targetInsideLocation' }
  | { readonly code: 'targetContainsLocation' }
  | { readonly code: 'targetRefused' }
  | { readonly code: 'notEnoughSpace'; readonly requiredBytes: number; readonly availableBytes: number }
  | { readonly code: 'linksInside'; readonly paths: readonly string[]; readonly count: number }
  | { readonly code: 'pathsTooLong'; readonly paths: readonly string[]; readonly count: number }
  | { readonly code: 'sourceUnreadable'; readonly path: string }
  | { readonly code: 'targetUnwritable'; readonly path: string }
  | { readonly code: 'diskFull'; readonly path: string }
  | { readonly code: 'fileLocked'; readonly path: string }
  | { readonly code: 'hashMismatch'; readonly path: string }
  | { readonly code: 'countMismatch'; readonly expected: number; readonly found: number }
  | { readonly code: 'targetChanged'; readonly path: string }
  | { readonly code: 'keepsChanging' }
  | { readonly code: 'stopped' }
  | { readonly code: 'wrongState' }
  | { readonly code: 'moveUnderway' }
  | { readonly code: 'noMove' }
  | { readonly code: 'oldCopyInUse' }
  | { readonly code: 'accessDenied' }
  | { readonly code: 'invalidRequest' }
  | { readonly code: 'journalUnavailable' };

export type NotesMoveProblemCode = NotesMoveProblem['code'];

/** A move that did not start or stopped; the workspace still uses its old folder, unchanged. */
export class NotesMoveError extends Error {
  constructor(readonly problem: NotesMoveProblem) {
    super(problem.code);
    this.name = 'NotesMoveError';
  }
}

export interface NotesMoveProgress {
  readonly locationId: string;
  readonly phase: 'copying' | 'verifying';
  readonly doneFiles: number;
  readonly totalFiles: number;
}

/** Files left where they were, named relative to their folder. */
export interface KeptFiles {
  readonly paths: readonly string[];
  readonly count: number;
}

/** The old folder after a switch, offered for removal. */
export interface OldNotesCopy {
  readonly locationId: string;
  readonly path: string;
  readonly fileCount: number;
  readonly totalBytes: number;
}

export type NotesMoveState = 'planned' | 'copying' | 'verified' | 'switched';

/** A move found at start that the app did not finish. */
export interface UnfinishedNotesMove extends OldNotesCopy {
  readonly workspaceId: string;
  readonly target: string;
  readonly state: NotesMoveState;
  readonly failure?: NotesMoveProblem;
}

export interface OldCopyRemoval {
  readonly recycledCount: number;
  readonly kept: KeptFiles;
  /** The old folder is on a drive without a Recycle Bin, so all of it was kept. */
  readonly hasNoRecycleBin: boolean;
}

/**
 * Moves a Notes folder: plan, copy and verify, switch, then keep or remove the old copy. Every
 * method that can fail rejects with `NotesMoveError`; nothing in the old folder changes before
 * the user confirms its removal twice.
 */
export interface NotesMovePort {
  planMove(request: NotesMoveRequest): Promise<NotesMovePlan>;
  /** Copies and verifies, or resumes, the planned move; resolves once every copy is verified. */
  runMove(locationId: string): Promise<void>;
  /** Asks the running move to stop; `runMove` then rejects with `stopped`. */
  stopMove(): Promise<void>;
  /** Removes only what the move made in the new folder. */
  cancelMove(locationId: string): Promise<KeptFiles>;
  /** The new folder, readable by the window, once the move is verified. */
  switchMove(locationId: string): Promise<DocumentLocation>;
  /** Records that the workspace now uses the new folder. */
  finishSwitch(locationId: string): Promise<OldNotesCopy>;
  unfinishedMoves(): Promise<readonly UnfinishedNotesMove[]>;
  keepOldCopy(locationId: string): Promise<void>;
  removeOldCopy(locationId: string): Promise<OldCopyRemoval>;
  onProgress(listener: (progress: NotesMoveProgress) => void): () => void;
}
