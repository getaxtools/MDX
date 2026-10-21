import type { DocumentLocation } from '../DocumentLocation';
import type { FolderListing, FolderPort, FolderSearchResults } from '../FolderPort';
import { InMemoryDocumentFiles } from './InMemoryDocumentFiles';

export interface InMemoryFolderContents {
  readonly folders?: readonly string[];
  readonly documents?: readonly string[];
}

export class InMemoryFolders implements FolderPort {
  pickedFolder: string | undefined;
  /** The text of documents, for searching them; documents without one hold no text. */
  readonly documentTexts: Record<string, string> = {};
  isSearchFailing = false;

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

  /** A plain search for tests: any case, whole lines as previews. */
  searchDocuments(folderPaths: readonly string[], query: string): Promise<FolderSearchResults> {
    if (this.isSearchFailing) return Promise.reject(new Error('The folders could not be searched'));
    const needle = query.toLowerCase();
    const paths = [...new Set(folderPaths.flatMap((folderPath) => this.documentPathsBelow(folderPath)))];
    const documents = paths.flatMap((path) => {
      const matches = (this.documentTexts[path] ?? '').split('\n').flatMap((line, index) => {
        const start = line.toLowerCase().indexOf(needle);
        return needle && start !== -1
          ? [{ lineNumber: index + 1, preview: line, ranges: [[start, start + needle.length] as const] }]
          : [];
      });
      return matches.length > 0 ? [{ location: InMemoryDocumentFiles.locationOf(path), matches }] : [];
    });
    return Promise.resolve({ documents, isIncomplete: false });
  }

  private documentPathsBelow(folderPath: string): string[] {
    const contents = this.contentsByFolder[folderPath] ?? {};
    return [
      ...(contents.documents ?? []),
      ...(contents.folders ?? []).flatMap((subfolder) => this.documentPathsBelow(subfolder)),
    ];
  }
}
