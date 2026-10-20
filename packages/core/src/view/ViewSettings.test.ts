import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW_SETTINGS,
  parseViewSettings,
  resetZoom,
  resizeExplorerSection,
  showExplorerSection,
  toggleExplorerSection,
  zoomIn,
  zoomOut,
} from './ViewSettings';

const atZoom = (zoomPercent: number) => ({ ...DEFAULT_VIEW_SETTINGS, zoomPercent });

describe('view settings', () => {
  it('starts with the system theme, 100% zoom, medium width and every panel shown', () => {
    expect(DEFAULT_VIEW_SETTINGS).toEqual({
      theme: 'system',
      zoomPercent: 100,
      readingWidth: 'medium',
      isSidebarVisible: true,
      isOutlineVisible: true,
      isStatusBarVisible: true,
      collapsedExplorerSections: [],
      explorerSectionHeights: {},
    });
  });

  it('zooms in and out through fixed steps', () => {
    expect(zoomIn(atZoom(100)).zoomPercent).toBe(110);
    expect(zoomOut(atZoom(100)).zoomPercent).toBe(90);
    expect(zoomOut(atZoom(67)).zoomPercent).toBe(50);
  });

  it('stops at the smallest and largest zoom levels', () => {
    expect(zoomIn(atZoom(300)).zoomPercent).toBe(300);
    expect(zoomOut(atZoom(50)).zoomPercent).toBe(50);
  });

  it('resets zoom to 100%', () => {
    expect(resetZoom(atZoom(250)).zoomPercent).toBe(100);
  });

  it('restores saved settings', () => {
    const saved = {
      theme: 'dark',
      zoomPercent: 125,
      readingWidth: 'full',
      isSidebarVisible: false,
      isOutlineVisible: false,
      isStatusBarVisible: false,
      collapsedExplorerSections: ['favourites', 'recentFiles'],
      explorerSectionHeights: { favourites: 120, folders: 300 },
    };

    expect(parseViewSettings(saved)).toEqual(saved);
  });

  it('falls back to defaults for missing or invalid values', () => {
    expect(parseViewSettings(undefined)).toEqual(DEFAULT_VIEW_SETTINGS);
    expect(
      parseViewSettings({ theme: 'neon', zoomPercent: 333, readingWidth: 3, isSidebarVisible: 'no' }),
    ).toEqual(DEFAULT_VIEW_SETTINGS);
  });

  it('keeps only known Explorer sections from saved settings', () => {
    const settings = parseViewSettings({ collapsedExplorerSections: ['folders', 'unknown', 3] });

    expect(settings.collapsedExplorerSections).toEqual(['folders']);
  });

  it('collapses and expands an Explorer section', () => {
    const collapsed = toggleExplorerSection(DEFAULT_VIEW_SETTINGS, 'recentFiles');

    expect(collapsed.collapsedExplorerSections).toEqual(['recentFiles']);
    expect(toggleExplorerSection(collapsed, 'recentFiles').collapsedExplorerSections).toEqual([]);
  });

  it('remembers a dragged section height within sensible limits', () => {
    const resized = resizeExplorerSection(DEFAULT_VIEW_SETTINGS, 'favourites', 160.4);

    expect(resized.explorerSectionHeights).toEqual({ favourites: 160 });
    expect(resizeExplorerSection(resized, 'folders', 5).explorerSectionHeights.folders).toBe(48);
  });

  it('keeps only valid saved section heights', () => {
    const settings = parseViewSettings({
      explorerSectionHeights: { favourites: 'tall', folders: 9999, other: 3 },
    });

    expect(settings.explorerSectionHeights).toEqual({ folders: 4000 });
  });

  it('shows the Explorer with a section open', () => {
    const hidden = {
      ...DEFAULT_VIEW_SETTINGS,
      isSidebarVisible: false,
      collapsedExplorerSections: ['folders' as const],
    };

    const shown = showExplorerSection(hidden, 'folders');

    expect(shown.isSidebarVisible).toBe(true);
    expect(shown.collapsedExplorerSections).toEqual([]);
  });
});
