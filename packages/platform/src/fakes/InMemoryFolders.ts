import type { DocumentLocation } from '../DocumentLocation';
import type { FolderListing, FolderPort } from '../FolderPort';
import { InMemoryDocumentFiles } from './InMemoryDocumentFiles';

export interface InMemoryFolderContents {
  readonly folders?: readonly string[];
  readonly documents?: readonly string[];
}

export class InMemoryFolders implements FolderPort {
  pickedFolder: string | undefined;

  constructor(private readonly contentsByFolder: Readonly<Record<string, InMemoryFolderContents>> = {}) {}

  pickFolder(): Promise<DocumentLocation | undefined> {
    return Promise.resolve(
      this.pickedFolder === undefined ? undefined : InMemoryDocumentFiles.locationOf(this.pickedFolder),
    );
  }

  listFolderContents(folderPath: string): Promise<FolderListing> {
    const contents = this.contentsByFolder[folderPath] ?? {};
    return Promise.resolve({
      folders: (contents.folders ?? []).map((path) => InMemoryDocumentFiles.locationOf(path)),
      documents: (contents.documents ?? []).map((path) => InMemoryDocumentFiles.locationOf(path)),
    });
  }

  findDocuments(folderPaths: readonly string[]): Promise<DocumentLocation[]> {
    const documentPaths = folderPaths.flatMap((folderPath) => this.documentPathsBelow(folderPath));
    return Promise.resolve([...new Set(documentPaths)].map((path) => InMemoryDocumentFiles.locationOf(path)));
  }

  private documentPathsBelow(folderPath: string): string[] {
    const contents = this.contentsByFolder[folderPath] ?? {};
    return [
      ...(contents.documents ?? []),
      ...(contents.folders ?? []).flatMap((subfolder) => this.documentPathsBelow(subfolder)),
    ];
  }
}
