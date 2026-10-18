import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConfirmDialog from './ConfirmDialog.svelte';

function renderDialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(ConfirmDialog, {
    title: 'Open link in your browser?',
    message: 'This will open https://example.com in your default browser.',
    confirmLabel: 'Open',
    cancelLabel: 'Cancel',
    onConfirm,
    onCancel,
  });
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('asks the question with the safe choice focused', () => {
    renderDialog();

    const dialog = screen.getByRole('alertdialog', { name: 'Open link in your browser?' });

    expect(dialog.textContent).toContain('https://example.com');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('confirms with the confirm button', async () => {
    const { onConfirm, onCancel } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels with Escape', async () => {
    const { onConfirm, onCancel } = renderDialog();

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
