import { FavouritesList, RecentFilesList } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FavouritesSidebar from './FavouritesSidebar.svelte';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);

function renderSidebar(favourites = FavouritesList.empty(), recentFiles = RecentFilesList.empty()) {
  const onOpenFavourite = vi.fn();
  const onOpenRecentFile = vi.fn();
  render(FavouritesSidebar, {
    favourites: favourites.favourites(),
    recentFiles: recentFiles.entries(),
    pathStatuses: new Map(),
    translator: createTranslator(),
    onOpenFavourite,
    onOpenRecentFile,
    onCommand: vi.fn(),
    onListFolder: () => Promise.resolve({ folders: [], documents: [] }),
    onOpenDocument: vi.fn(),
  });
  return { onOpenFavourite, onOpenRecentFile };
}

describe('FavouritesSidebar', () => {
  it('explains how to add favourites and recent files when both are empty', () => {
    renderSidebar();

    expect(screen.getByText('Star a document or folder to keep it here.')).toBeTruthy();
    expect(screen.getByText('Documents you open will appear here.')).toBeTruthy();
  });

  it('lists favourites by label and opens the chosen one', async () => {
    const favourites = FavouritesList.empty()
      .add(location('C:\\Docs\\Guide.md'), 'file')
      .rename(location('C:\\Docs\\Guide.md').canonicalKey, 'Team guide');
    const { onOpenFavourite } = renderSidebar(favourites);

    await userEvent.click(screen.getByRole('button', { name: 'Team guide' }));

    expect(onOpenFavourite).toHaveBeenCalledWith(favourites.favourites()[0]);
  });

  it('lists recent files and opens the chosen one', async () => {
    const recentFiles = RecentFilesList.empty().add(location('C:\\Docs\\Notes.md'), 1);
    const { onOpenRecentFile } = renderSidebar(FavouritesList.empty(), recentFiles);

    await userEvent.click(screen.getByRole('button', { name: 'Notes.md' }));

    expect(onOpenRecentFile).toHaveBeenCalledWith(recentFiles.entries()[0]);
  });

  it('labels the navigation region and its sections', () => {
    renderSidebar();

    expect(screen.getByRole('navigation', { name: 'Favourites and recent files' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Favourites' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Recent Files' })).toBeTruthy();
  });
});
