import { isInsideFolder, notePathInLocation, type NoteEntry, type NotesLocation } from '@mdx/core';
import type { WikiLinkSuggester } from '@mdx/editor';
import type {
  Backlink,
  DocumentLocation,
  DocumentMatches,
  FolderSearchResults,
  NoteSearchResults,
  NotesIndexPort,
  NotesIndexStatus,
  TagCount,
} from '@mdx/platform';
import { noteLinkSuggester } from './noteLinkSuggester';

/** Opening what the index found: a note linking to the shown one, or the notes carrying a tag. */
export type NotesLinkCommand =
  | { readonly kind: 'openBacklink'; readonly path: string; readonly noteName: string }
  | { readonly kind: 'showNotesWithTag'; readonly tag: string };

/** The notes linking to the shown note. */
export interface NoteBacklinks {
  readonly canonicalKey: string;
  readonly backlinks: readonly Backlink[];
}

export interface NotesIndexActionsDependencies {
  readonly notesIndex: NotesIndexPort;
  readonly onChange: () => void;
  /** Notes changed on disk, by this app or another program. */
  readonly onNotesChanged: () => void;
}

/** Opens the index of the shown Notes workspace, follows how far its build is, and searches it. */
export class NotesIndexActions {
  private shownLocation: NotesLocation | undefined;
  private shownExcludedPaths: readonly string[] = [];
  private latestStatus: NotesIndexStatus | undefined;
  private tagList: readonly TagCount[] | undefined;
  private shownBacklinks: NoteBacklinks | undefined;
  private backlinksDocument: DocumentLocation | undefined;

  constructor(private readonly dependencies: NotesIndexActionsDependencies) {}

  start(): () => void {
    const { notesIndex } = this.dependencies;
    const stopStatus = notesIndex.onIndexStatus((status) => {
      if (status.locationId !== this.shownLocation?.locationId) return;
      this.latestStatus = status;
      this.dependencies.onChange();
      if (!status.isBuilding) void this.refreshFromIndex();
    });
    const stopChanges = notesIndex.onNotesChanged((changes) => {
      if (changes.locationId !== this.shownLocation?.locationId) return;
      this.dependencies.onNotesChanged();
      void this.refreshFromIndex();
    });
    return () => {
      stopStatus();
      stopChanges();
    };
  }

  /** A location that reports no changes is reconciled when the window gets the focus, never by polling. */
  async windowFocused(): Promise<void> {
    const location = this.shownLocation;
    if (!location || this.latestStatus?.isWatched !== false) return;
    await this.dependencies.notesIndex.refreshIndex(location.locationId);
  }

  /**
   * Shows the index of the given location, leaving out its excluded paths, or none when no Notes
   * workspace with a folder is shown.
   */
  async show(location: NotesLocation | undefined, excludedPaths: readonly string[] = []): Promise<void> {
    if (this.isAlreadyShown(location, excludedPaths)) return;
    this.shownLocation = location;
    this.shownExcludedPaths = excludedPaths;
    this.latestStatus = undefined;
    this.tagList = undefined;
    this.shownBacklinks = undefined;
    const { notesIndex } = this.dependencies;
    if (location)
      await notesIndex.showIndex({ path: location.path, locationId: location.locationId, excludedPaths });
    else await notesIndex.hideIndex();
  }

  private isAlreadyShown(location: NotesLocation | undefined, excludedPaths: readonly string[]): boolean {
    return (
      location?.locationId === this.shownLocation?.locationId &&
      location?.path === this.shownLocation?.path &&
      excludedPaths.join('\n') === this.shownExcludedPaths.join('\n')
    );
  }

  /** Removes every index for Clear All Data; the next Notes workspace shown builds its index again. */
  async clearAll(): Promise<void> {
    this.shownLocation = undefined;
    this.latestStatus = undefined;
    this.tagList = undefined;
    this.shownBacklinks = undefined;
    await this.dependencies.notesIndex.clearAll();
  }

  status(): NotesIndexStatus | undefined {
    return this.latestStatus;
  }

  tags(): readonly TagCount[] | undefined {
    return this.tagList;
  }

  backlinks(): NoteBacklinks | undefined {
    return this.shownBacklinks;
  }

  /** Lists the notes linking to the shown note, once per note shown; another note clears the list. */
  async showBacklinksOf(document: DocumentLocation | undefined): Promise<void> {
    if (document?.canonicalKey === this.backlinksDocument?.canonicalKey) return;
    this.backlinksDocument = document;
    await this.loadBacklinks();
  }

  /** The full path of a note found by the index, from its path inside the location. */
  displayPathOf(notePath: string): string | undefined {
    const location = this.shownLocation;
    return location ? `${location.path}\\${notePath.replaceAll('/', '\\')}` : undefined;
  }

  private async refreshFromIndex(): Promise<void> {
    await Promise.all([this.loadTags(), this.loadBacklinks()]);
  }

  private async loadTags(): Promise<void> {
    const location = this.shownLocation;
    if (!location) return;
    this.tagList = await this.dependencies.notesIndex.tags(location.locationId).catch(() => this.tagList);
    this.dependencies.onChange();
  }

  private async loadBacklinks(): Promise<void> {
    const location = this.shownLocation;
    const document = this.backlinksDocument;
    if (!location || !document || !isInsideFolder(document.displayPath, location.path)) {
      const wasShowingBacklinks = this.shownBacklinks !== undefined;
      this.shownBacklinks = undefined;
      if (wasShowingBacklinks) this.dependencies.onChange();
      return;
    }
    const notePath = document.displayPath.slice(location.path.length + 1).replaceAll('\\', '/');
    const backlinks = await this.dependencies.notesIndex
      .backlinks(location.locationId, notePath)
      .catch(() => []);
    if (document !== this.backlinksDocument) return;
    this.shownBacklinks = { canonicalKey: document.canonicalKey, backlinks };
    this.dependencies.onChange();
  }

  isShown(): boolean {
    return this.shownLocation !== undefined;
  }

  /** Suggestions for wiki-links typed in a note of the shown location; none for any other document. */
  linkSuggesterFor(
    document: DocumentLocation,
    notes: () => readonly NoteEntry[] | undefined,
  ): WikiLinkSuggester | undefined {
    const location = this.shownLocation;
    if (!location || !isInsideFolder(document.displayPath, location.path)) return undefined;
    return noteLinkSuggester({
      notesIndex: this.dependencies.notesIndex,
      locationId: location.locationId,
      fromNote: notePathInLocation(location.path, document.displayPath),
      notes,
    });
  }

  /** The hits as the search panel shows them: by note, with their lines. */
  async search(query: string): Promise<FolderSearchResults> {
    const location = this.shownLocation;
    if (!location || query.trim() === '') return { documents: [], isIncomplete: false };
    const results = await this.dependencies.notesIndex.search(location.locationId, query);
    return asFolderResults(location.path, results);
  }
}

function asFolderResults(locationPath: string, results: NoteSearchResults): FolderSearchResults {
  const documents = new Map<string, DocumentMatches>();
  for (const hit of results.hits) {
    const displayPath = `${locationPath}\\${hit.path.replaceAll('/', '\\')}`;
    const known = documents.get(hit.path);
    documents.set(hit.path, {
      location: known?.location ?? {
        canonicalKey: displayPath.toLowerCase(),
        displayPath,
        fileName: hit.path.split('/').at(-1) ?? hit.path,
      },
      matches: [...(known?.matches ?? []), ...hit.matches],
    });
  }
  return {
    documents: [...documents.values()],
    isIncomplete: results.isIncomplete,
    notSearchedOnlineOnly: results.notSearchedOnlineOnly,
  };
}
