import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import WordGoalDialog from './WordGoalDialog.svelte';

function renderDialog(currentGoal?: number) {
  const onCommand = vi.fn();
  const onClose = vi.fn();
  render(WordGoalDialog, { currentGoal, translator: createTranslator(), onCommand, onClose });
  return {
    onCommand,
    onClose,
    input: screen.getByRole('textbox', { name: 'Words to write in this document' }),
  };
}

describe('WordGoalDialog', () => {
  it('sets the typed goal', async () => {
    const { onCommand, input } = renderDialog();

    await userEvent.type(input, '1500{Enter}');

    expect(onCommand).toHaveBeenCalledWith({ kind: 'setWordGoal', goal: 1500 });
  });

  it('goal 0 is refused with a reason', async () => {
    const { onCommand, input } = renderDialog();

    await userEvent.type(input, '0{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent.trim()).toBe('Enter a whole number from 1 to 1,000,000.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the current goal and offers to clear it', async () => {
    const { onCommand, input } = renderDialog(800);

    await userEvent.click(screen.getByRole('button', { name: 'Clear Word Goal' }));

    expect((input as HTMLInputElement).value).toBe('800');
    expect(onCommand).toHaveBeenCalledWith({ kind: 'clearWordGoal' });
  });

  it('opens in the shared frame with the goal focused, cancel and set goal in the footer', () => {
    const { input } = renderDialog(800);
    const close = screen.getByRole('button', { name: 'Close' });

    expect(document.activeElement).toBe(input);
    expect(close.closest('header')).not.toBeNull();
    expect(close.title).toBe('Close (Esc)');
    expect(screen.getAllByRole('button').map((button) => button.textContent.trim())).toEqual([
      '',
      'Clear Word Goal',
      'Cancel',
      'Set Goal',
    ]);
  });

  it('set goal sets the typed goal', async () => {
    const { onCommand, input } = renderDialog();

    await userEvent.type(input, '250');
    await userEvent.click(screen.getByRole('button', { name: 'Set Goal' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'setWordGoal', goal: 250 });
  });

  it('cancel closes without setting a goal', async () => {
    const { onCommand, onClose, input } = renderDialog();

    await userEvent.type(input, '250');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('enter on clear word goal clears the goal instead of setting it', async () => {
    const { onCommand } = renderDialog(800);

    screen.getByRole('button', { name: 'Clear Word Goal' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand).toHaveBeenCalledWith({ kind: 'clearWordGoal' });
  });
});
