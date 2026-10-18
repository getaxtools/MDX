import type { DocumentsChangedListener, DocumentWatcherPort } from '../DocumentWatcherPort';

export class InMemoryDocumentWatcher implements DocumentWatcherPort {
  private readonly listeners = new Set<DocumentsChangedListener>();
  watchedPaths: readonly string[] = [];
  watchCount = 0;

  watch(displayPaths: readonly string[]): Promise<void> {
    this.watchedPaths = displayPaths;
    this.watchCount += 1;
    return Promise.resolve();
  }

  onDocumentsChanged(listener: DocumentsChangedListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reportChanges(displayPaths: readonly string[]): void {
    for (const listener of this.listeners) listener(displayPaths);
  }
}
