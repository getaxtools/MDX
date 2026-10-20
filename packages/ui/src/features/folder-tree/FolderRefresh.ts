import type { FolderWatcherPort } from '@mdx/platform';

/** Watches the folders shown expanded and counts their changes, so each listing knows when to reload. */
export class FolderRefresh {
  private readonly shownFolderCounts = new Map<string, number>();
  private revisions: ReadonlyMap<string, number> = new Map();
  private watchedPathsKey = '[]';

  constructor(
    private readonly watcher: FolderWatcherPort | undefined,
    private readonly onRevisionsChanged: () => void,
  ) {}

  start(): () => void {
    return (
      this.watcher?.onFoldersChanged((folderPaths) => this.markChanged(folderPaths)) ?? (() => undefined)
    );
  }

  /** Watches a folder while its listing is shown; call the returned function when it is hidden. */
  showFolder(folderPath: string): () => void {
    this.shownFolderCounts.set(folderPath, (this.shownFolderCounts.get(folderPath) ?? 0) + 1);
    this.watchShownFolders();
    let isShown = true;
    return () => {
      if (!isShown) return;
      isShown = false;
      this.hideFolder(folderPath);
    };
  }

  /** Reloads every shown listing, for shares that do not report their changes. */
  refreshShownFolders(): void {
    this.markChanged([...this.shownFolderCounts.keys()]);
  }

  revisionsByFolder(): ReadonlyMap<string, number> {
    return this.revisions;
  }

  private hideFolder(folderPath: string): void {
    const remaining = (this.shownFolderCounts.get(folderPath) ?? 1) - 1;
    if (remaining > 0) this.shownFolderCounts.set(folderPath, remaining);
    else this.shownFolderCounts.delete(folderPath);
    this.watchShownFolders();
  }

  private markChanged(folderPaths: readonly string[]): void {
    const shownPaths = folderPaths.filter((folderPath) => this.shownFolderCounts.has(folderPath));
    if (shownPaths.length === 0) return;
    const revisions = new Map(this.revisions);
    for (const folderPath of shownPaths) revisions.set(folderPath, (revisions.get(folderPath) ?? 0) + 1);
    this.revisions = revisions;
    this.onRevisionsChanged();
  }

  private watchShownFolders(): void {
    const folderPaths = [...this.shownFolderCounts.keys()].sort();
    const pathsKey = JSON.stringify(folderPaths);
    if (pathsKey === this.watchedPathsKey) return;
    this.watchedPathsKey = pathsKey;
    void this.watcher?.watch(folderPaths);
  }
}
