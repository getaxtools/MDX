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
      isStatusBarVisible: true,
      collapsedExplorerSections: [],
      explorerSectionHeights: {},
    });
    expect(applyViewCommand(withoutSidebar, { kind: 'resetZoom' }).zoomPercent).toBe(100);
    expect(applyViewCommand(withoutSidebar, { kind: 'zoomOut' }).zoomPercent).toBe(100);
  });

  it('shows and hides the status bar', () => {
    const withoutStatusBar = applyViewCommand(DEFAULT_VIEW_SETTINGS, { kind: 'toggleStatusBar' });

    expect(withoutStatusBar.isStatusBarVisible).toBe(false);
    expect(applyViewCommand(withoutStatusBar, { kind: 'toggleStatusBar' }).isStatusBarVisible).toBe(true);
  });

  it('collapses and expands an Explorer section', () => {
    const collapsed = applyViewCommand(DEFAULT_VIEW_SETTINGS, {
      kind: 'toggleExplorerSection',
      section: 'folders',
    });

    expect(collapsed.collapsedExplorerSections).toEqual(['folders']);
  });

  it('tells view commands apart from document commands', () => {
    expect(isViewCommand({ kind: 'zoomIn' })).toBe(true);
    expect(isViewCommand({ kind: 'closeActiveTab' })).toBe(false);
  });
});
