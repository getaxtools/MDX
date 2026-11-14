import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import NotesLocationStep from './NotesLocationStep.svelte';
import type { NotesSetup } from './WorkspaceActions';

const DOCUMENTS = 'C:\\Users\\Ana\\Documents';

function renderStep(setup: Partial<NotesSetup> = {}, workspaceName = 'Journal', picked?: string) {
  const onPickFolder = vi.fn(() => Promise.resolve(picked));
  render(NotesLocationStep, {
    setup: { documents: DOCUMENTS, syncedFolders: [], claimedPaths: [], ...setup },
    workspaceName,
    translator: createTranslator(),
    onPickFolder,
    locationPath: undefined,
  });
  return { onPickFolder };
}

const shownPath = () =>
  screen.getByRole('group', { name: 'Notes folder' }).querySelector('code')?.textContent;

describe('NotesLocationStep', () => {
  it('shows the resolved default path', () => {
    renderStep();

    expect(shownPath()).toBe('C:\\Users\\Ana\\Documents\\MDX Notes');
  });

  it('suggests MDX Notes - Work for a workspace named Work', () => {
    renderStep({ claimedPaths: ['C:\\Users\\Ana\\Documents\\MDX Notes'] }, 'Work');

    expect(shownPath()).toBe('C:\\Users\\Ana\\Documents\\MDX Notes - Work');
  });

  it('shows the OneDrive notice', () => {
    renderStep({
      documents: 'C:\\Users\\Ana\\OneDrive\\Documents',
      syncedFolders: ['C:\\Users\\Ana\\OneDrive'],
    });

    expect(screen.getByText(/OneDrive backs up this folder/)).toBeTruthy();
  });

  it('says why a folder another Notes workspace uses cannot be chosen', async () => {
    renderStep({ claimedPaths: ['D:\\Journal'] }, 'Work', 'D:\\Journal\\Inner');

    await userEvent.click(screen.getByRole('button', { name: 'Choose Another Folder…' }));

    expect(screen.getByRole('alert').textContent.trim()).toBe(
      "This folder is inside another Notes workspace's folder.",
    );
  });

  it('uses a picked folder, and can go back to the default', async () => {
    const { onPickFolder } = renderStep({}, 'Journal', 'E:\\My notes');

    await userEvent.click(screen.getByRole('button', { name: 'Choose Another Folder…' }));
    const pickedPath = shownPath();
    await userEvent.click(screen.getByRole('button', { name: 'Use the Default Folder' }));

    expect(onPickFolder).toHaveBeenCalledOnce();
    expect(pickedPath).toBe('E:\\My notes');
    expect(shownPath()).toBe('C:\\Users\\Ana\\Documents\\MDX Notes');
  });

  it('asks for a folder when Documents cannot be found', () => {
    renderStep({ documents: undefined });

    expect(screen.getByRole('alert').textContent.trim()).toBe(
      'MDX could not find your Documents folder. Choose a folder for your notes.',
    );
  });
});
