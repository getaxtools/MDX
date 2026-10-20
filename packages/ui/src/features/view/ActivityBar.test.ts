import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ActivityBar from './ActivityBar.svelte';

function renderActivityBar({ isSidebarVisible = true, isOutlineVisible = false } = {}) {
  const onCommand = vi.fn();
  render(ActivityBar, { isSidebarVisible, isOutlineVisible, translator: createTranslator(), onCommand });
  return { onCommand };
}

describe('ActivityBar', () => {
  it('shows whether the sidebar and the outline are open', () => {
    renderActivityBar({ isSidebarVisible: true, isOutlineVisible: false });

    expect(screen.getByRole('button', { name: 'Explorer' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Outline' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('mentions the shortcut in the tooltip', () => {
    renderActivityBar();

    expect(screen.getByRole('button', { name: 'Explorer' }).title).toBe('Explorer (Ctrl+Shift+E)');
  });

  it('shows and hides the sidebar and the outline, and opens the keyboard shortcuts', async () => {
    const { onCommand } = renderActivityBar();

    await userEvent.click(screen.getByRole('button', { name: 'Explorer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Outline' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keyboard Shortcuts' }));

    expect(onCommand.mock.calls).toEqual([
      [{ kind: 'toggleSidebar' }],
      [{ kind: 'toggleOutline' }],
      [{ kind: 'showKeyboardShortcuts' }],
    ]);
  });
});
