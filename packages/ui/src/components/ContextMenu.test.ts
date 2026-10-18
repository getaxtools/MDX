import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ContextMenu from './ContextMenu.svelte';

function renderMenu() {
  const onChoose = vi.fn();
  const onClose = vi.fn();
  render(ContextMenu, {
    label: 'Tab actions',
    items: [
      { id: 'pin', label: 'Pin Tab' },
      { id: 'closeOthers', label: 'Close Others', isDisabled: true },
      { id: 'close', label: 'Close', hasSeparatorBefore: true, shortcut: 'Ctrl+W' },
    ],
    position: { x: 10, y: 20 },
    onChoose,
    onClose,
  });
  return { onChoose, onClose };
}

describe('ContextMenu', () => {
  it('shows the items as a labelled menu and focuses the first one', () => {
    renderMenu();

    const menu = screen.getByRole('menu', { name: 'Tab actions' });

    expect(screen.getAllByRole('menuitem').map((item) => item.firstElementChild?.textContent)).toEqual([
      'Pin Tab',
      'Close Others',
      'Close',
    ]);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Pin Tab' }));
    expect(menu.style.left).toBe('10px');
  });

  it('shows an item shortcut next to its label without adding it to the item name', () => {
    renderMenu();

    const close = screen.getByRole('menuitem', { name: 'Close' });

    expect(close.textContent).toContain('Ctrl+W');
  });

  it('moves between enabled items with the arrow keys and chooses with Enter', async () => {
    const { onChoose, onClose } = renderMenu();

    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(onChoose).toHaveBeenCalledWith('close');
    expect(onClose).toHaveBeenCalled();
  });

  it('wraps around from the first item to the last with ArrowUp', async () => {
    renderMenu();

    await userEvent.keyboard('{ArrowUp}');

    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Close' }));
  });

  it('closes with Escape without choosing', async () => {
    const { onChoose, onClose } = renderMenu();

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('chooses an item with a click', async () => {
    const { onChoose } = renderMenu();

    await userEvent.click(screen.getByRole('menuitem', { name: 'Pin Tab' }));

    expect(onChoose).toHaveBeenCalledWith('pin');
  });
});
