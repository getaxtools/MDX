import { createTranslator } from '@mdx/i18n';
import type { NotesFolderInspection } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import NotesLocationStep from './NotesLocationStep.svelte';
import type { NotesSetup } from './WorkspaceActions';

const DOCUMENTS = 'C:\\Users\\Ana\\Documents';

interface StepOptions {
  readonly workspaceName?: string;
  readonly picked?: string;
  readonly inspections?: Readonly<Record<string, NotesFolderInspection>>;
}

function renderStep(
  setup: Partial<NotesSetup> = {},
  { workspaceName = 'Journal', picked, inspections = {} }: StepOptions = {},
) {
  const onPickFolder = vi.fn(() => Promise.resolve(picked));
  const onInspectFolder = (path: string) => Promise.resolve(inspections[path] ?? 'empty');
  render(NotesLocationStep, {
    setup: { documents: DOCUMENTS, syncedFolders: [], claimedPaths: [], ...setup },
    workspaceName,
    translator: createTranslator(),
    onPickFolder,
    onInspectFolder,
    locationPath: undefined,
  });
  return { onPickFolder };
}

const chooseAnotherFolder = () =>
  userEvent.click(screen.getByRole('button', { name: 'Choose Another Folder…' }));

const shownPath = () =>
  screen.getByRole('group', { name: 'Notes folder' }).querySelector('code')?.textContent;

describe('NotesLocationStep', () => {
  it('shows the resolved default path', () => {
    renderStep();

    expect(shownPath()).toBe('C:\\Users\\Ana\\Documents\\MDX Notes');
  });

  it('suggests MDX Notes - Work for a workspace named Work', () => {
    renderStep({ claimedPaths: ['C:\\Users\\Ana\\Documents\\MDX Notes'] }, { workspaceName: 'Work' });

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
    renderStep({ claimedPaths: ['D:\\Journal'] }, { workspaceName: 'Work', picked: 'D:\\Journal\\Inner' });

    await userEvent.click(screen.getByRole('button', { name: 'Choose Another Folder…' }));

    expect(screen.getByRole('alert').textContent.trim()).toBe(
      "This folder is inside another Notes workspace's folder.",
    );
  });

  it('uses a picked folder, and can go back to the default', async () => {
    const { onPickFolder } = renderStep({}, { picked: 'E:\\My notes' });

    await userEvent.click(screen.getByRole('button', { name: 'Choose Another Folder…' }));
    const pickedPath = shownPath();
    await userEvent.click(screen.getByRole('button', { name: 'Use the Default Folder' }));

    expect(onPickFolder).toHaveBeenCalledOnce();
    expect(pickedPath).toBe('E:\\My notes');
    expect(shownPath()).toBe('C:\\Users\\Ana\\Documents\\MDX Notes');
  });

  it('says that only the app folder is added to a folder with files, and asks first', async () => {
    renderStep({}, { picked: 'E:\\Vault', inspections: { 'E:\\Vault': 'existingFiles' } });

    await chooseAnotherFolder();

    expect(
      await screen.findByText(
        'This folder already holds files. MDX adds only its own folder, .mdx-notes, and changes nothing else in it.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Use this folder with its files' }).checked,
    ).toBe(false);
  });

  it('refuses a drive root or the user folder and says why', async () => {
    renderStep({}, { picked: 'E:\\', inspections: { 'E:\\': 'refused' } });

    await chooseAnotherFolder();

    expect((await screen.findByRole('alert')).textContent.trim()).toBe(
      'MDX cannot keep notes in a whole drive or in your user folder. Choose a folder inside it.',
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('says that a folder that already is a Notes folder keeps its notes', async () => {
    renderStep({}, { picked: 'E:\\Journal', inspections: { 'E:\\Journal': 'notesLocation' } });

    await chooseAnotherFolder();

    expect(
      await screen.findByText('This folder is already a Notes folder. Its notes and index are kept.'),
    ).toBeTruthy();
  });

  it('asks again for the default folder when it already holds files', async () => {
    renderStep({}, { inspections: { [`${DOCUMENTS}\\MDX Notes`]: 'existingFiles' } });

    expect(await screen.findByRole('checkbox', { name: 'Use this folder with its files' })).toBeTruthy();
  });

  it('agreeing counts for that folder only, never for the next one picked', async () => {
    const pickedFolders = ['E:\\Vault', 'E:\\Archive'];
    render(NotesLocationStep, {
      setup: { documents: DOCUMENTS, syncedFolders: [], claimedPaths: [] },
      workspaceName: 'Journal',
      translator: createTranslator(),
      onPickFolder: () => Promise.resolve(pickedFolders.shift()),
      onInspectFolder: (path: string) => Promise.resolve(path.startsWith('E:') ? 'existingFiles' : 'empty'),
      locationPath: undefined,
    });
    await chooseAnotherFolder();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Use this folder with its files' }));

    await chooseAnotherFolder();

    await vi.waitFor(() => expect(shownPath()).toBe('E:\\Archive'));
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Use this folder with its files' }).checked,
    ).toBe(false);
  });

  it('asks first when the folder cannot be looked into', async () => {
    render(NotesLocationStep, {
      setup: { documents: DOCUMENTS, syncedFolders: [], claimedPaths: [] },
      workspaceName: 'Journal',
      translator: createTranslator(),
      onPickFolder: () => Promise.resolve(undefined),
      onInspectFolder: () => Promise.reject(new Error('The folder cannot be read')),
      locationPath: undefined,
    });

    expect(await screen.findByRole('checkbox', { name: 'Use this folder with its files' })).toBeTruthy();
  });

  it('keeps the answer for the shown folder when an earlier folder answers late', async () => {
    let answerForDefault: (inspection: NotesFolderInspection) => void = () => undefined;
    render(NotesLocationStep, {
      setup: { documents: DOCUMENTS, syncedFolders: [], claimedPaths: [] },
      workspaceName: 'Journal',
      translator: createTranslator(),
      onPickFolder: () => Promise.resolve('E:\\Vault'),
      onInspectFolder: (path: string) =>
        path === 'E:\\Vault'
          ? Promise.resolve('existingFiles')
          : new Promise<NotesFolderInspection>((resolve) => (answerForDefault = resolve)),
      locationPath: undefined,
    });
    await chooseAnotherFolder();
    await screen.findByRole('checkbox', { name: 'Use this folder with its files' });

    answerForDefault('empty');
    await Promise.resolve();

    const step = screen.getByRole('group', { name: 'Notes folder' });
    expect(step.getAttribute('aria-busy')).toBe('false');
    expect(screen.getByRole('checkbox', { name: 'Use this folder with its files' })).toBeTruthy();
  });

  it('says what is missing when Create is pressed before agreeing', async () => {
    render(NotesLocationStep, {
      setup: { documents: DOCUMENTS, syncedFolders: [], claimedPaths: [] },
      workspaceName: 'Journal',
      translator: createTranslator(),
      onPickFolder: () => Promise.resolve(undefined),
      onInspectFolder: () => Promise.resolve('existingFiles'),
      hasTriedToConfirm: true,
      locationPath: undefined,
    });

    expect((await screen.findByRole('alert')).textContent.trim()).toBe(
      'To keep your notes here, tick Use this folder with its files.',
    );
  });

  it('asks for a folder when Documents cannot be found', () => {
    renderStep({ documents: undefined });

    expect(screen.getByRole('alert').textContent.trim()).toBe(
      'MDX could not find your Documents folder. Choose a folder for your notes.',
    );
  });
});
