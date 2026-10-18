import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AboutDialog from './AboutDialog.svelte';

function renderAbout() {
  const onClose = vi.fn();
  render(AboutDialog, {
    appInfo: { version: '1.2.3', dataFolder: 'C:\\Users\\Ada\\AppData\\Roaming\\getaxtools\\MDX' },
    translator: createTranslator(),
    onClose,
  });
  return { onClose };
}

describe('AboutDialog', () => {
  it('shows the version, the privacy promise and where data is stored', () => {
    renderAbout();

    const dialog = screen.getByRole('dialog', { name: 'About MDX' });

    expect(dialog.textContent).toContain('Version 1.2.3');
    expect(dialog.textContent).toContain('makes no network connections');
    expect(dialog.textContent).toContain('C:\\Users\\Ada\\AppData\\Roaming\\getaxtools\\MDX');
    expect(dialog.textContent).toContain('Copyright © 2026 getaxtools');
  });

  it('moves focus to the close button and closes with it', async () => {
    const { onClose } = renderAbout();
    const closeButton = screen.getByRole('button', { name: 'Close' });

    expect(document.activeElement).toBe(closeButton);
    await userEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes with Escape', async () => {
    const { onClose } = renderAbout();

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });
});
