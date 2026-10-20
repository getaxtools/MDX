import type { FoldersChangedListener, FolderWatcherPort } from '../FolderWatcherPort';

export class InMemoryFolderWatcher implements FolderWatcherPort {
  private readonly listeners = new Set<FoldersChangedListener>();
  watchedPaths: readonly string[] = [];
  watchCount = 0;

  watch(folderPaths: readonly string[]): Promise<void> {
    this.watchedPaths = folderPaths;
    this.watchCount += 1;
    return Promise.resolve();
  }

  onFoldersChanged(listener: FoldersChangedListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reportChanges(folderPaths: readonly string[]): void {
    for (const listener of this.listeners) listener(folderPaths);
  }
}
