import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import WordGoalDialog from './WordGoalDialog.svelte';

function renderDialog(currentGoal?: number) {
  const onCommand = vi.fn();
  render(WordGoalDialog, { currentGoal, translator: createTranslator(), onCommand, onClose: vi.fn() });
  return { onCommand, input: screen.getByRole('textbox', { name: 'Words to write in this document' }) };
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
});
