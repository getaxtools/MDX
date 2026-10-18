import type { DocumentLocation } from '../DocumentLocation';
import type { FolderPort } from '../FolderPort';
import { InMemoryDocumentFiles } from './InMemoryDocumentFiles';

export class InMemoryFolders implements FolderPort {
  pickedFolder: string | undefined;

  constructor(private readonly documentPathsByFolder: Readonly<Record<string, readonly string[]>> = {}) {}

  pickFolder(): Promise<DocumentLocation | undefined> {
    return Promise.resolve(
      this.pickedFolder === undefined ? undefined : InMemoryDocumentFiles.locationOf(this.pickedFolder),
    );
  }

  listFolderDocuments(folderPath: string): Promise<readonly DocumentLocation[]> {
    const documentPaths = this.documentPathsByFolder[folderPath] ?? [];
    return Promise.resolve(documentPaths.map((path) => InMemoryDocumentFiles.locationOf(path)));
  }
}
