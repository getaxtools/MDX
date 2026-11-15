import { createTranslator } from '@mdx/i18n';
import type { NoteTrashEntry } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ViewerCommand } from '../viewer/viewerCommands';
import NoteTrashDialog from './NoteTrashDialog.svelte';

const NOVEMBER_14 = Date.UTC(2026, 10, 14, 9, 30);

const ENTRIES: readonly NoteTrashEntry[] = [
  {
    id: '2-Plan',
    name: 'Plan',
    originalPath: 'Projects/Work/Plan.md',
    deletedAtMs: NOVEMBER_14,
    hasChildNotes: true,
  },
  { id: '1-Inbox', name: 'Inbox', originalPath: 'Inbox.md', deletedAtMs: NOVEMBER_14, hasChildNotes: false },
];

function renderDialog(entries: readonly NoteTrashEntry[] = ENTRIES) {
  const onCommand = vi.fn<(command: ViewerCommand) => void>();
  render(NoteTrashDialog, { entries, translator: createTranslator(), onCommand, onClose: vi.fn() });
  return { onCommand };
}

describe('NoteTrashDialog', () => {
  it('lists deleted notes with their place', () => {
    renderDialog();

    const items = screen.getAllByRole('listitem').map((item) => item.textContent.replaceAll(/\s+/g, ' '));

    expect(items[0]).toContain('Plan');
    expect(items[0]).toContain('Was in Projects › Work');
    expect(items[0]).toContain('With its child notes');
    expect(items[1]).toContain('Was at the top of your notes folder');
    expect(items[1]).toContain('Deleted Nov 14, 2026');
  });

  it('restores a note by its own button', async () => {
    const { onCommand } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Restore Inbox' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'restoreNote', entryId: '1-Inbox' });
  });

  it('empties the trash only after a second, explicit choice', async () => {
    const { onCommand } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Empty Trash…' }));
    expect(onCommand).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Empty Trash' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'emptyNoteTrash' });
  });

  it('says when the trash is empty', () => {
    renderDialog([]);

    expect(screen.getByText('The trash is empty.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Empty Trash…' })).toBeNull();
  });
});
