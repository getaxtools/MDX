import { DEFAULT_VIEW_SETTINGS, type ViewSettings } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SettingsDialog from './SettingsDialog.svelte';

const DATA_FOLDER = 'C:\\Users\\Ada\\AppData\\Roaming\\MDX';

function renderSettings(settings: ViewSettings = DEFAULT_VIEW_SETTINGS) {
  const onCommand = vi.fn();
  const onClose = vi.fn();
  render(SettingsDialog, {
    settings,
    dataFolder: DATA_FOLDER,
    translator: createTranslator(),
    onCommand,
    onClose,
  });
  return { onCommand, onClose };
}

describe('SettingsDialog', () => {
  it('opens with the search box focused', () => {
    renderSettings();

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search settings' }));
  });

  it('shows the current settings in labelled controls with descriptions', () => {
    renderSettings({ ...DEFAULT_VIEW_SETTINGS, theme: 'dark', isOutlineVisible: false });

    const theme = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Theme' });
    const outline = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Show Outline' });

    expect(theme.value).toBe('dark');
    expect(theme.getAttribute('aria-describedby')).toBe('setting-theme-description');
    expect(outline.checked).toBe(false);
    expect(screen.getByRole('region', { name: 'Appearance' })).toBeTruthy();
  });

  it('applies a chosen value at once', async () => {
    const { onCommand } = renderSettings();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Typography' }), 'Academic');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Zoom' }), '125%');

    expect(onCommand).toHaveBeenCalledWith({ kind: 'setTypography', typography: 'academic' });
    expect(onCommand).toHaveBeenCalledWith({ kind: 'setZoom', zoomPercent: 125 });
  });

  it('offers the display language, starting with the language of Windows', async () => {
    const { onCommand } = renderSettings();
    const language = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Display Language' });

    await userEvent.selectOptions(language, 'English');

    expect(language.options[0]?.textContent).toBe('Same as Windows');
    expect(onCommand).toHaveBeenCalledWith({ kind: 'setLanguage', language: 'en' });
  });

  it('toggles a panel with its checkbox', async () => {
    const { onCommand } = renderSettings();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Show Status Bar' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'toggleStatusBar' });
  });

  it('shows only the settings that match the search', async () => {
    renderSettings();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search settings' }), 'width');

    expect(screen.getByRole('combobox', { name: 'Reading Width' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Theme' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Layout' })).toBeNull();
  });

  it('says when no setting matches', async () => {
    renderSettings();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search settings' }), 'banana');

    expect(screen.getByRole('status').textContent).toBe('No settings match “banana”.');
  });

  it('says where the data is kept and offers to clear it', async () => {
    const { onCommand } = renderSettings();
    const privacy = screen.getByRole('region', { name: 'Privacy' });

    await userEvent.click(screen.getByRole('button', { name: 'Clear All Data…' }));

    expect(privacy.textContent).toContain(DATA_FOLDER);
    expect(onCommand).toHaveBeenCalledWith({ kind: 'confirmClearAllData' });
  });

  it('finds Clear All Data by searching', async () => {
    renderSettings();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search settings' }), 'clear');

    expect(screen.getByRole('button', { name: 'Clear All Data…' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Appearance' })).toBeNull();
  });

  it('closes with Escape', async () => {
    const { onClose } = renderSettings();

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });
});
