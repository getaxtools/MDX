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
  const { rerender } = render(ProtectedSetUpDialog, {
    recoveryKey,
    isRecoveryKeyCovered,
    problem,
    isBusy,
    translator: createTranslator(),
    onCommand,
    onClose,
  });
  return { onCommand, onClose, rerender };
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

  it('a second protect notes right after set-up started sends nothing more', async () => {
    const { onCommand } = renderDialog();
    await choosePasswords('correct horse battery', 'correct horse battery');

    await userEvent.click(screen.getByRole('button', { name: 'Protect Notes' }));

    expect(onCommand).toHaveBeenCalledTimes(1);
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

  it('opens in the shared frame with a header close, a quiet cancel and continue as the one primary', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Close' }).title).toBe('Close (Esc)');
    expect(screen.getByRole('button', { name: 'Cancel' }).classList.contains('primary')).toBe(false);
    expect(screen.getByRole('button', { name: 'Continue' }).classList.contains('primary')).toBe(true);
  });

  it('after continue, focus is in the password field and protect notes is the primary', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(document.activeElement).toBe(screen.getByLabelText('Password'));
    expect(screen.getByRole('button', { name: 'Protect Notes' }).classList.contains('primary')).toBe(true);
  });

  it('enter in the second password field sets up the section', async () => {
    const { onCommand } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.type(screen.getByLabelText('Password again'), 'correct horse battery{Enter}');

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'setUpProtectedSection',
      password: 'correct horse battery',
    });
    expect(screen.getByLabelText<HTMLInputElement>('Password').value).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('Password again').value).toBe('');
  });

  it('enter in the first password field with the second still empty says the passwords are not the same', async () => {
    const { onCommand } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('The two passwords are not the same.');
  });

  it('enter in the first password field sets up the section once both match', async () => {
    const { onCommand } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(screen.getByLabelText('Password again'), 'correct horse battery');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery{Enter}');

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'setUpProtectedSection',
      password: 'correct horse battery',
    });
  });

  it('enter in the confirmation field finishes once the end is right', async () => {
    const { onCommand } = renderDialog({ recoveryKey: RECOVERY_KEY });

    await userEvent.type(
      screen.getByLabelText('Type the last two groups of the recovery key'),
      'TV1Z-7Q{Enter}',
    );

    expect(onCommand).toHaveBeenCalledWith({ kind: 'finishProtectedSetUp' });
  });

  it('enter with a wrong end in the confirmation field keeps the recovery key on screen', async () => {
    const { onCommand } = renderDialog({ recoveryKey: RECOVERY_KEY });

    await userEvent.type(
      screen.getByLabelText('Type the last two groups of the recovery key'),
      'TV1Z-7R{Enter}',
    );

    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('That is not how the recovery key ends.');
    expect(screen.getByLabelText('Recovery key').textContent).toBe(RECOVERY_KEY);
  });

  it('while the recovery key is shown, finish is the only button', () => {
    renderDialog({ recoveryKey: RECOVERY_KEY });

    expect(screen.getAllByRole('button').map((button) => button.textContent.trim())).toEqual(['Finish']);
  });

  it('the covered recovery key offers only the header close', () => {
    renderDialog({ isRecoveryKeyCovered: true });

    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Close',
    ]);
  });

  it('can be cancelled before set-up starts', async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('focus starts on continue', () => {
    renderDialog();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Continue' }));
  });

  it('while the section is being set up, the disabled primary says so and nothing closes', async () => {
    const { onCommand, onClose, rerender } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.type(screen.getByLabelText('Password again'), 'correct horse battery');

    await rerender({ isBusy: true });
    screen.getByRole('region', { name: 'Protect Notes' }).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: 'Setting up…' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Password').disabled).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Password again').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the confirmation field neither suggests earlier entries nor checks spelling', () => {
    renderDialog({ recoveryKey: RECOVERY_KEY });
    const field = screen.getByLabelText('Type the last two groups of the recovery key');

    expect(field.getAttribute('autocomplete')).toBe('off');
    expect(field.getAttribute('spellcheck')).toBe('false');
  });

  it('when the section locks while the key is shown, focus moves to close and esc closes', async () => {
    const { onClose, rerender } = renderDialog({ recoveryKey: RECOVERY_KEY });

    await rerender({ recoveryKey: undefined, isRecoveryKeyCovered: true });

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('after a failed set-up, focus returns to the password field', async () => {
    const { rerender } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await rerender({ isBusy: true });
    // WebView2 drops focus from a field once it is disabled; jsdom keeps it there.
    screen.getByLabelText('Password').blur();
    await rerender({ isBusy: false, problem: 'protectedNotes.setUp.alreadySetUp' });

    expect(document.activeElement).toBe(screen.getByLabelText('Password'));
    expect(screen.getByRole('alert').textContent).toBe('This notes folder already has a protected section.');
  });
});
