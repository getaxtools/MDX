import type { SidebarView } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ActivityBar from './ActivityBar.svelte';

function renderActivityBar({
  isSidebarVisible = true,
  sidebarView = 'explorer',
}: { isSidebarVisible?: boolean; sidebarView?: SidebarView } = {}) {
  const onCommand = vi.fn();
  render(ActivityBar, { isSidebarVisible, sidebarView, translator: createTranslator(), onCommand });
  return { onCommand };
}

describe('ActivityBar', () => {
  it('shows whether the sidebar and the outline are open', () => {
    renderActivityBar({ isSidebarVisible: true });

    expect(screen.getByRole('button', { name: 'Explorer' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Outline' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the Outline as the pressed side bar view while it is shown', () => {
    renderActivityBar({ isSidebarVisible: true, sidebarView: 'outline' });

    expect(screen.getByRole('button', { name: 'Outline' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Explorer' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('opens Find in Folders and closes it again when it is shown', async () => {
    const onCommand = vi.fn();
    render(ActivityBar, {
      isSidebarVisible: true,
      sidebarView: 'search',
      translator: createTranslator(),
      onCommand,
    });
    const search = screen.getByRole('button', { name: 'Search' });

    await userEvent.click(search);

    expect(search.getAttribute('aria-pressed')).toBe('true');
    expect(search.title).toBe('Search (Ctrl+Shift+F)');
    expect(screen.getByRole('button', { name: 'Explorer' }).getAttribute('aria-pressed')).toBe('false');
    expect(onCommand).toHaveBeenCalledWith({ kind: 'toggleSidebarView', sidebarView: 'search' });
  });

  it('mentions the shortcut in the tooltip', () => {
    renderActivityBar();

    expect(screen.getByRole('button', { name: 'Explorer' }).title).toBe('Explorer (Ctrl+Shift+E)');
  });

  it('shows and hides the sidebar and the outline, and opens Settings and the keyboard shortcuts', async () => {
    const { onCommand } = renderActivityBar();

    await userEvent.click(screen.getByRole('button', { name: 'Explorer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Outline' }));
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keyboard Shortcuts' }));

    expect(onCommand.mock.calls).toEqual([
      [{ kind: 'toggleSidebarView', sidebarView: 'explorer' }],
      [{ kind: 'toggleOutline' }],
      [{ kind: 'showSettings' }],
      [{ kind: 'showKeyboardShortcuts' }],
    ]);
  });
});
