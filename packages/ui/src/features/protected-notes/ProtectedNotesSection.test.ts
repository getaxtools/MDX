import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ViewerCommand } from '../viewer/viewerCommands';
import type { ProtectedNotesView } from './ProtectedNotesActions';
import ProtectedNotesSection from './ProtectedNotesSection.svelte';

const NOT_SET_UP: ProtectedNotesView = {
  state: 'notSetUp',
  canUnlockOnThisPc: false,
  notes: [],
  isBusy: false,
};
const UNLOCKED_EMPTY: ProtectedNotesView = { ...NOT_SET_UP, state: 'unlocked' };
const BANK_DETAILS = {
  noteId: 'a'.repeat(32),
  title: 'Bank details',
  canonicalKey: `protected:c:\\notes|${'a'.repeat(32)}`,
};
const PASSPORT = {
  noteId: 'b'.repeat(32),
  title: 'Passport',
  canonicalKey: `protected:c:\\notes|${'b'.repeat(32)}`,
};

function renderSection(view: ProtectedNotesView) {
  const onCommand = vi.fn<(command: ViewerCommand) => void>();
  render(ProtectedNotesSection, {
    view,
    translator: createTranslator(),
    isExpanded: true,
    onToggleExpanded: vi.fn(),
    activeDocumentKey: BANK_DETAILS.canonicalKey,
    onCommand,
  });
  return { onCommand };
}

describe('ProtectedNotesSection', () => {
  it('offers to protect notes when the workspace has no section', async () => {
    const { onCommand } = renderSection(NOT_SET_UP);

    await userEvent.click(screen.getByRole('button', { name: 'Protect Notes…' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'showProtectedSetUp' });
  });

  it('names an unlocked section as unlocked in its heading', () => {
    renderSection(UNLOCKED_EMPTY);

    expect(screen.getByRole('heading', { name: 'Protected notes Unlocked' })).toBeTruthy();
    expect(screen.getByText('No protected notes yet.')).toBeTruthy();
  });

  it('names a locked section as locked, and lists nothing', () => {
    renderSection({ ...NOT_SET_UP, state: 'locked' });

    expect(screen.getByRole('heading', { name: 'Protected notes Locked' })).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('opens a protected note from the list and marks the one shown', async () => {
    const { onCommand } = renderSection({ ...UNLOCKED_EMPTY, notes: [BANK_DETAILS, PASSPORT] });

    await userEvent.click(screen.getByRole('button', { name: 'Passport' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'openProtectedNote', noteId: PASSPORT.noteId });
    expect(screen.getByRole('button', { name: 'Bank details' }).getAttribute('aria-current')).toBe('page');
  });

  it('creates a protected note with the typed title', async () => {
    const { onCommand } = renderSection(UNLOCKED_EMPTY);

    await userEvent.click(screen.getByRole('button', { name: 'New Protected Note' }));
    await userEvent.type(screen.getByLabelText('Title of the new protected note'), 'Passport{Enter}');

    expect(onCommand).toHaveBeenCalledWith({ kind: 'createProtectedNote', title: 'Passport' });
  });

  it.each([
    ['olderNotes', 'This protected section is older than when this PC last opened it.'],
    ['changedVault', 'An old password may open it again.'],
    ['checkUnavailable', 'MDX could not check whether this protected section is older'],
  ] as const)('shows the %s folder warning in place of the notes', (folderWarning, wording) => {
    renderSection({ ...UNLOCKED_EMPTY, folderWarning });

    expect(screen.getByRole('alert').textContent).toContain(wording);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('button', { name: 'New Protected Note' })).toBeNull();
  });

  it('keeps the folder only from the warning’s own button', async () => {
    const { onCommand } = renderSection({ ...UNLOCKED_EMPTY, folderWarning: 'olderNotes' });

    await userEvent.click(screen.getByRole('button', { name: 'Protected notes Unlocked' }));
    await userEvent.keyboard('{Enter}');
    expect(onCommand).not.toHaveBeenCalledWith({ kind: 'acceptProtectedFolder' });
    await userEvent.click(screen.getByRole('button', { name: 'Keep This Folder' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'acceptProtectedFolder' });
  });

  it('offers Forget This PC only while this PC remembers the section', async () => {
    const { onCommand } = renderSection({ ...UNLOCKED_EMPTY, canUnlockOnThisPc: true });

    await userEvent.click(screen.getByRole('button', { name: 'Forget This PC' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'forgetProtectedOnThisPc' });
  });

  it('does not offer Forget This PC to a section this PC does not remember', () => {
    renderSection(UNLOCKED_EMPTY);

    expect(screen.queryByRole('button', { name: 'Forget This PC' })).toBeNull();
  });
});
