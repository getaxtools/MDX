import { createTranslator } from '@mdx/i18n';
import { render, screen, within } from '@testing-library/svelte';
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
    translator: createTranslator(),
    onConfirm,
    onCancel,
  });
  return { onConfirm, onCancel };
}

function buttonName(button: Element): string {
  return button.getAttribute('aria-label') ?? button.textContent.trim();
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

  it('offers a third choice between confirming and cancelling', async () => {
    const onChoose = vi.fn();
    render(ConfirmDialog, {
      title: 'Save new documents?',
      message: 'Untitled-1.md has not been saved.',
      confirmLabel: 'Save',
      cancelLabel: 'Cancel',
      translator: createTranslator(),
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
      alternative: { label: 'Don’t Save', onChoose },
    });

    expect(screen.getAllByRole('button').map(buttonName)).toEqual(['Close', 'Don’t Save', 'Cancel', 'Save']);
    await userEvent.click(screen.getByRole('button', { name: 'Don’t Save' }));

    expect(onChoose).toHaveBeenCalledOnce();
  });

  it('shares the dialog frame: a header close with an esc tooltip, a quiet cancel and the confirm last', () => {
    renderDialog();

    const dialog = screen.getByRole('alertdialog', { name: 'Open link in your browser?' });

    expect(within(dialog).getByRole('button', { name: 'Close' }).getAttribute('title')).toBe('Close (Esc)');
    expect(screen.getAllByRole('button').map(buttonName)).toEqual(['Close', 'Cancel', 'Open']);
  });

  it('is described by its message', () => {
    renderDialog();

    const dialog = screen.getByRole('alertdialog', { name: 'Open link in your browser?' });

    expect(document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'This will open https://example.com in your default browser.',
    );
  });

  it('closing from the header cancels the question', async () => {
    const { onConfirm, onCancel } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('enter on the focused cancel does not confirm', async () => {
    const { onConfirm, onCancel } = renderDialog();

    await userEvent.keyboard('{Enter}');

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
