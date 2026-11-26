/** A note renamed or moved, by its paths inside the location with forward slashes. */
export interface NoteMoveInLocation {
  readonly from: string;
  readonly to: string;
}

/** Bytes `start` to `end` of a note, which hold `before`, become `after`. */
export interface LinkEdit {
  readonly start: number;
  readonly end: number;
  readonly before: string;
  readonly after: string;
}

/** The link edits for one note, planned on the bytes whose SHA-256 is `contentHash`. */
export interface NoteLinkEdits {
  /** Where the note is now, inside the location. */
  readonly path: string;
  /** Where the note is once the rename is undone; the same path unless the note moved with it. */
  readonly pathOnceUndone: string;
  readonly contentHash: string;
  readonly edits: readonly LinkEdit[];
}

/** A line of a note before and after its links change, for the preview. */
export interface ChangedLine {
  readonly lineNumber: number;
  readonly before: string;
  readonly after: string;
}

export interface NoteLinkUpdates extends NoteLinkEdits {
  readonly lines: readonly ChangedLine[];
}

export type NotUpdatedReason =
  | 'encoding'
  /** A reference-style link, a target written with escapes or entities, or one far too long. */
  | 'notChangeableInPlace'
  /** From that note, every target that could be written means another note of the same name. */
  | 'noUniqueTarget'
  | 'tooManyLinks'
  | 'changedSincePlanned'
  | 'unavailable';

export interface NotUpdatedNote {
  readonly path: string;
  readonly reason: NotUpdatedReason;
}

/**
 * The link targets a rename or move would change in each note that still names the old place. A note
 * may be in both lists when some of its links change and others cannot.
 */
export interface LinkUpdatePlan {
  readonly notes: readonly NoteLinkUpdates[];
  readonly notUpdated: readonly NotUpdatedNote[];
}

export interface LinkUpdatesToApply {
  readonly location: string;
  readonly updates: readonly NoteLinkEdits[];
}

/** What applying link edits did, with the edits that put every changed note back. */
export interface AppliedLinkUpdates {
  readonly updatedNotes: number;
  readonly updatedLinks: number;
  readonly notUpdated: readonly NotUpdatedNote[];
  /** For each changed note, at the path it has once the rename is undone. */
  readonly undo: readonly NoteLinkEdits[];
}
