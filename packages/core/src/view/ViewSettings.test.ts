import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW_SETTINGS,
  panelWidthOf,
  parseViewSettings,
  resetPanelWidth,
  resetZoom,
  resizeExplorerSection,
  resizePanel,
  setEditorShare,
  setZoom,
  showExplorerSection,
  toggleSidebarView,
  toggleExplorerSection,
  zoomIn,
  zoomOut,
} from './ViewSettings';

const atZoom = (zoomPercent: number) => ({ ...DEFAULT_VIEW_SETTINGS, zoomPercent });

describe('view settings', () => {
  it('starts with the system theme, 100% zoom, medium width, GitHub typography and every panel shown', () => {
    expect(DEFAULT_VIEW_SETTINGS).toEqual({
      theme: 'system',
      zoomPercent: 100,
      readingWidth: 'medium',
      typography: 'github',
      language: 'system',
      isSidebarVisible: true,
      sidebarView: 'explorer',
      isOutlineVisible: true,
      isStatusBarVisible: true,
      isBreadcrumbsVisible: true,
      collapsedExplorerSections: [],
      explorerSectionHeights: {},
      panelWidths: {},
      isPreviewBesideEditor: false,
      editorSharePercent: 50,
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

  it('sets one of the zoom steps and ignores other values', () => {
    expect(setZoom(DEFAULT_VIEW_SETTINGS, 175).zoomPercent).toBe(175);
    expect(setZoom(DEFAULT_VIEW_SETTINGS, 177).zoomPercent).toBe(100);
  });

  it('resets zoom to 100%', () => {
    expect(resetZoom(atZoom(250)).zoomPercent).toBe(100);
  });

  it('restores saved settings', () => {
    const saved = {
      theme: 'dark',
      zoomPercent: 125,
      readingWidth: 'full',
      typography: 'book',
      language: 'pt-BR',
      isSidebarVisible: false,
      sidebarView: 'search',
      isOutlineVisible: false,
      isStatusBarVisible: false,
      isBreadcrumbsVisible: false,
      collapsedExplorerSections: ['favourites', 'recentFiles'],
      explorerSectionHeights: { favourites: 120, folders: 300 },
      panelWidths: { explorer: 320, outline: 200 },
      isPreviewBesideEditor: true,
      editorSharePercent: 60,
    };

    expect(parseViewSettings(saved)).toEqual(saved);
  });

  it('falls back to defaults for missing or invalid values', () => {
    expect(parseViewSettings(undefined)).toEqual(DEFAULT_VIEW_SETTINGS);
    expect(
      parseViewSettings({
        theme: 'neon',
        zoomPercent: 333,
        readingWidth: 3,
        typography: 'comic',
        language: '<script>',
        isSidebarVisible: 'no',
      }),
    ).toEqual(DEFAULT_VIEW_SETTINGS);
  });

  it('shows a side bar view, and hides the side bar when that view is shown again', () => {
    const search = toggleSidebarView(DEFAULT_VIEW_SETTINGS, 'search');

    expect([search.isSidebarVisible, search.sidebarView]).toEqual([true, 'search']);
    expect(toggleSidebarView(search, 'search').isSidebarVisible).toBe(false);
    expect(toggleSidebarView(DEFAULT_VIEW_SETTINGS, 'explorer').isSidebarVisible).toBe(false);
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

  it('gives side panels their default width until the user drags them', () => {
    const resized = resizePanel(DEFAULT_VIEW_SETTINGS, 'explorer', 333.6);

    expect(panelWidthOf(DEFAULT_VIEW_SETTINGS, 'explorer')).toBe(260);
    expect(panelWidthOf(resized, 'explorer')).toBe(334);
    expect(panelWidthOf(resized, 'outline')).toBe(256);
  });

  it('keeps side panels between their smallest and largest widths', () => {
    expect(panelWidthOf(resizePanel(DEFAULT_VIEW_SETTINGS, 'outline', 20), 'outline')).toBe(160);
    expect(panelWidthOf(resizePanel(DEFAULT_VIEW_SETTINGS, 'outline', 5000), 'outline')).toBe(800);
  });

  it('returns a dragged panel to its default width', () => {
    const resized = resizePanel(DEFAULT_VIEW_SETTINGS, 'explorer', 400);

    expect(resetPanelWidth(resized, 'explorer').panelWidths).toEqual({});
  });

  it('keeps the editor and the preview beside it at least a fifth of the area each', () => {
    expect(setEditorShare(DEFAULT_VIEW_SETTINGS, 64.4).editorSharePercent).toBe(64);
    expect(setEditorShare(DEFAULT_VIEW_SETTINGS, 5).editorSharePercent).toBe(20);
    expect(setEditorShare(DEFAULT_VIEW_SETTINGS, 95).editorSharePercent).toBe(80);
  });

  it('keeps only valid saved panel widths and editor shares', () => {
    const settings = parseViewSettings({
      panelWidths: { explorer: 'wide', outline: 9000, other: 300 },
      isPreviewBesideEditor: 'yes',
      editorSharePercent: Number.NaN,
    });

    expect(settings.panelWidths).toEqual({ outline: 800 });
    expect(settings.isPreviewBesideEditor).toBe(false);
    expect(settings.editorSharePercent).toBe(50);
  });
});
