import { InMemoryFolderWatcher } from '@mdx/platform';
import { describe, expect, it, vi } from 'vitest';
import { FolderRefresh } from './FolderRefresh';

const DOCS = 'C:\\Docs';
const SPECS = 'C:\\Docs\\Specs';

function createRefresh() {
  const watcher = new InMemoryFolderWatcher();
  const onRevisionsChanged = vi.fn();
  const refresh = new FolderRefresh(watcher, onRevisionsChanged);
  refresh.start();
  return { watcher, refresh, onRevisionsChanged };
}

describe('FolderRefresh', () => {
  it('watches exactly the folders that are shown', () => {
    const { watcher, refresh } = createRefresh();

    refresh.showFolder(SPECS);
    const hideDocs = refresh.showFolder(DOCS);
    hideDocs();

    expect(watcher.watchedPaths).toEqual([SPECS]);
  });

  it('keeps watching a folder shown in two places until both hide it', () => {
    const { watcher, refresh } = createRefresh();
    const hideFromFavourites = refresh.showFolder(DOCS);
    refresh.showFolder(DOCS);

    hideFromFavourites();
    hideFromFavourites();

    expect(watcher.watchedPaths).toEqual([DOCS]);
  });

  it('asks the watcher again only when the shown folders change', () => {
    const { watcher, refresh } = createRefresh();
    refresh.showFolder(DOCS);
    const watchCountAfterFirstFolder = watcher.watchCount;

    refresh.showFolder(DOCS);

    expect(watcher.watchCount).toBe(watchCountAfterFirstFolder);
  });

  it('counts a change for each shown folder the watcher reports', () => {
    const { watcher, refresh, onRevisionsChanged } = createRefresh();
    refresh.showFolder(DOCS);
    refresh.showFolder(SPECS);

    watcher.reportChanges([DOCS]);
    watcher.reportChanges([DOCS, SPECS]);

    expect(refresh.revisionsByFolder()).toEqual(
      new Map([
        [DOCS, 2],
        [SPECS, 1],
      ]),
    );
    expect(onRevisionsChanged).toHaveBeenCalledTimes(2);
  });

  it('ignores changes to folders that are no longer shown', () => {
    const { watcher, refresh, onRevisionsChanged } = createRefresh();
    refresh.showFolder(DOCS)();

    watcher.reportChanges([DOCS]);

    expect(refresh.revisionsByFolder().size).toBe(0);
    expect(onRevisionsChanged).not.toHaveBeenCalled();
  });

  it('reloads every shown folder on request', () => {
    const { refresh } = createRefresh();
    refresh.showFolder(DOCS);
    refresh.showFolder(SPECS);

    refresh.refreshShownFolders();

    expect([...refresh.revisionsByFolder().values()]).toEqual([1, 1]);
  });
});
