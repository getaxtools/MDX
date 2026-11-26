import { DEFAULT_VIEW_SETTINGS } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import ViewOptions from './ViewOptions.svelte';

function renderViewOptions(settings = DEFAULT_VIEW_SETTINGS) {
  const onCommand = vi.fn();
  render(ViewOptions, { settings, translator: createTranslator(), onCommand });
  return { onCommand };
}

describe('ViewOptions', () => {
  it('leaves zoom to the status bar', () => {
    renderViewOptions({ ...DEFAULT_VIEW_SETTINGS, zoomPercent: 125 });

    expect(screen.queryByRole('button', { name: /zoom/i })).toBeNull();
  });

  it('chooses a theme from the Theme menu', async () => {
    const { onCommand } = renderViewOptions();

    await userEvent.click(screen.getByRole('button', { name: 'Theme' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Dark' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'setTheme', theme: 'dark' });
  });

  it('chooses a text width from the Text Width menu', async () => {
    const { onCommand } = renderViewOptions();

    await userEvent.click(screen.getByRole('button', { name: 'Text Width' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Full Width' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'setReadingWidth', readingWidth: 'full' });
  });

  it('chooses a document style from the Document Style menu', async () => {
    const { onCommand } = renderViewOptions();

    await userEvent.click(screen.getByRole('button', { name: 'Document Style' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Book' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'setTypography', typography: 'book' });
  });

  it('checks only the current choice in a menu', async () => {
    renderViewOptions({ ...DEFAULT_VIEW_SETTINGS, theme: 'sepia' });

    await userEvent.click(screen.getByRole('button', { name: 'Theme' }));

    const checked = screen
      .getAllByRole('menuitemcheckbox')
      .filter((item) => item.getAttribute('aria-checked') === 'true');
    expect(checked.map((item) => item.textContent.trim())).toEqual(['Sepia']);
  });

  it('says whether its menu is open', async () => {
    renderViewOptions();
    const button = screen.getByRole('button', { name: 'Theme' });

    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(button);

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu', { name: 'Theme' })).toBeTruthy();
  });

  it('closes its menu when its button is pressed again', async () => {
    renderViewOptions();
    const button = screen.getByRole('button', { name: 'Theme' });

    await userEvent.click(button);
    await userEvent.click(button);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('returns focus to its button when the menu is closed with Escape', async () => {
    renderViewOptions();
    const button = screen.getByRole('button', { name: 'Text Width' });

    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(globalThis.document.activeElement).toBe(button);
  });

  it('leaves focus where it went when focus moves out of the open menu', async () => {
    renderViewOptions();
    const button = screen.getByRole('button', { name: 'Theme' });
    await userEvent.click(button);

    screen.getAllByRole('menuitemcheckbox')[0]?.blur();
    await tick();

    expect(screen.queryByRole('menu')).toBeNull();
    expect(globalThis.document.activeElement).not.toBe(button);
  });

  it('opens its menu from the keyboard after a right-click closed it', async () => {
    renderViewOptions();
    const button = screen.getByRole('button', { name: 'Theme' });
    await userEvent.click(button);

    await userEvent.pointer({ keys: '[MouseRight]', target: button });
    button.focus();
    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('menu', { name: 'Theme' })).toBeTruthy();
  });

  it('returns focus to its button after a choice', async () => {
    renderViewOptions();
    const button = screen.getByRole('button', { name: 'Document Style' });

    await userEvent.click(button);
    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(globalThis.document.activeElement).toBe(button);
  });
});
