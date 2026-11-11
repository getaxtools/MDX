import { createTranslator, englishCatalog, SUPPORTED_LOCALES } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AboutDialog from './AboutDialog.svelte';
import { INSTALLED_FEATURE_GROUPS, INSTALLED_FEATURES } from './featureRegistry';

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
    expect(dialog.textContent).toContain('Your settings, favourites, recent files and open tabs');
    expect(dialog.textContent).toContain('C:\\Users\\Ada\\AppData\\Roaming\\getaxtools\\MDX');
    expect(dialog.textContent).toContain('Copyright © 2026 getaxtools');
  });

  it('shows where to get new versions and the source code', () => {
    renderAbout();

    const dialog = screen.getByRole('dialog', { name: 'About MDX' });

    expect(dialog.textContent).toContain('New versions and the source code: github.com/getaxtools/MDX');
  });

  it('lists the features of this version in named groups', () => {
    renderAbout();

    const editing = screen.getByRole('list', { name: 'Editing' });

    expect(screen.getAllByRole('list')).toHaveLength(INSTALLED_FEATURE_GROUPS.length);
    expect(editing.textContent).toContain('Paste cells from Excel as a Markdown table');
  });

  it('lists every installed feature once across the groups', () => {
    renderAbout();

    const listedFeatures = screen.getAllByRole('list').flatMap((list) => [...list.children]);

    expect(listedFeatures).toHaveLength(INSTALLED_FEATURES.length);
  });

  it('counts the display languages that Settings offers', () => {
    renderAbout();

    const languages = screen.getByRole('list', { name: 'Languages and text' });

    expect(languages.textContent).toContain(
      `Menus, dialogs and messages in ${String(SUPPORTED_LOCALES.length)} languages`,
    );
  });

  it('names every group and installed feature with a message from the catalog, once', () => {
    const ids = INSTALLED_FEATURES.map((feature) => feature.id);
    const labelKeys = [
      ...INSTALLED_FEATURE_GROUPS.map((group) => group.labelKey),
      ...INSTALLED_FEATURES.map((feature) => feature.labelKey),
    ];

    expect(labelKeys.filter((key) => !Object.hasOwn(englishCatalog, key))).toEqual([]);
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
