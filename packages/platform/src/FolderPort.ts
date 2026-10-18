import type { DocumentLocation } from './DocumentLocation';

export interface FolderPort {
  /** Lets the user choose a folder; undefined when they cancel. */
  pickFolder(): Promise<DocumentLocation | undefined>;
  /** The Markdown documents directly inside a folder the user has chosen. */
  listFolderDocuments(folderPath: string): Promise<readonly DocumentLocation[]>;
}
