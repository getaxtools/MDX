import { createTranslator } from '@mdx/i18n';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ViewerCommand } from '../viewer/viewerCommands';
import NoteFromTemplateDialog from './NoteFromTemplateDialog.svelte';

function renderDialog(templates: readonly string[] = ['Day', 'Meeting']) {
  const onCommand = vi.fn<(command: ViewerCommand) => void>();
  const onClose = vi.fn();
  render(NoteFromTemplateDialog, {
    templates,
    templatesFolder: 'Templates',
    translator: createTranslator(),
    onCommand,
    onClose,
  });
  return { onCommand, onClose };
}

describe('NoteFromTemplateDialog', () => {
  it('creates a named note from the chosen template', async () => {
    const { onCommand, onClose } = renderDialog();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Template' }), 'Meeting');
    await userEvent.type(screen.getByRole('textbox', { name: 'Name of the new note' }), 'Standup{Enter}');

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'createNoteFromTemplate',
      template: 'Meeting',
      name: 'Standup',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('opens in the shared frame with the name focused and create waiting for a name', async () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'New Note from Template' });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    const create = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Create' });

    expect(close.title).toBe('Close (Esc)');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(create.disabled).toBe(true);
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name of the new note' })),
    );
    await userEvent.keyboard('Standup');
    expect(create.disabled).toBe(false);
  });

  it('enter without a name creates nothing', async () => {
    const { onCommand, onClose } = renderDialog();

    screen.getByRole('textbox', { name: 'Name of the new note' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('says where templates go when there are none', () => {
    renderDialog([]);
    const dialog = screen.getByRole('dialog', { name: 'New Note from Template' });

    expect(
      screen.getByText('Put notes in the Templates folder of your notes to use them as templates.'),
    ).toBeTruthy();
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Close']);
  });
});
