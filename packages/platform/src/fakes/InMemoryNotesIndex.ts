import type {
  Backlink,
  NoteChanges,
  NoteHeading,
  NoteSearchResults,
  NoteSuggestion,
  NotesIndexPort,
  NotesIndexStatus,
  ShownNotesIndex,
  TagCount,
} from '../NotesIndexPort';

const NO_RESULTS: NoteSearchResults = { hits: [], isIncomplete: false, notSearchedOnlineOnly: 0 };

/** Records which index is shown; searches answer with `results`, and tests send status by hand. */
export class InMemoryNotesIndex implements NotesIndexPort {
  shownLocationId: string | undefined;
  readonly searches: { readonly locationId: string; readonly query: string }[] = [];
  results: NoteSearchResults = NO_RESULTS;
  readonly refreshedLocationIds: string[] = [];
  /** Backlinks by the path of the note linked to. */
  readonly backlinksByNote = new Map<string, Backlink[]>();
  tagCounts: TagCount[] = [];
  noteSuggestions: NoteSuggestion[] = [];
  /** Headings by the link target typed, ignoring case. */
  readonly headingsByTarget = new Map<string, NoteHeading[]>();
  readonly suggestionRequests: { readonly typed: string; readonly fromNote: string }[] = [];
  private readonly listeners = new Set<(status: NotesIndexStatus) => void>();
  private readonly changeListeners = new Set<(changes: NoteChanges) => void>();

  shownExcludedPaths: readonly string[] = [];

  showIndex(shown: ShownNotesIndex): Promise<void> {
    this.shownLocationId = shown.locationId;
    this.shownExcludedPaths = shown.excludedPaths;
    return Promise.resolve();
  }

  wasCleared = false;

  clearAll(): Promise<void> {
    this.wasCleared = true;
    this.shownLocationId = undefined;
    return Promise.resolve();
  }

  hideIndex(): Promise<void> {
    this.shownLocationId = undefined;
    return Promise.resolve();
  }

  search(locationId: string, query: string): Promise<NoteSearchResults> {
    this.searches.push({ locationId, query });
    return Promise.resolve(this.results);
  }

  backlinks(_locationId: string, notePath: string): Promise<Backlink[]> {
    return Promise.resolve(this.backlinksByNote.get(notePath) ?? []);
  }

  tags(): Promise<TagCount[]> {
    return Promise.resolve(this.tagCounts);
  }

  suggestions(_locationId: string, typed: string, fromNote: string): Promise<NoteSuggestion[]> {
    this.suggestionRequests.push({ typed, fromNote });
    const wanted = typed.toLowerCase();
    return Promise.resolve(
      this.noteSuggestions.filter((note) => (note.alias ?? note.name).toLowerCase().startsWith(wanted)),
    );
  }

  headings(_locationId: string, target: string): Promise<NoteHeading[]> {
    return Promise.resolve(this.headingsByTarget.get(target.toLowerCase()) ?? []);
  }

  refreshIndex(locationId: string): Promise<void> {
    this.refreshedLocationIds.push(locationId);
    return Promise.resolve();
  }

  onNotesChanged(listener: (changes: NoteChanges) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  sendChanges(changes: NoteChanges): void {
    for (const listener of this.changeListeners) listener(changes);
  }

  onIndexStatus(listener: (status: NotesIndexStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  sendStatus(status: NotesIndexStatus): void {
    for (const listener of this.listeners) listener(status);
  }
}
