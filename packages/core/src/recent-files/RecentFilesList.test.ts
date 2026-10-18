import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { MAX_RECENT_FILES, RecentFilesList } from './RecentFilesList';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);
const pathsOf = (list: RecentFilesList) => list.entries().map((file) => file.location.displayPath);

function listWithFiles(count: number): RecentFilesList {
  return Array.from({ length: count }, (_, index) => `file-${String(index)}.md`).reduce(
    (list, path, index) => list.add(location(path), index),
    RecentFilesList.empty(),
  );
}

describe('RecentFilesList', () => {
  it('lists the most recently opened file first', () => {
    const recentFiles = RecentFilesList.empty().add(location('a.md'), 1).add(location('b.md'), 2);

    expect(pathsOf(recentFiles)).toEqual(['b.md', 'a.md']);
  });

  it('moves a reopened file to the top without duplicating it', () => {
    const recentFiles = RecentFilesList.empty()
      .add(location('a.md'), 1)
      .add(location('b.md'), 2)
      .add(location('A.md'), 3);

    expect(pathsOf(recentFiles)).toEqual(['A.md', 'b.md']);
  });

  it(`keeps only the ${String(MAX_RECENT_FILES)} most recent files`, () => {
    const recentFiles = listWithFiles(MAX_RECENT_FILES + 1);

    expect(recentFiles.entries()).toHaveLength(MAX_RECENT_FILES);
    expect(recentFiles.has(location('file-0.md').canonicalKey)).toBe(false);
  });

  it('never drops a pinned file when the list is full', () => {
    const recentFiles = RecentFilesList.empty()
      .add(location('pinned.md'), 0)
      .pin(location('pinned.md').canonicalKey);

    const full = Array.from({ length: MAX_RECENT_FILES + 5 }, (_, index) =>
      location(`${String(index)}.md`),
    ).reduce((list, file, index) => list.add(file, index + 1), recentFiles);

    expect(full.has(location('pinned.md').canonicalKey)).toBe(true);
    expect(full.entries()).toHaveLength(MAX_RECENT_FILES);
  });

  it('lists pinned files before unpinned files', () => {
    const recentFiles = RecentFilesList.empty()
      .add(location('old.md'), 1)
      .add(location('new.md'), 2)
      .pin(location('old.md').canonicalKey);

    expect(pathsOf(recentFiles)).toEqual(['old.md', 'new.md']);
  });

  it('keeps the pinned state when a pinned file is reopened', () => {
    const recentFiles = RecentFilesList.empty()
      .add(location('a.md'), 1)
      .pin(location('a.md').canonicalKey)
      .add(location('a.md'), 2);

    expect(recentFiles.entries()[0]?.isPinned).toBe(true);
  });

  it(`does not keep a newly opened file when all ${String(MAX_RECENT_FILES)} entries are pinned`, () => {
    const allPinned = Array.from({ length: MAX_RECENT_FILES }, (_, index) =>
      location(`${String(index)}.md`),
    ).reduce((list, file, index) => list.add(file, index).pin(file.canonicalKey), RecentFilesList.empty());

    const afterOpeningAnother = allPinned.add(location('extra.md'), 100);

    expect(afterOpeningAnother.entries()).toHaveLength(MAX_RECENT_FILES);
    expect(afterOpeningAnother.has(location('extra.md').canonicalKey)).toBe(false);
  });

  it('unpins a file and keeps it in the list', () => {
    const recentFiles = listWithFiles(2)
      .pin(location('file-0.md').canonicalKey)
      .unpin(location('file-0.md').canonicalKey);

    expect(recentFiles.entries().map((file) => file.isPinned)).toEqual([false, false]);
    expect(pathsOf(recentFiles)).toEqual(['file-1.md', 'file-0.md']);
  });

  it('removes a single file', () => {
    const recentFiles = listWithFiles(3).remove(location('file-1.md').canonicalKey);

    expect(pathsOf(recentFiles)).toEqual(['file-2.md', 'file-0.md']);
  });

  it('clears unpinned files but keeps pinned ones', () => {
    const recentFiles = listWithFiles(3).pin(location('file-0.md').canonicalKey).clearUnpinned();

    expect(pathsOf(recentFiles)).toEqual(['file-0.md']);
  });

  it('clears everything, including pinned files', () => {
    const recentFiles = listWithFiles(3).pin(location('file-0.md').canonicalKey).clearAll();

    expect(recentFiles.entries()).toEqual([]);
  });

  it('restores from saved entries in recency order without duplicates', () => {
    const recentFiles = RecentFilesList.fromRecentFiles([
      { location: location('a.md'), isPinned: false, lastOpenedAtMs: 1 },
      { location: location('b.md'), isPinned: false, lastOpenedAtMs: 3 },
      { location: location('A.md'), isPinned: false, lastOpenedAtMs: 2 },
    ]);

    expect(pathsOf(recentFiles)).toEqual(['b.md', 'A.md']);
  });
});
