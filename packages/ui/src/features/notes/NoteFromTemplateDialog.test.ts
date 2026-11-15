import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
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

  it('says where templates go when there are none', () => {
    renderDialog([]);

    expect(
      screen.getByText('Put notes in the Templates folder of your notes to use them as templates.'),
    ).toBeTruthy();
  });
});
