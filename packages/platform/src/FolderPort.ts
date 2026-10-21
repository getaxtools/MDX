import type { DocumentLocation } from './DocumentLocation';

export interface FolderListing {
  readonly folders: readonly DocumentLocation[];
  readonly documents: readonly DocumentLocation[];
}

export interface TextSearchOptions {
  readonly isCaseSensitive: boolean;
  readonly isWholeWord: boolean;
}

export interface LineMatch {
  /** Counted from 1, as editors show it. */
  readonly lineNumber: number;
  /** The line, shortened around the first match when it is long. */
  readonly preview: string;
  /** Where each match starts and ends in the preview, in characters. */
  readonly ranges: readonly (readonly [number, number])[];
}

export interface DocumentMatches {
  readonly location: DocumentLocation;
  readonly matches: readonly LineMatch[];
}

export interface FolderSearchResults {
  readonly documents: readonly DocumentMatches[];
  /** True when a limit stopped the search early, so there may be more matches. */
  readonly isIncomplete: boolean;
}

export interface FolderPort {
  /** Lets the user choose a folder; undefined when they cancel. */
  pickFolder(): Promise<DocumentLocation | undefined>;
  /** The subfolders and Markdown documents directly inside a folder the user has chosen. */
  listFolderContents(folderPath: string): Promise<FolderListing>;
  /** The Markdown documents in chosen folders and all their subfolders, for finding one by name. */
  findDocuments(folderPaths: readonly string[]): Promise<DocumentLocation[]>;
  /** The lines of the Markdown documents in chosen folders that contain the query. */
  searchDocuments(
    folderPaths: readonly string[],
    query: string,
    options: TextSearchOptions,
  ): Promise<FolderSearchResults>;
}
