import { RecentFilesList } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { InMemoryDocumentFiles, type PathStatus } from '@mdx/platform';
import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import RecentFilesSection from './RecentFilesSection.svelte';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);
const keyOf = (path: string) => location(path).canonicalKey;

function renderRecentFiles(pathStatuses: ReadonlyMap<string, PathStatus> = new Map()) {
  const recentFiles = RecentFilesList.empty()
    .add(location('Guide.md'), 1)
    .add(location('Notes.md'), 2)
    .pin(keyOf('Guide.md'));
  const onOpen = vi.fn();
  const onCommand = vi.fn();
  render(RecentFilesSection, {
    recentFiles: recentFiles.entries(),
    pathStatuses,
    translator: createTranslator(),
    onOpen,
    onCommand,
  });
  return { onOpen, onCommand };
}

describe('RecentFilesSection', () => {
  it('marks a recent file that is no longer found', () => {
    renderRecentFiles(new Map([[keyOf('Notes.md'), 'missing']]));

    expect(screen.getByRole('treeitem', { name: 'Notes.md (not found)' })).toBeTruthy();
  });

  it('pins an unpinned recent file from its context menu', async () => {
    const { onCommand } = renderRecentFiles();

    await fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'Notes.md' }), {
      clientX: 4,
      clientY: 4,
    });
    await userEvent.click(screen.getByRole('menuitem', { name: 'Pin to List' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'pinRecentFile', canonicalKey: keyOf('Notes.md') });
  });

  it('offers to unpin a pinned recent file and to clear unpinned items', async () => {
    const { onCommand } = renderRecentFiles();

    await fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'Guide.md' }), {
      clientX: 4,
      clientY: 4,
    });
    expect(screen.getByRole('menuitem', { name: 'Unpin from List' })).toBeTruthy();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Clear Unpinned Items' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'clearUnpinnedRecentFiles' });
  });

  it('opens the context menu from the keyboard', async () => {
    renderRecentFiles();
    screen.getByRole('treeitem', { name: 'Notes.md' }).focus();

    await userEvent.keyboard('{Shift>}{F10}{/Shift}');

    expect(screen.getByRole('menu', { name: 'Actions for Notes.md' })).toBeTruthy();
  });
});
