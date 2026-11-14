import { createTranslator } from '@mdx/i18n';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PendingWorkspaceFile } from './WorkspaceFileActions';
import WorkspaceFileConfirmation from './WorkspaceFileConfirmation.svelte';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);

function pendingFile(change: Partial<PendingWorkspaceFile> = {}): PendingWorkspaceFile {
  return {
    path: 'D:\\team\\handbook.mdxworkspace',
    workspace: {
      name: 'Handbook',
      kindId: 'markdownViewer',
      icon: null,
      colour: null,
      roots: [location('D:\\team\\docs'), location('E:\\shared')],
      favourites: [{ location: location('D:\\team\\notes.md'), kind: 'file' }],
      favouriteGroups: [],
      settingsOverrides: {},
    },
    isKindDisabled: false,
    ...change,
  };
}

function renderConfirmation(pending = pendingFile()) {
  const onOpen = vi.fn();
  const onCancel = vi.fn();
  render(WorkspaceFileConfirmation, { pending, translator: createTranslator(), onOpen, onCancel });
  return { onOpen, onCancel };
}

describe('WorkspaceFileConfirmation', () => {
  it('shows the name, the kind and every folder and file that would become readable', () => {
    renderConfirmation();

    const list = screen.getByRole('list', { name: 'MDX will be able to read these folders and files:' });

    expect(screen.getByRole('dialog', { name: 'Open the workspace Handbook?' })).toBeTruthy();
    expect(screen.getByText('Kind: Markdown viewer')).toBeTruthy();
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['D:\\team\\docs', 'E:\\shared', 'D:\\team\\notes.md']);
  });

  it('opens only when asked, and Cancel creates nothing', async () => {
    const { onOpen, onCancel } = renderConfirmation();

    const cancelButton = screen.getAllByRole('button', { name: 'Cancel' }).at(-1);
    if (!cancelButton) throw new Error('the dialog has no Cancel button');
    await userEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('offers to turn on a turned-off kind', async () => {
    const { onOpen } = renderConfirmation(
      pendingFile({ isKindDisabled: true, workspace: { ...pendingFile().workspace, kindId: 'notes' } }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Turn On Notes and Open' }));

    expect(onOpen).toHaveBeenCalled();
  });

  it('says when a workspace makes nothing readable', () => {
    renderConfirmation(pendingFile({ workspace: { ...pendingFile().workspace, roots: [], favourites: [] } }));

    expect(screen.getByText('This workspace lists no folders or files.')).toBeTruthy();
  });
});
