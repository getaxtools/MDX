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
  it('shows the zoom level and zooms in, out and back to 100%', async () => {
    const { onCommand } = renderViewOptions({ ...DEFAULT_VIEW_SETTINGS, zoomPercent: 125 });

    await userEvent.click(screen.getByRole('button', { name: 'Zoom In' }));
    await userEvent.click(screen.getByRole('button', { name: 'Zoom Out' }));
    await userEvent.click(screen.getByRole('button', { name: 'Zoom 125%' }));

    expect(onCommand.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      { kind: 'zoomIn' },
      { kind: 'zoomOut' },
      { kind: 'resetZoom' },
    ]);
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
