import { RecentFilesList } from '@mdx/core';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { applyRecentFileCommand, isRecentFileCommand } from './recentFileCommands';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);
const keyOf = (path: string) => location(path).canonicalKey;
const recentFiles = RecentFilesList.empty().add(location('a.md'), 1).add(location('b.md'), 2);
const namesOf = (list: RecentFilesList) => list.entries().map((entry) => entry.location.fileName);

describe('recent file commands', () => {
  it('pins and unpins a recent file', () => {
    const pinned = applyRecentFileCommand(recentFiles, {
      kind: 'pinRecentFile',
      canonicalKey: keyOf('a.md'),
    });
    const unpinned = applyRecentFileCommand(pinned, { kind: 'unpinRecentFile', canonicalKey: keyOf('a.md') });

    expect(pinned.entries().find((entry) => entry.isPinned)?.location.fileName).toBe('a.md');
    expect(unpinned.entries().some((entry) => entry.isPinned)).toBe(false);
  });

  it('removes one recent file or clears every unpinned one', () => {
    const pinned = applyRecentFileCommand(recentFiles, {
      kind: 'pinRecentFile',
      canonicalKey: keyOf('a.md'),
    });

    expect(
      namesOf(applyRecentFileCommand(recentFiles, { kind: 'removeRecentFile', canonicalKey: keyOf('b.md') })),
    ).toEqual(['a.md']);
    expect(namesOf(applyRecentFileCommand(pinned, { kind: 'clearUnpinnedRecentFiles' }))).toEqual(['a.md']);
  });

  it('tells recent file commands apart from other commands', () => {
    expect(isRecentFileCommand({ kind: 'clearUnpinnedRecentFiles' })).toBe(true);
    expect(isRecentFileCommand({ kind: 'removeFavourite' })).toBe(false);
  });
});
