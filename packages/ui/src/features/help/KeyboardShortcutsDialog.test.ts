import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog.svelte';

describe('KeyboardShortcutsDialog', () => {
  it('lists each action with its keys', () => {
    render(KeyboardShortcutsDialog, { translator: createTranslator(), onClose: vi.fn() });

    const dialog = screen.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    const closeTabRow = screen.getByRole('row', { name: /Close Tab/ });

    expect(dialog).toBeTruthy();
    expect(closeTabRow.textContent).toContain('Ctrl+W');
    expect(closeTabRow.textContent).toContain('Ctrl+F4');
  });

  it('closes with Escape', async () => {
    const onClose = vi.fn();
    render(KeyboardShortcutsDialog, { translator: createTranslator(), onClose });

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });
});
