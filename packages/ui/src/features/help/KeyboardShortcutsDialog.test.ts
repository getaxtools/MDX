import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { effectiveCommandShortcuts } from '../shortcuts/effectiveCommandShortcuts';
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog.svelte';

describe('KeyboardShortcutsDialog', () => {
  it('lists each action with its keys', () => {
    render(KeyboardShortcutsDialog, { translator: createTranslator(), onClose: vi.fn() });

    const dialog = screen.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    // Finding the row by its text: naming every row of the long table by role is slow in a test DOM.
    const closeTabRow = screen.getByText('Close Tab').closest('tr');

    expect(dialog).toBeTruthy();
    expect(closeTabRow?.textContent).toContain('Ctrl+W');
    expect(closeTabRow?.textContent).toContain('Ctrl+F4');
  });

  it('opens with the search box focused and finds shortcuts by action or keys', async () => {
    render(KeyboardShortcutsDialog, { translator: createTranslator(), onClose: vi.fn() });
    const search = screen.getByRole('searchbox', { name: 'Search keyboard shortcuts' });
    expect(document.activeElement).toBe(search);

    await userEvent.type(search, 'reopen closed');

    expect(screen.getAllByRole('row').map((row) => row.textContent)).toEqual([
      'ActionKeys',
      'Reopen Closed TabCtrl+Shift+T',
    ]);
  });

  it('says when no shortcut matches', async () => {
    render(KeyboardShortcutsDialog, { translator: createTranslator(), onClose: vi.fn() });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search keyboard shortcuts' }), 'banana');

    expect(screen.getByRole('status').textContent).toBe('No shortcut matches “banana”.');
  });

  it('closes with Escape', async () => {
    const onClose = vi.fn();
    render(KeyboardShortcutsDialog, { translator: createTranslator(), onClose });

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows the mouse-button help with the current shortcut and the Back and Forward warning', () => {
    render(KeyboardShortcutsDialog, {
      translator: createTranslator(),
      shortcuts: effectiveCommandShortcuts({ toggleControlWheel: ['ctrl', 'shift', 'J'] }),
      onClose: vi.fn(),
    });

    const help = screen.getByText(/To open the control wheel with a mouse button/);

    expect(help.textContent).toContain('Ctrl+Shift+J');
    expect(help.textContent).toContain('other than Back or Forward');
  });

  it('shows a removed shortcut as none', async () => {
    render(KeyboardShortcutsDialog, {
      translator: createTranslator(),
      shortcuts: effectiveCommandShortcuts({ toggleControlWheel: [] }),
      onClose: vi.fn(),
    });

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search keyboard shortcuts' }),
      'control wheel',
    );

    expect(screen.getAllByRole('row').map((row) => row.textContent)).toEqual([
      'ActionKeys',
      'Show Control WheelNone',
    ]);
    expect(screen.getByText(/Give the control wheel a shortcut/)).toBeTruthy();
  });
});
