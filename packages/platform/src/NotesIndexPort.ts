import type { LineMatch } from './FolderPort';
import type { LinkUpdatePlan, NoteMoveInLocation } from './NoteLinkUpdates';

/** A section of a note holding every word searched for. */
export interface NoteSearchHit {
  /** The note's path inside the location, with forward slashes. */
  readonly path: string;
  /** The heading the hit is under, by its place among the note's headings; none before the first. */
  readonly headingPosition: number | null;
  readonly heading: string | null;
  readonly matches: readonly LineMatch[];
}

export interface NoteSearchResults {
  readonly hits: readonly NoteSearchHit[];
  readonly isIncomplete: boolean;
  /** Notes kept only in the cloud, which a search never opens. */
  readonly notSearchedOnlineOnly: number;
}

/** How far the shown workspace's index is. */
export interface NotesIndexStatus {
  readonly locationId: string;
  readonly indexed: number;
  readonly toIndex: number;
  readonly isBuilding: boolean;
  /** The index was from another version or could not be read, so it was built again. */
  readonly wasRebuilt: boolean;
  /** False when the location reports no changes; the window then reconciles when it gets the focus. */
  readonly isWatched: boolean;
}

/** A note the index read again or dropped after it changed on disk. */
export interface NoteChange {
  /** The note's path inside the location, with forward slashes. */
  readonly path: string;
  readonly kind: 'added' | 'changed' | 'removed';
  readonly sectionHashes: readonly string[];
}

/** A link to a note from another note, with the line it is on. */
export interface Backlink {
  /** The linking note's path inside the location, with forward slashes. */
  readonly path: string;
  readonly lineNumber: number;
  readonly line: string;
}

export interface TagCount {
  /** As written, such as `work/finance` for a tag nested in `work`. */
  readonly tag: string;
  readonly notes: number;
}

/** A heading offered after `#` in a wiki-link. */
export interface NoteHeading {
  readonly level: number;
  readonly text: string;
}

export interface NoteSuggestion {
  readonly path: string;
  readonly name: string;
  /** The alias that matched, when the name did not. */
  readonly alias: string | null;
}

/** The Notes workspace whose index to show. */
export interface ShownNotesIndex {
  readonly path: string;
  readonly locationId: string;
  /** Folders and notes inside the location, with `/` between their parts, that the index never reads. */
  readonly excludedPaths: readonly string[];
}

export interface NoteChanges {
  readonly locationId: string;
  readonly changes: readonly NoteChange[];
}

/**
 * The index of the shown Notes workspace, kept in local app data and built from the notes in the
 * background; it never writes to a note.
 */
export interface NotesIndexPort {
  showIndex(shown: ShownNotesIndex): Promise<void>;
  hideIndex(): Promise<void>;
  /** Removes every notes index for Clear All Data; the notes are never touched. */
  clearAll(): Promise<void>;
  /** Words to find, with `tag:` and `path:` words as filters; accents and case are ignored. */
  search(locationId: string, query: string): Promise<NoteSearchResults>;
  /** The notes linking to a note, resolved as the renderer resolves links. */
  backlinks(locationId: string, notePath: string): Promise<Backlink[]>;
  tags(locationId: string): Promise<TagCount[]>;
  /** Notes whose name or alias starts with what was typed, the nearest folder to the typing note first. */
  suggestions(locationId: string, typed: string, fromNote: string): Promise<NoteSuggestion[]>;
  /** The headings of the note a wiki-link target means from a note; an empty target is that note. */
  headings(locationId: string, target: string, fromNote: string): Promise<NoteHeading[]>;
  /**
   * The link targets to change in the notes linking to a note that was just renamed or moved, as
   * they would be read now; nothing is written.
   */
  planLinkUpdates(locationId: string, moved: NoteMoveInLocation): Promise<LinkUpdatePlan>;
  /** Reconciles the shown index again, for a location that reports no changes. */
  refreshIndex(locationId: string): Promise<void>;
  onIndexStatus(listener: (status: NotesIndexStatus) => void): () => void;
  /** Notes added, changed or removed by any program while the workspace is shown. */
  onNotesChanged(listener: (changes: NoteChanges) => void): () => void;
}
