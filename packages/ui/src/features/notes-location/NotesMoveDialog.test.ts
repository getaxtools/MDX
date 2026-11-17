import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ViewerCommand } from '../viewer/viewerCommands';
import type { NotesMoveDialog as MoveDialog } from './NotesMoveActions';
import NotesMoveDialog from './NotesMoveDialog.svelte';

const OLD_COPY = { locationId: 'location-1', path: 'C:\\Notes', fileCount: 1240, totalBytes: 3 * 1024 ** 2 };

function renderDialog(dialog: MoveDialog) {
  const onCommand = vi.fn<(command: ViewerCommand) => void>();
  render(NotesMoveDialog, { dialog, translator: createTranslator(), onCommand });
  return { onCommand };
}

describe('NotesMoveDialog', () => {
  it('Enter on the removal offer keeps the old copy', async () => {
    const { onCommand } = renderDialog({ kind: 'removalOffer', target: 'E:\\Notes', oldCopy: OLD_COPY });

    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('alertdialog', { name: 'Your notes are now in E:\\Notes' })).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Keep the Old Copy');
    expect(onCommand).toHaveBeenCalledWith({ kind: 'keepOldNotesCopy' });
  });

  it('shows the old folder, its file count and size in the removal offer', () => {
    renderDialog({ kind: 'removalOffer', target: 'E:\\Notes', oldCopy: OLD_COPY });

    expect(screen.getByRole('alertdialog').textContent).toContain(
      'The old copy is still in C:\\Notes: 1,240 files, 3 MB.',
    );
  });

  it('the second confirmation also starts on Keep, and only its own button removes', async () => {
    const { onCommand } = renderDialog({ kind: 'removalConfirmation', oldCopy: OLD_COPY });

    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Move to Recycle Bin' }));

    expect(onCommand.mock.calls.map(([command]) => command.kind)).toEqual([
      'keepOldNotesCopy',
      'removeOldNotesCopy',
    ]);
  });

  it('the plan says how much is downloaded when files are online only', () => {
    renderDialog({
      kind: 'plan',
      target: 'E:\\Notes',
      plan: {
        fileCount: 3,
        totalBytes: 2048,
        onlineOnlyCount: 1,
        onlineOnlyBytes: 1024,
        availableBytes: 10_000,
      },
    });

    const dialog = screen.getByRole('alertdialog', { name: 'Move your notes to E:\\Notes?' });
    expect(dialog.textContent).toContain('MDX copies 3 files (2 kB)');
    expect(dialog.textContent).toContain(
      '1 file is kept online only by OneDrive, so copying downloads 1 kB.',
    );
  });

  it('an unfinished move offers Resume, Cancel Move and Later, with Later focused', async () => {
    const { onCommand } = renderDialog({
      kind: 'resume',
      source: 'C:\\Notes',
      target: 'E:\\Notes',
      problem: { key: 'notesLocation.move.problem.diskFull', values: { path: 'Plan.md' } },
    });

    await userEvent.keyboard('{Enter}');

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Resume',
      'Cancel Move',
      'Later',
    ]);
    expect(screen.getByRole('alertdialog').textContent).toContain(
      'The drive of the new folder is full. MDX stopped at Plan.md.',
    );
    expect(onCommand).toHaveBeenCalledWith({ kind: 'postponeNotesMove' });
  });
  it('closing during a move starts on Keep Moving, which Escape also chooses', async () => {
    const { onCommand } = renderDialog({ kind: 'closeDuringMove', source: 'C:\\Notes' });

    await userEvent.keyboard('{Escape}');

    expect(document.activeElement?.textContent).toBe('Keep Moving');
    expect(screen.getByRole('button', { name: 'Stop and Close' })).toBeTruthy();
    expect(onCommand).toHaveBeenCalledWith({ kind: 'keepMovingNotes' });
  });
});
