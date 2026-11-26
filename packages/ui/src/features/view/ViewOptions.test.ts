import { DEFAULT_VIEW_SETTINGS } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
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

  it('chooses a theme', async () => {
    const { onCommand } = renderViewOptions();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), 'Dark');

    expect(onCommand).toHaveBeenCalledWith({ kind: 'setTheme', theme: 'dark' });
  });

  it('chooses a reading width', async () => {
    const { onCommand } = renderViewOptions();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Reading Width' }), 'Full Width');

    expect(onCommand).toHaveBeenCalledWith({ kind: 'setReadingWidth', readingWidth: 'full' });
  });

  it('chooses a typography preset', async () => {
    const { onCommand } = renderViewOptions();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Typography' }), 'Book');

    expect(onCommand).toHaveBeenCalledWith({ kind: 'setTypography', typography: 'book' });
  });
});
