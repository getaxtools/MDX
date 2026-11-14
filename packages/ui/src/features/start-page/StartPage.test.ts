import { createTranslator } from '@mdx/i18n';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { render, screen, within } from '@testing-library/svelte';
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
  it('a kind with no workspace offers to create one, and creates nothing by itself', async () => {
    const onCommand = vi.fn();
    render(StartPage, {
      recentFiles: [],
      activeKindId: 'notes',
      canCreateWorkspace: true,
      translator: createTranslator(),
      onCommand,
      onOpenRecentFile: vi.fn(),
    });

    expect(onCommand).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'New Notes Workspace…' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'showNewWorkspace', kindId: 'notes' });
  });

  it('the start page opens a recent workspace', async () => {
    const onCommand = vi.fn();
    render(StartPage, {
      recentFiles: [],
      recentWorkspaces: [{ id: 'reading', name: 'Reading', kindName: 'Markdown viewer' }],
      translator: createTranslator(),
      onCommand,
      onOpenRecentFile: vi.fn(),
    });

    const workspaces = screen.getByRole('region', { name: 'Workspaces' });
    await userEvent.click(within(workspaces).getByRole('button', { name: 'Reading' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'switchWorkspace', workspaceId: 'reading' });
  });

  it('has no Workspaces section without other workspaces', () => {
    renderStartPage();

    expect(screen.queryByRole('region', { name: 'Workspaces' })).toBeNull();
  });

  it('shows the not-built-yet text for a previewed kind', () => {
    render(StartPage, {
      recentFiles: [],
      activeKindId: 'notes',
      translator: createTranslator(),
      onCommand: vi.fn(),
      onOpenRecentFile: vi.fn(),
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Notes' })).toBeTruthy();
    expect(
      screen.getByText('Notes is not built yet. Switch back to Markdown viewer to read documents.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New Document' })).toBeNull();
  });

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
