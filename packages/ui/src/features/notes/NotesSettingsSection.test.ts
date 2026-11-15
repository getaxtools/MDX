import { DEFAULT_NOTES_SETTINGS } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { ViewerCommand } from '../viewer/viewerCommands';
import NotesSettingsSection from './NotesSettingsSection.svelte';

function renderSection() {
  const onCommand = vi.fn<(command: ViewerCommand) => void>();
  render(NotesSettingsSection, {
    folder: 'E:\\Journal',
    settings: DEFAULT_NOTES_SETTINGS,
    isDeletionConfirmed: true,
    translator: createTranslator(),
    onCommand,
  });
  return { onCommand };
}

describe('NotesSettingsSection', () => {
  it('saves a new daily folder and keeps the other settings', async () => {
    const { onCommand } = renderSection();

    await fireEvent.change(screen.getByRole('textbox', { name: 'Daily notes folder' }), {
      target: { value: 'Journal/Days' },
    });

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'updateNotesSettings',
      settings: { ...DEFAULT_NOTES_SETTINGS, dailyFolder: 'Journal/Days' },
    });
  });

  it('a folder outside the notes folder is not saved and says why', async () => {
    const { onCommand } = renderSection();
    const input = screen.getByRole('textbox', { name: 'Daily notes folder' });

    await fireEvent.change(input, { target: { value: '../Outside' } });

    expect(onCommand).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('Use folder names inside your notes folder');
  });

  it('a daily template is saved, and an empty one is removed', async () => {
    const { onCommand } = renderSection();
    const input = screen.getByRole('textbox', { name: 'Daily note template' });

    await fireEvent.change(input, { target: { value: 'Day' } });
    await fireEvent.change(input, { target: { value: '' } });

    expect(onCommand).toHaveBeenNthCalledWith(1, {
      kind: 'updateNotesSettings',
      settings: { ...DEFAULT_NOTES_SETTINGS, dailyTemplate: 'Day' },
    });
    expect(onCommand).toHaveBeenNthCalledWith(2, {
      kind: 'updateNotesSettings',
      settings: DEFAULT_NOTES_SETTINGS,
    });
  });

  it('saves excluded paths typed one per line', async () => {
    const { onCommand } = renderSection();
    const field = screen.getByRole('textbox', { name: 'Leave out of search and links' });

    await fireEvent.change(field, { target: { value: 'Private\nWork\\Reviews\n' } });

    expect(field.getAttribute('aria-describedby')).toBe('settings-notes-excluded-paths-description');
    expect(onCommand).toHaveBeenCalledWith({
      kind: 'updateNotesSettings',
      settings: { ...DEFAULT_NOTES_SETTINGS, excludedPaths: ['Private', 'Work/Reviews'] },
    });
  });

  it('an excluded path outside the notes folder is not saved and says why', async () => {
    const { onCommand } = renderSection();
    const field = screen.getByRole('textbox', { name: 'Leave out of search and links' });

    await fireEvent.change(field, { target: { value: 'Private\n../Outside' } });

    expect(onCommand).not.toHaveBeenCalled();
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('up to 100 lines');
  });
});
