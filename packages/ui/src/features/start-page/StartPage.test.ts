import { createTranslator } from '@mdx/i18n';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import StartPage from './StartPage.svelte';

const recentFile = {
  location: InMemoryDocumentFiles.locationOf('C:\\Docs\\Guide.md'),
  isPinned: false,
  lastOpenedAtMs: 1,
};

function renderStartPage(recentFiles = [recentFile]) {
  const onCommand = vi.fn();
  const onOpenRecentFile = vi.fn();
  render(StartPage, { recentFiles, translator: createTranslator(), onCommand, onOpenRecentFile });
  return { onCommand, onOpenRecentFile };
}

describe('StartPage', () => {
  it('offers ways to start, each with its keys', () => {
    renderStartPage();

    const newDocument = screen.getByRole('button', { name: 'New Document' });

    expect(newDocument.parentElement?.textContent).toContain('Ctrl+N');
    expect(screen.getByRole('button', { name: 'Open…' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Folder…' })).toBeTruthy();
  });

  it('runs the chosen action', async () => {
    const { onCommand } = renderStartPage();

    await userEvent.click(screen.getByRole('button', { name: 'Open Folder…' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'openFolder' });
  });

  it('opens a recent file and shows the folder it is in', async () => {
    const { onOpenRecentFile } = renderStartPage();
    const guide = screen.getByRole('button', { name: 'Guide.md' });

    await userEvent.click(guide);

    expect(onOpenRecentFile).toHaveBeenCalledWith(recentFile);
    expect(guide.parentElement?.textContent).toContain('C:\\Docs\\');
  });

  it('says where recent files will appear before there are any', () => {
    renderStartPage([]);

    expect(screen.getByText('Documents you open will appear here.')).toBeTruthy();
  });
});
