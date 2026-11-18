import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ViewerCommand } from '../viewer/viewerCommands';
import type { ProtectedNotesView } from './ProtectedNotesActions';
import ProtectedUnlockPanel from './ProtectedUnlockPanel.svelte';

const LOCKED: ProtectedNotesView = { state: 'locked', canUnlockOnThisPc: false, notes: [], isBusy: false };
const PASSWORD = 'correct horse battery';

function renderPanel(view: ProtectedNotesView = LOCKED) {
  const onCommand = vi.fn<(command: ViewerCommand) => void>();
  render(ProtectedUnlockPanel, { view, translator: createTranslator(), onCommand });
  return { onCommand };
}

describe('ProtectedUnlockPanel', () => {
  it('unlocks with the password, with Remember on this PC off by default', async () => {
    const { onCommand } = renderPanel();

    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Remember on this PC' }).checked).toBe(
      false,
    );
    await userEvent.type(screen.getByLabelText('Password'), `${PASSWORD}{Enter}`);

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'unlockProtectedSection',
      password: PASSWORD,
      shouldRemember: false,
    });
    expect(screen.getByLabelText<HTMLInputElement>('Password').value).toBe('');
  });

  it('remembers this PC only when the user chose it', async () => {
    const { onCommand } = renderPanel();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Remember on this PC' }));
    await userEvent.type(screen.getByLabelText('Password'), PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'unlockProtectedSection',
      password: PASSWORD,
      shouldRemember: true,
    });
  });

  it('explains what remembering means before it is chosen', async () => {
    renderPanel();
    const explanation = screen.getByText(/Anyone who uses your Windows account on this PC/);
    expect(explanation.hidden).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'What does this mean?' }));

    expect(explanation.hidden).toBe(false);
    expect(screen.getByRole('button', { name: 'What does this mean?' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(
      screen.getByRole('checkbox', { name: 'Remember on this PC' }).getAttribute('aria-describedby'),
    ).toBe('protected-remember-explained');
  });

  it('says only that the password did not open the notes', () => {
    renderPanel({ ...LOCKED, unlockProblem: 'protectedNotes.unlock.wrongPassword' });

    expect(screen.getByRole('alert').textContent.trim()).toBe(
      'That password did not open the protected notes.',
    );
    expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe('true');
  });

  it('cannot be sent again while a password is being checked', () => {
    renderPanel({ ...LOCKED, isBusy: true });

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Unlocking…' }).disabled).toBe(true);
  });

  it('unlocks with the recovery key and a new password typed twice', async () => {
    const { onCommand } = renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Use the Recovery Key' }));
    await userEvent.type(screen.getByLabelText('Recovery key'), 'ABCD-EFGH');
    await userEvent.type(screen.getByLabelText('New password'), 'a new long password');
    await userEvent.type(screen.getByLabelText('New password again'), 'a new long password');
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'unlockProtectedWithRecoveryKey',
      recoveryKey: 'ABCD-EFGH',
      newPassword: 'a new long password',
    });
  });

  it('refuses a new password that is too short before trying the recovery key', async () => {
    const { onCommand } = renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Use the Recovery Key' }));
    await userEvent.type(screen.getByLabelText('Recovery key'), 'ABCD-EFGH');
    await userEvent.type(screen.getByLabelText('New password'), 'short');
    await userEvent.type(screen.getByLabelText('New password again'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent.trim()).toBe('The password needs at least 10 characters.');
  });

  it('opens a remembered section with one action and no password', async () => {
    const { onCommand } = renderPanel({ ...LOCKED, canUnlockOnThisPc: true });

    expect(screen.queryByLabelText('Password')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'unlockProtectedOnThisPc' });
  });

  it('asks for the password once this PC no longer remembers the section', () => {
    renderPanel({ ...LOCKED, canUnlockOnThisPc: true, unlockProblem: 'protectedNotes.unlock.notRemembered' });

    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByRole('alert').textContent.trim()).toBe(
      'This PC no longer remembers the protected notes. Enter the password.',
    );
  });
});
