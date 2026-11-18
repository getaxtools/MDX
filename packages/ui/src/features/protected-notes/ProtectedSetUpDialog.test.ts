import { createTranslator, type MessageKey } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ViewerCommand } from '../viewer/viewerCommands';
import ProtectedSetUpDialog from './ProtectedSetUpDialog.svelte';

const RECOVERY_KEY = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789-ABCD-EFGH-JKMN-PQRS-TV1Z-7Q';

interface DialogState {
  readonly recoveryKey?: string;
  readonly isRecoveryKeyCovered?: boolean;
  readonly problem?: MessageKey;
  readonly isBusy?: boolean;
}

function renderDialog({
  recoveryKey,
  isRecoveryKeyCovered = false,
  problem,
  isBusy = false,
}: DialogState = {}) {
  const onCommand = vi.fn<(command: ViewerCommand) => void>();
  const onClose = vi.fn();
  render(ProtectedSetUpDialog, {
    recoveryKey,
    isRecoveryKeyCovered,
    problem,
    isBusy,
    translator: createTranslator(),
    onCommand,
    onClose,
  });
  return { onCommand, onClose };
}

async function choosePasswords(password: string, repeated: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.type(screen.getByLabelText('Password again'), repeated);
  await userEvent.click(screen.getByRole('button', { name: 'Protect Notes' }));
}

describe('ProtectedSetUpDialog', () => {
  it('first says that nobody can recover the notes without the password or the recovery key', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Protect Notes' }).textContent).toContain(
      'nobody can open these notes again, not even the makers of MDX',
    );
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('refuses a password shorter than 10 characters and says why', async () => {
    const { onCommand } = renderDialog();

    await choosePasswords('123456789', '123456789');

    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('The password needs at least 10 characters.');
    expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe('true');
  });

  it('refuses two different passwords', async () => {
    const { onCommand } = renderDialog();

    await choosePasswords('correct horse battery', 'correct horse batterY');

    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('The two passwords are not the same.');
  });

  it('sets up the section with the password typed twice, and clears the fields', async () => {
    const { onCommand } = renderDialog();

    await choosePasswords('correct horse battery', 'correct horse battery');

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'setUpProtectedSection',
      password: 'correct horse battery',
    });
    expect(screen.getByLabelText<HTMLInputElement>('Password').value).toBe('');
  });

  it('asks for a new password, so no saved password is filled in', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByLabelText('Password again').getAttribute('autocomplete')).toBe('new-password');
  });

  it('warns against copying the recovery key', () => {
    renderDialog({ recoveryKey: RECOVERY_KEY });

    expect(screen.getByText(/Write the key down rather than copying it/)).toBeTruthy();
  });

  it('empties the confirmation field after each try', async () => {
    renderDialog({ recoveryKey: RECOVERY_KEY });
    const field = screen.getByLabelText<HTMLInputElement>('Type the last two groups of the recovery key');

    await userEvent.type(field, 'TV1Z-7R');
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(field.value).toBe('');
  });

  it('covers the recovery key while the section is locked, and can then be closed', async () => {
    const { onClose } = renderDialog({ isRecoveryKeyCovered: true });

    expect(screen.queryByLabelText('Recovery key')).toBeNull();
    expect(screen.getByRole('dialog').textContent).toContain('Unlock them to see the recovery key again');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('shows why set-up failed', async () => {
    renderDialog({ problem: 'protectedNotes.setUp.alreadySetUp' });

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('alert').textContent).toBe('This notes folder already has a protected section.');
  });

  it('shows the recovery key and finishes once its last two groups are typed back', async () => {
    const { onCommand } = renderDialog({ recoveryKey: RECOVERY_KEY });

    expect(screen.getByLabelText('Recovery key').textContent).toBe(RECOVERY_KEY);
    await userEvent.type(screen.getByLabelText('Type the last two groups of the recovery key'), 'TV1Z-7Q');
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'finishProtectedSetUp' });
  });

  it('keeps the recovery key on screen after a wrong confirmation', async () => {
    const { onCommand } = renderDialog({ recoveryKey: RECOVERY_KEY });

    await userEvent.type(screen.getByLabelText('Type the last two groups of the recovery key'), 'TV1Z-7R');
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('That is not how the recovery key ends.');
    expect(screen.getByLabelText('Recovery key').textContent).toBe(RECOVERY_KEY);
  });

  it('cannot be closed while the recovery key is shown', async () => {
    const { onClose } = renderDialog({ recoveryKey: RECOVERY_KEY });

    await userEvent.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('can be cancelled before set-up starts', async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
  });
});
