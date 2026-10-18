import { FavouritesList } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { InMemoryDocumentFiles, type FolderListing, type PathStatus } from '@mdx/platform';
import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FavouritesSection from './FavouritesSection.svelte';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);
const keyOf = (path: string) => location(path).canonicalKey;
const EMPTY_LISTING: FolderListing = { folders: [], documents: [] };

function renderFavourites(pathStatuses: ReadonlyMap<string, PathStatus> = new Map()) {
  const favourites = FavouritesList.empty()
    .add(location('Guide.md'), 'file')
    .add(location('Notes.md'), 'file');
  const onOpen = vi.fn();
  const onCommand = vi.fn();
  render(FavouritesSection, {
    favourites: favourites.favourites(),
    pathStatuses,
    translator: createTranslator(),
    onOpen,
    onCommand,
    onListFolder: () => Promise.resolve(EMPTY_LISTING),
    onOpenDocument: vi.fn(),
  });
  return { onOpen, onCommand };
}

describe('FavouritesSection', () => {
  it('marks a favourite whose file is missing or unreachable', () => {
    renderFavourites(new Map([[keyOf('Notes.md'), 'unreachable']]));

    expect(screen.getByRole('button', { name: 'Notes.md (location unreachable)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guide.md' })).toBeTruthy();
  });

  it('renames a favourite with F2, saving on Enter', async () => {
    const { onCommand } = renderFavourites();
    screen.getByRole('button', { name: 'Guide.md' }).focus();

    await userEvent.keyboard('{F2}');
    const input = screen.getByRole('textbox', { name: 'New name for Guide.md' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Team guide{Enter}');

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'renameFavourite',
      canonicalKey: keyOf('Guide.md'),
      label: 'Team guide',
    });
  });

  it('cancels a rename with Escape', async () => {
    const { onCommand } = renderFavourites();
    screen.getByRole('button', { name: 'Guide.md' }).focus();

    await userEvent.keyboard('{F2}{Escape}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('moves a favourite down with Alt+ArrowDown', async () => {
    const { onCommand } = renderFavourites();
    screen.getByRole('button', { name: 'Guide.md' }).focus();

    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'moveFavourite',
      canonicalKey: keyOf('Guide.md'),
      toIndex: 1,
    });
  });

  it('removes a favourite from its context menu', async () => {
    const { onCommand } = renderFavourites();

    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Notes.md' }), { clientX: 4, clientY: 4 });
    expect(screen.getByRole('menuitem', { name: 'Move Down' }).hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from Favourites' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'removeFavourite', canonicalKey: keyOf('Notes.md') });
  });

  it('opens a favourite from its context menu', async () => {
    const { onOpen } = renderFavourites();

    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Guide.md' }), { clientX: 4, clientY: 4 });
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open' }));

    expect(onOpen).toHaveBeenCalledOnce();
  });
});

describe('FavouritesSection folders', () => {
  it('expands a folder favourite to list its documents and opens the chosen one', async () => {
    const favourites = FavouritesList.empty().add(location('C:\\Specs'), 'folder');
    const onOpenDocument = vi.fn();
    render(FavouritesSection, {
      favourites: favourites.favourites(),
      pathStatuses: new Map(),
      translator: createTranslator(),
      onOpen: vi.fn(),
      onCommand: vi.fn(),
      onListFolder: () => Promise.resolve({ folders: [], documents: [location('C:\\Specs\\Plan.md')] }),
      onOpenDocument,
    });
    const folder = screen.getByRole('button', { name: 'Specs' });

    await userEvent.click(folder);
    await userEvent.click(await screen.findByRole('button', { name: 'Plan.md' }));

    expect(folder.getAttribute('aria-expanded')).toBe('true');
    expect(onOpenDocument).toHaveBeenCalledWith('C:\\Specs\\Plan.md');
  });

  it('expands a subfolder to list its own documents', async () => {
    const listingsByFolder: Record<string, FolderListing> = {
      'C:\\Specs': { folders: [location('C:\\Specs\\docs')], documents: [location('C:\\Specs\\README.md')] },
      'C:\\Specs\\docs': { folders: [], documents: [location('C:\\Specs\\docs\\Plan.md')] },
    };
    const onOpenDocument = vi.fn();
    render(FavouritesSection, {
      favourites: FavouritesList.empty().add(location('C:\\Specs'), 'folder').favourites(),
      pathStatuses: new Map(),
      translator: createTranslator(),
      onOpen: vi.fn(),
      onCommand: vi.fn(),
      onListFolder: (folderPath: string) => Promise.resolve(listingsByFolder[folderPath] ?? EMPTY_LISTING),
      onOpenDocument,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Specs' }));
    const subfolder = await screen.findByRole('button', { name: 'docs' });
    await userEvent.click(subfolder);
    await userEvent.click(await screen.findByRole('button', { name: 'Plan.md' }));

    expect(subfolder.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'README.md' })).toBeTruthy();
    expect(onOpenDocument).toHaveBeenCalledWith('C:\\Specs\\docs\\Plan.md');
  });

  it('says when a folder has no subfolders or Markdown documents', async () => {
    render(FavouritesSection, {
      favourites: FavouritesList.empty().add(location('C:\\Empty'), 'folder').favourites(),
      pathStatuses: new Map(),
      translator: createTranslator(),
      onOpen: vi.fn(),
      onCommand: vi.fn(),
      onListFolder: () => Promise.resolve(EMPTY_LISTING),
      onOpenDocument: vi.fn(),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Empty' }));

    expect(await screen.findByText('No Markdown documents in this folder.')).toBeTruthy();
  });
});
