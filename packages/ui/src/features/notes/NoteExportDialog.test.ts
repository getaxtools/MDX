import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ViewerCommand } from '../viewer/viewerCommands';
import NoteExportDialog from './NoteExportDialog.svelte';
import type { NoteExportView } from './NoteTransferActions';

const CHOOSING: NoteExportView = {
  notes: { kind: 'folder', path: 'E:\\Journal\\Projects' },
  name: 'Projects',
  isDestinationRefused: false,
  useRelativeLinks: false,
  isExporting: false,
};

function renderDialog(view: NoteExportView) {
  const onCommand = vi.fn<(command: ViewerCommand) => void>();
  render(NoteExportDialog, { view, translator: createTranslator(), onCommand });
  return { onCommand };
}

describe('NoteExportDialog', () => {
  it('can export only once a folder is chosen', async () => {
    const { onCommand } = renderDialog(CHOOSING);

    await userEvent.click(screen.getByRole('button', { name: 'Choose Folder…' }));

    expect(screen.getByRole('dialog', { name: 'Export Projects' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export' }).hasAttribute('disabled')).toBe(true);
    expect(onCommand).toHaveBeenCalledWith({ kind: 'chooseNotesExportFolder' });
  });

  it('turns relative links on with the keyboard and exports', async () => {
    const { onCommand } = renderDialog({ ...CHOOSING, destination: 'D:\\Exports' });

    screen.getByRole('checkbox', { name: 'Use relative links' }).focus();
    await userEvent.keyboard(' ');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(onCommand.mock.calls).toEqual([
      [{ kind: 'setNotesExportRelativeLinks', isOn: true }],
      [{ kind: 'startNotesExport' }],
    ]);
  });

  it('says when the folder is inside the notes folder', () => {
    renderDialog({ ...CHOOSING, isDestinationRefused: true });

    expect(screen.getByRole('alert').textContent).toContain('outside the notes folder');
  });

  it('asks before replacing files already in the folder', async () => {
    const { onCommand } = renderDialog({ ...CHOOSING, destination: 'D:\\Exports', existingFileCount: 2 });

    await userEvent.click(screen.getByRole('button', { name: 'Replace' }));

    expect(screen.getByRole('alert').textContent).toBe('2 files are already in that folder. Replace them?');
    expect(onCommand).toHaveBeenCalledWith({ kind: 'replaceExportedNotes' });
  });

  it('says how many files went where', () => {
    renderDialog({
      ...CHOOSING,
      destination: 'D:\\Exports',
      summary: {
        exportedFiles: 3,
        folder: 'D:\\Exports\\Projects',
        attachmentsLeftOut: 0,
        excludedLeftOut: 1,
        failedFiles: [],
      },
    });

    expect(screen.getByRole('status').textContent).toBe('3 files were exported to D:\\Exports\\Projects.');
    expect(screen.getByText('1 file under an excluded path was left out.')).toBeTruthy();
  });
});
