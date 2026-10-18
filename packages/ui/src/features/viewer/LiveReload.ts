import type { ViewerSession } from '@mdx/core';
import { isUntitledLocation, type DocumentWatcherPort } from '@mdx/platform';

/** Keeps the watched files equal to the open tabs and reloads documents that change on disk. */
export class LiveReload {
  private watchedPathsKey: string | undefined;

  constructor(
    private readonly watcher: DocumentWatcherPort,
    private readonly session: ViewerSession,
    private readonly onDocumentsReloaded: () => void,
  ) {}

  start(): () => void {
    const stopListening = this.watcher.onDocumentsChanged((displayPaths) => {
      void this.session.reloadDocuments(displayPaths).then(this.onDocumentsReloaded);
    });
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
}
