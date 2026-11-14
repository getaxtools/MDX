import { WorkspaceKindsState, WorkspaceRegistry, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import type { StoredWorkspace } from '@mdx/platform';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDialog } from './WorkspaceActions';
import WorkspaceDialogs from './WorkspaceDialogs.svelte';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });

function stored(id: string, kindId: string, name: string | null): StoredWorkspace {
  return { id, kindId, name, icon: null, colour: null, position: 0, lastShownAtMs: 0 };
}

function renderDialog(dialog: WorkspaceDialog, enabledKindIds: readonly string[] = ['markdownViewer']) {
  const onCommand = vi.fn();
  const onClose = vi.fn();
  render(WorkspaceDialogs, {
    dialog,
    workspaces: {
      registry: WorkspaceRegistry.fromStored([
        stored('default', 'markdownViewer', null),
        stored('h', 'markdownViewer', 'Handbook'),
      ]),
      shownWorkspaceId: 'default',
    },
    kinds: WorkspaceKindsState.fromSaved({ enabledKindIds, activeKindId: 'markdownViewer' }, ALL_KINDS_BUILT),
    translator: createTranslator(),
    onCommand,
    onClose,
  });
  return { onCommand, onClose };
}

describe('workspace dialogs', () => {
  it('creates a workspace with the typed name and the chosen kind', async () => {
    const { onCommand } = renderDialog('newWorkspace', ['markdownViewer', 'notes']);

    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Journal');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Kind' }), 'notes');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'createWorkspace',
      name: 'Journal',
      kindId: 'notes',
      icon: undefined,
      colour: undefined,
      isFolderStepChosen: false,
    });
  });

  it('creates a workspace with the chosen icon and colour, then the folder step', async () => {
    const { onCommand } = renderDialog('newWorkspace');

    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Reading');
    await userEvent.click(screen.getByRole('radio', { name: 'Book' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Teal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({ icon: 'book', colour: 'teal', isFolderStepChosen: true }),
    );
  });

  it('the colour always comes with the name', () => {
    renderDialog('newWorkspace');

    const colours = screen.getByRole('group', { name: 'Colour' });
    const labels = within(colours)
      .getAllByRole('radio')
      .map((radio) => radio.closest('label')?.textContent.trim());

    expect(labels).toEqual(['None', 'Blue', 'Teal', 'Green', 'Amber', 'Red', 'Purple', 'Grey']);
  });

  it('every icon choice has a name for screen readers', () => {
    renderDialog('newWorkspace');

    const icons = within(screen.getByRole('group', { name: 'Icon' })).getAllByRole('radio');

    expect(icons.map((radio) => radio.closest('label')?.textContent.trim())).toEqual([
      'None',
      'Book',
      'Notebook',
      'Folder',
      'Briefcase',
      'Flask',
      'Star',
    ]);
  });

  it('offers the folder step only for a Markdown viewer workspace', async () => {
    renderDialog('newWorkspace', ['markdownViewer', 'notes']);
    const folderStep = () =>
      screen.queryByRole('checkbox', { name: 'Choose a folder to show in this workspace' });

    const isOfferedForMarkdownViewer = folderStep() !== null;
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Kind' }), 'notes');

    expect(isOfferedForMarkdownViewer).toBe(true);
    expect(folderStep()).toBeNull();
  });

  it('rename offers no icon, colour or folder step', () => {
    renderDialog('renameWorkspace');

    expect(screen.queryByRole('group', { name: 'Colour' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('only enabled available kinds are choosable', () => {
    renderDialog('newWorkspace', ['markdownViewer', 'notes']);

    const options = screen.getAllByRole('option').map((option) => option.textContent.trim());

    expect(options).toEqual(['Markdown viewer', 'Notes']);
  });

  it('an invalid name shows the field message', async () => {
    const { onCommand } = renderDialog('newWorkspace');
    const name = screen.getByRole('textbox', { name: 'Name' });

    await userEvent.type(name, 'handbook{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent.trim()).toBe(
      'Another Markdown viewer workspace already has this name.',
    );
    expect(name.getAttribute('aria-invalid')).toBe('true');
  });

  it('an empty name is refused when confirming', async () => {
    const { onCommand } = renderDialog('newWorkspace');

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent.trim()).toBe('Enter a name.');
  });

  it('rename starts with the current name selected and keeps the workspace kind', async () => {
    const { onCommand } = renderDialog('renameWorkspace');
    const name = screen.getByRole('textbox', { name: 'Name' });

    expect((name as HTMLInputElement).value).toBe('Default');
    await vi.waitFor(() => expect(document.activeElement).toBe(name));
    expect(screen.queryByRole('combobox')).toBeNull();
    await userEvent.keyboard('Reading{Enter}');

    expect(onCommand).toHaveBeenCalledWith({ kind: 'renameWorkspace', name: 'Reading' });
  });

  it('Esc closes the dialog without changing anything', async () => {
    const { onCommand, onClose } = renderDialog('renameWorkspace');

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('the delete confirmation names what is forgotten and that files are kept', async () => {
    const { onCommand } = renderDialog('deleteWorkspace');

    const dialog = screen.getByRole('alertdialog', { name: 'Delete Default?' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete Workspace' }));

    expect(dialog.textContent).toContain('No file or folder on your PC is deleted or changed.');
    expect(onCommand).toHaveBeenCalledWith({ kind: 'deleteWorkspace' });
  });
});
