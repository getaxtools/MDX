import { createTranslator, englishCatalog } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AboutDialog from './AboutDialog.svelte';
import { INSTALLED_FEATURES } from './featureRegistry';

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

  it('lists the features of this version', () => {
    renderAbout();

    const features = screen.getByRole('list');

    expect(features.children).toHaveLength(INSTALLED_FEATURES.length);
    expect(features.textContent).toContain('Paste cells from Excel as a Markdown table');
  });

  it('names every installed feature with a message from the catalog, once', () => {
    const ids = INSTALLED_FEATURES.map((feature) => feature.id);

    expect(INSTALLED_FEATURES.filter((feature) => !Object.hasOwn(englishCatalog, feature.labelKey))).toEqual(
      [],
    );
    expect(new Set(ids).size).toBe(ids.length);
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
