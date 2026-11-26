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
  const translator = createTranslator();
  const { rerender } = render(NoteExportDialog, { view, translator, onCommand });
  return { onCommand, showView: (next: NoteExportView) => rerender({ view: next, translator, onCommand }) };
}

const SUMMARY: NonNullable<NoteExportView['summary']> = {
  exportedFiles: 3,
  folder: 'D:\\Exports\\Projects',
  attachmentsLeftOut: 0,
  excludedLeftOut: 1,
  failedFiles: [],
};

describe('NoteExportDialog', () => {
  it('opens in the shared frame with a header close, a quiet cancel and export as the one primary', async () => {
    const { onCommand } = renderDialog({ ...CHOOSING, destination: 'D:\\Exports' });

    const close = screen.getByRole('button', { name: 'Close' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(close.getAttribute('title')).toBe('Close (Esc)');
    expect(screen.getByRole('button', { name: 'Export' }).classList.contains('primary')).toBe(true);
    expect(onCommand).toHaveBeenCalledWith({ kind: 'closeNotesTransfer' });
  });

  it('asking to replace moves focus to cancel, so a second enter does not replace the files', async () => {
    const { onCommand, showView } = renderDialog({ ...CHOOSING, destination: 'D:\\Exports' });
    screen.getByRole('button', { name: 'Export' }).focus();

    await showView({ ...CHOOSING, destination: 'D:\\Exports', existingFileCount: 2 });
    await userEvent.keyboard('{Enter}');

    expect(onCommand).not.toHaveBeenCalledWith({ kind: 'replaceExportedNotes' });
    expect(onCommand).toHaveBeenCalledWith({ kind: 'closeNotesTransfer' });
  });

  it('the summary offers only the header close, and esc still closes after export took focus', async () => {
    const { onCommand, showView } = renderDialog({ ...CHOOSING, destination: 'D:\\Exports' });
    screen.getByRole('button', { name: 'Export' }).focus();

    await showView({ ...CHOOSING, destination: 'D:\\Exports', summary: SUMMARY });
    await userEvent.keyboard('{Escape}');

    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Close',
    ]);
    expect(onCommand).toHaveBeenCalledWith({ kind: 'closeNotesTransfer' });
  });

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
    renderDialog({ ...CHOOSING, destination: 'D:\\Exports', summary: SUMMARY });

    expect(screen.getByRole('status').textContent).toBe('3 files were exported to D:\\Exports\\Projects.');
    expect(screen.getByText('1 file under an excluded path was left out.')).toBeTruthy();
  });
});
