import type { DocumentLocation } from './DocumentLocation';

export interface FolderListing {
  readonly folders: readonly DocumentLocation[];
  readonly documents: readonly DocumentLocation[];
}

export interface FolderPort {
  /** Lets the user choose a folder; undefined when they cancel. */
  pickFolder(): Promise<DocumentLocation | undefined>;
  /** The subfolders and Markdown documents directly inside a folder the user has chosen. */
  listFolderContents(folderPath: string): Promise<FolderListing>;
  /** The Markdown documents in chosen folders and all their subfolders, for finding one by name. */
  findDocuments(folderPaths: readonly string[]): Promise<DocumentLocation[]>;
}
