import { createTranslator } from '@mdx/i18n';
import { InMemoryDocumentFiles, type FolderListing } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FolderContents from './FolderContents.svelte';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);
const DOCS = 'C:\\Docs';
const SPECS = 'C:\\Docs\\Specs';

function renderFolder(listingsByFolder: Record<string, FolderListing>) {
  const stopShowing = vi.fn();
  const onShowFolder = vi.fn<(folderPath: string) => () => void>(() => stopShowing);
  const props = {
    folderPath: DOCS,
    translator: createTranslator(),
    folderRevisions: new Map<string, number>(),
    onListFolder: (folderPath: string) =>
      Promise.resolve(listingsByFolder[folderPath] ?? { folders: [], documents: [] }),
    onShowFolder,
    onOpenDocument: vi.fn(),
  };
  const { rerender, unmount } = render(FolderContents, props);
  return { props, rerender, unmount, onShowFolder, stopShowing };
}

describe('FolderContents', () => {
  it('shows a chevron that turns when a subfolder is expanded', async () => {
    renderFolder({ [DOCS]: { folders: [location(SPECS)], documents: [] } });
    const subfolder = await screen.findByRole('button', { name: 'Specs' });

    await userEvent.click(subfolder);

    expect(subfolder.getAttribute('aria-expanded')).toBe('true');
    expect(subfolder.querySelector('.tree-chevron.expanded')).not.toBeNull();
  });

  it('watches its folder while shown and stops when hidden', async () => {
    const { onShowFolder, stopShowing, unmount } = renderFolder({ [DOCS]: { folders: [], documents: [] } });
    await screen.findByText('No Markdown documents in this folder.');

    unmount();

    expect(onShowFolder).toHaveBeenCalledWith(DOCS);
    expect(stopShowing).toHaveBeenCalledOnce();
  });

  it('lists the folder again when it changes on disk, keeping subfolders expanded', async () => {
    const listingsByFolder: Record<string, FolderListing> = {
      [DOCS]: { folders: [location(SPECS)], documents: [location('C:\\Docs\\Guide.md')] },
      [SPECS]: { folders: [], documents: [location('C:\\Docs\\Specs\\Plan.md')] },
    };
    const { props, rerender } = renderFolder(listingsByFolder);
    await userEvent.click(await screen.findByRole('button', { name: 'Specs' }));
    await screen.findByRole('button', { name: 'Plan.md' });
    listingsByFolder[DOCS] = {
      folders: [location(SPECS)],
      documents: [location('C:\\Docs\\Guide.md'), location('C:\\Docs\\New.md')],
    };

    await rerender({ ...props, folderRevisions: new Map([[DOCS, 1]]) });

    expect(await screen.findByRole('button', { name: 'New.md' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Specs' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Plan.md' })).toBeTruthy();
  });
});
