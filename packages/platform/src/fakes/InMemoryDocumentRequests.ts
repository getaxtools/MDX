import type { DocumentRequestListener, DocumentRequestsPort } from '../DocumentRequestsPort';

export class InMemoryDocumentRequests implements DocumentRequestsPort {
  private readonly listeners = new Set<DocumentRequestListener>();
  pickedPaths: readonly string[] = [];

  constructor(private startupPaths: readonly string[] = []) {}

  pickDocuments(): Promise<readonly string[]> {
    return Promise.resolve(this.pickedPaths);
  }

  takeStartupDocuments(): Promise<readonly string[]> {
    const paths = this.startupPaths;
    this.startupPaths = [];
    return Promise.resolve(paths);
  }

  onDocumentsRequested(listener: DocumentRequestListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  requestDocuments(paths: readonly string[]): void {
    for (const listener of this.listeners) listener(paths);
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}
