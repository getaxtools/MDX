import { ExplorerFolders, FavouritesList, RecentFilesList, type ExplorerSection } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ExplorerSidebar from './ExplorerSidebar.svelte';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);

function renderSidebar(
  favourites = FavouritesList.empty(),
  recentFiles = RecentFilesList.empty(),
  { explorerFolders = ExplorerFolders.empty(), collapsedSections = [] as ExplorerSection[] } = {},
) {
  const onOpenFavourite = vi.fn();
  const onOpenRecentFile = vi.fn();
  const onCommand = vi.fn();
  const onShowFolder = vi.fn(() => () => undefined);
  render(ExplorerSidebar, {
    favourites: favourites.favourites(),
    explorerFolders: explorerFolders.folders(),
    recentFiles: recentFiles.entries(),
    collapsedSections,
    pathStatuses: new Map(),
    translator: createTranslator(),
    onOpenFavourite,
    onOpenRecentFile,
    onCommand,
    onListFolder: () => Promise.resolve({ folders: [], documents: [location('C:\\Notes\\Plan.md')] }),
    onOpenDocument: vi.fn(),
    onShowFolder,
  });
  return { onOpenFavourite, onOpenRecentFile, onCommand, onShowFolder };
}

describe('ExplorerSidebar', () => {
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

    await userEvent.click(screen.getByRole('treeitem', { name: 'Team guide' }));

    expect(onOpenFavourite).toHaveBeenCalledWith(favourites.favourites()[0]);
  });

  it('lists recent files and opens the chosen one', async () => {
    const recentFiles = RecentFilesList.empty().add(location('C:\\Docs\\Notes.md'), 1);
    const { onOpenRecentFile } = renderSidebar(FavouritesList.empty(), recentFiles);

    await userEvent.click(screen.getByRole('treeitem', { name: 'Notes.md' }));

    expect(onOpenRecentFile).toHaveBeenCalledWith(recentFiles.entries()[0]);
  });

  it('labels the Explorer and its Favourites, Folders and Recent Files sections', () => {
    renderSidebar();

    expect(screen.getByRole('navigation', { name: 'Explorer' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Favourites' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Folders' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Recent Files' })).toBeTruthy();
  });

  it('collapses and expands a section from its header', async () => {
    const { onCommand } = renderSidebar();

    await userEvent.click(screen.getByRole('button', { name: 'Recent Files' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'toggleExplorerSection', section: 'recentFiles' });
  });

  it('hides the contents of a collapsed section', () => {
    renderSidebar(FavouritesList.empty(), RecentFilesList.empty(), { collapsedSections: ['recentFiles'] });

    expect(screen.getByRole('button', { name: 'Recent Files' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Documents you open will appear here.')).toBeNull();
  });

  it('offers to open a folder while the Folders section is empty', async () => {
    const { onCommand } = renderSidebar();

    await userEvent.click(screen.getByRole('button', { name: 'Open Folder…' }));

    expect(screen.getByText('Open a folder to browse its Markdown documents.')).toBeTruthy();
    expect(onCommand).toHaveBeenCalledWith({ kind: 'openFolder' });
  });

  it('shows opened folders expanded and lists their documents', async () => {
    const explorerFolders = ExplorerFolders.empty().add(location('C:\\Notes'));
    const { onShowFolder } = renderSidebar(FavouritesList.empty(), RecentFilesList.empty(), {
      explorerFolders,
    });

    expect(await screen.findByRole('treeitem', { name: 'Plan.md' })).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: 'Notes' }).getAttribute('aria-expanded')).toBe('true');
    expect(onShowFolder).toHaveBeenCalledWith('C:\\Notes');
  });

  it('offers a splitter below the Favourites and Folders sections that remembers their height', async () => {
    const { onCommand } = renderSidebar();

    screen.getByRole('separator', { name: 'Resize Folders' }).focus();
    await userEvent.keyboard('{ArrowDown}');

    expect(screen.getByRole('separator', { name: 'Resize Favourites' })).toBeTruthy();
    expect(screen.queryByRole('separator', { name: 'Resize Recent Files' })).toBeNull();
    expect(onCommand).toHaveBeenCalledWith({
      kind: 'resizeExplorerSection',
      section: 'folders',
      heightPx: 48,
    });
  });

  it('shows each section as a tree that the arrow keys move through', async () => {
    const favourites = FavouritesList.empty()
      .add(location('C:\\Docs\\Guide.md'), 'file')
      .add(location('C:\\Docs\\Notes.md'), 'file');
    renderSidebar(favourites);
    const guide = screen.getByRole('treeitem', { name: 'Guide.md' });

    guide.focus();
    await userEvent.keyboard('{ArrowDown}');

    expect(screen.getByRole('tree', { name: 'Favourites' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: 'Notes.md' }));
  });

  it('removes an opened folder with Delete', async () => {
    const explorerFolders = ExplorerFolders.empty().add(location('C:\\Notes'));
    const { onCommand } = renderSidebar(FavouritesList.empty(), RecentFilesList.empty(), { explorerFolders });

    screen.getByRole('treeitem', { name: 'Notes' }).focus();
    await userEvent.keyboard('{Delete}');

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'removeExplorerFolder',
      canonicalKey: location('C:\\Notes').canonicalKey,
    });
  });

  it('adds an opened folder to favourites from its menu, once', async () => {
    const explorerFolders = ExplorerFolders.empty().add(location('C:\\Notes'));
    const favourites = FavouritesList.empty().add(location('C:\\Notes'), 'folder');
    const { onCommand } = renderSidebar(FavouritesList.empty(), RecentFilesList.empty(), { explorerFolders });

    await fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'Notes' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add to Favourites' }));
    cleanup();
    renderSidebar(favourites, RecentFilesList.empty(), { explorerFolders });
    await fireEvent.contextMenu(screen.getAllByRole('treeitem', { name: 'Notes' }).at(-1) ?? document.body);

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'addExplorerFolderToFavourites',
      canonicalKey: location('C:\\Notes').canonicalKey,
    });
    expect(screen.getByRole('menuitem', { name: 'Add to Favourites' }).hasAttribute('disabled')).toBe(true);
  });
});
