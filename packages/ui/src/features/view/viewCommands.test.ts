import { DEFAULT_VIEW_SETTINGS } from '@mdx/core';
import { describe, expect, it } from 'vitest';
import { applyViewCommand, isViewCommand } from './viewCommands';

describe('view commands', () => {
  it('changes zoom, theme, reading width and sidebar visibility', () => {
    const zoomed = applyViewCommand(DEFAULT_VIEW_SETTINGS, { kind: 'zoomIn' });
    const themed = applyViewCommand(zoomed, { kind: 'setTheme', theme: 'dark' });
    const widened = applyViewCommand(themed, { kind: 'setReadingWidth', readingWidth: 'full' });
    const withoutSidebar = applyViewCommand(widened, { kind: 'toggleSidebar' });

    expect(withoutSidebar).toEqual({
      theme: 'dark',
      zoomPercent: 110,
      readingWidth: 'full',
      isSidebarVisible: false,
      isOutlineVisible: true,
    });
    expect(applyViewCommand(withoutSidebar, { kind: 'resetZoom' }).zoomPercent).toBe(100);
    expect(applyViewCommand(withoutSidebar, { kind: 'zoomOut' }).zoomPercent).toBe(100);
  });

  it('tells view commands apart from document commands', () => {
    expect(isViewCommand({ kind: 'zoomIn' })).toBe(true);
    expect(isViewCommand({ kind: 'closeActiveTab' })).toBe(false);
  });
});
