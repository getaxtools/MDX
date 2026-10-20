import type { ViewerSession } from '@mdx/core';
import { isUntitledLocation, type DocumentWatcherPort } from '@mdx/platform';

/** Keeps the watched files equal to the open tabs and reloads documents that change on disk. */
export class LiveReload {
  private watchedPathsKey: string | undefined;

  constructor(
    private readonly watcher: DocumentWatcherPort,
    private readonly session: ViewerSession,
    /** Called with the documents whose text is different after reloading. */
    private readonly onDocumentsReloaded: (changedKeys: readonly string[]) => void,
  ) {}

  start(): () => void {
    const stopListening = this.watcher.onDocumentsChanged((displayPaths) => void this.reload(displayPaths));
    this.watchOpenTabs();
    return stopListening;
  }

  watchOpenTabs(): void {
    const displayPaths = this.session
      .currentState()
      .tabStrip.tabs()
      .filter((tab) => !isUntitledLocation(tab.location))
      .map((tab) => tab.location.displayPath);
    const pathsKey = JSON.stringify(displayPaths);
    if (pathsKey === this.watchedPathsKey) return;
    this.watchedPathsKey = pathsKey;
    void this.watcher.watch(displayPaths);
  }

  private async reload(displayPaths: readonly string[]): Promise<void> {
    const keys = this.session
      .currentState()
      .tabStrip.tabs()
      .filter((tab) => displayPaths.includes(tab.location.displayPath))
      .map((tab) => tab.location.canonicalKey);
    const textsBefore = new Map(keys.map((key) => [key, this.session.openedDocument(key)?.text]));
    await this.session.reloadDocuments(displayPaths);
    const changedKeys = keys.filter((key) => this.session.openedDocument(key)?.text !== textsBefore.get(key));
    this.onDocumentsReloaded(changedKeys);
  }
}
