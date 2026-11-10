import { DEFAULT_VIEW_SETTINGS } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DocumentToolbar from './DocumentToolbar.svelte';

function renderToolbar({
  hasDocument = true,
  canBeFavourite = true,
  isFavourite = false,
  isEditing = false,
  viewSettings = DEFAULT_VIEW_SETTINGS,
} = {}) {
  const onCommand = vi.fn();
  render(DocumentToolbar, {
    viewSettings,
    hasDocument,
    canBeFavourite,
    isFavourite,
    isEditing,
    translator: createTranslator(),
    onCommand,
  });
  return { onCommand };
}

describe('DocumentToolbar', () => {
  it('names its icon buttons and mentions their shortcuts in the tooltip', () => {
    renderToolbar();

    const toolbar = screen.getByRole('toolbar', { name: 'Document actions' });
    expect(toolbar).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open' }).title).toBe('Open (Ctrl+O)');
    expect(screen.getByRole('button', { name: 'Favourite' }).title).toMatch(/^Favourite \(.+\)$/);
    expect(screen.getByRole('button', { name: 'Side by Side' })).toBeTruthy();
  });

  it('opens documents, stars the document, switches to editing and shows the preview beside', async () => {
    const { onCommand } = renderToolbar();

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByRole('button', { name: 'Favourite' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Side by Side' }));

    expect(onCommand.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      { kind: 'openDocuments' },
      { kind: 'toggleFavourite' },
      { kind: 'toggleEditing' },
      { kind: 'togglePreviewBesideEditor' },
    ]);
  });

  it('shows which modes are on', () => {
    renderToolbar({
      isFavourite: true,
      isEditing: true,
      viewSettings: { ...DEFAULT_VIEW_SETTINGS, isPreviewBesideEditor: true },
    });

    expect(screen.getByRole('button', { name: 'Favourite' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Preview' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Side by Side' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('disables the document actions while no document is shown', () => {
    renderToolbar({ hasDocument: false, canBeFavourite: false });

    expect(screen.getByRole('button', { name: 'Open' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Favourite' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Edit' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Side by Side' }).hasAttribute('disabled')).toBe(true);
  });

  it('includes the zoom and view options', () => {
    renderToolbar();

    expect(screen.getByRole('group', { name: 'View options' })).toBeTruthy();
  });
});
