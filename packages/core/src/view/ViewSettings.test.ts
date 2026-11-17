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
  isSidebarViewShown,
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
      isStatusBarVisible: true,
      isBreadcrumbsVisible: true,
      collapsedExplorerSections: [],
      explorerSectionHeights: {},
      panelWidths: {},
      isPreviewBesideEditor: false,
      editorSharePercent: 50,
      kindSwitcher: 'both',
      wheelDock: 'bottomInlineEnd',
      isWheelOpenedAtPointer: false,
      isWheelButtonInStatusBar: false,
      editingMode: 'richText',
      isSlashMenuInRichText: true,
      isSlashMenuInSource: false,
      isSpellCheckedInRichText: true,
      isSpellCheckedInSource: false,
      isNoteDeletionConfirmed: true,
      isNoteLinkUpdateConfirmed: true,
      isShowingHiddenCharacters: false,
      automaticInjectionCheck: 'agentContext',
      ctrlWheelAction: 'moveBetweenFiles',
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
      sidebarView: 'outline',
      isStatusBarVisible: false,
      isBreadcrumbsVisible: false,
      collapsedExplorerSections: ['favourites', 'recentFiles'],
      explorerSectionHeights: { favourites: 120, folders: 300 },
      panelWidths: { explorer: 320 },
      isPreviewBesideEditor: true,
      editorSharePercent: 60,
      kindSwitcher: 'bar',
      wheelDock: 'bottomInlineStart',
      isWheelOpenedAtPointer: true,
      isWheelButtonInStatusBar: true,
      editingMode: 'richText',
      isSlashMenuInRichText: false,
      isSlashMenuInSource: true,
      isSpellCheckedInRichText: false,
      isSpellCheckedInSource: true,
      isNoteDeletionConfirmed: false,
      isNoteLinkUpdateConfirmed: false,
      isShowingHiddenCharacters: true,
      automaticInjectionCheck: 'off',
      ctrlWheelAction: 'zoom',
    };

    expect(parseViewSettings(saved)).toEqual(saved);
  });

  describe('Check spelling', () => {
    it('Source is off by default, Rich text on, also for settings saved before the setting', () => {
      expect(DEFAULT_VIEW_SETTINGS.isSpellCheckedInSource).toBe(false);
      expect(DEFAULT_VIEW_SETTINGS.isSpellCheckedInRichText).toBe(true);
      expect(parseViewSettings({}).isSpellCheckedInSource).toBe(false);
      expect(parseViewSettings({}).isSpellCheckedInRichText).toBe(true);
    });
  });

  describe('Ctrl with the mouse wheel', () => {
    it('the setting survives a restart', () => {
      const saved: unknown = JSON.parse(
        JSON.stringify({ ...DEFAULT_VIEW_SETTINGS, ctrlWheelAction: 'zoom' }),
      );

      expect(parseViewSettings(saved).ctrlWheelAction).toBe('zoom');
    });

    it('a missing or bad value falls back to moves between files', () => {
      expect(parseViewSettings({ ctrlWheelAction: 'scroll' }).ctrlWheelAction).toBe('moveBetweenFiles');
      expect(parseViewSettings({ ctrlWheelAction: 1 }).ctrlWheelAction).toBe('moveBetweenFiles');
    });

    it('an earlier state without the field still restores', () => {
      const earlier = { theme: 'dark', zoomPercent: 125, isSidebarVisible: false };

      expect(parseViewSettings(earlier)).toMatchObject({
        theme: 'dark',
        zoomPercent: 125,
        isSidebarVisible: false,
        ctrlWheelAction: 'moveBetweenFiles',
      });
    });
  });

  it('restores every named theme', () => {
    const themes = ['sepia', 'solarizedLight', 'solarizedDark', 'nord', 'highContrast'];

    expect(themes.map((theme) => parseViewSettings({ theme }).theme)).toEqual(themes);
  });

  it('loads settings saved before the outline moved into the side bar', () => {
    const settings = parseViewSettings({
      isOutlineVisible: false,
      panelWidths: { explorer: 300, outline: 200 },
    });

    expect(settings).not.toHaveProperty('isOutlineVisible');
    expect(settings.panelWidths).toEqual({ explorer: 300 });
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
    ).toEqual({ ...DEFAULT_VIEW_SETTINGS, editingMode: 'source' });
  });

  it('shows a side bar view, and hides the side bar when that view is shown again', () => {
    const search = toggleSidebarView(DEFAULT_VIEW_SETTINGS, 'search');

    expect([search.isSidebarVisible, search.sidebarView]).toEqual([true, 'search']);
    expect(toggleSidebarView(search, 'search').isSidebarVisible).toBe(false);
    expect(toggleSidebarView(DEFAULT_VIEW_SETTINGS, 'explorer').isSidebarVisible).toBe(false);
  });

  it('shows the outline as a side bar view in place of the Explorer', () => {
    const outline = toggleSidebarView(DEFAULT_VIEW_SETTINGS, 'outline');

    expect(isSidebarViewShown(outline, 'outline')).toBe(true);
    expect(isSidebarViewShown(outline, 'explorer')).toBe(false);
    expect(isSidebarViewShown(toggleSidebarView(outline, 'outline'), 'outline')).toBe(false);
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
  });

  it('keeps side panels between their smallest and largest widths', () => {
    expect(panelWidthOf(resizePanel(DEFAULT_VIEW_SETTINGS, 'explorer', 20), 'explorer')).toBe(160);
    expect(panelWidthOf(resizePanel(DEFAULT_VIEW_SETTINGS, 'explorer', 5000), 'explorer')).toBe(800);
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
      panelWidths: { explorer: 9000, other: 300 },
      isPreviewBesideEditor: 'yes',
      editorSharePercent: Number.NaN,
    });

    expect(settings.panelWidths).toEqual({ explorer: 800 });
    expect(settings.isPreviewBesideEditor).toBe(false);
    expect(settings.editorSharePercent).toBe(50);
  });

  it('gives the control wheel settings their defaults when they are missing', () => {
    const settings = parseViewSettings({ theme: 'dark' });

    expect(settings.kindSwitcher).toBe('both');
    expect(settings.wheelDock).toBe('bottomInlineEnd');
    expect(settings.isWheelOpenedAtPointer).toBe(false);
    expect(settings.isWheelButtonInStatusBar).toBe(false);
  });

  it('restores saved control wheel settings', () => {
    const settings = parseViewSettings({
      kindSwitcher: 'wheel',
      wheelDock: 'bottomInlineStart',
      isWheelOpenedAtPointer: true,
      isWheelButtonInStatusBar: true,
    });

    expect(settings.kindSwitcher).toBe('wheel');
    expect(settings.wheelDock).toBe('bottomInlineStart');
    expect(settings.isWheelOpenedAtPointer).toBe(true);
    expect(settings.isWheelButtonInStatusBar).toBe(true);
  });

  it('falls back to the default control wheel settings for invalid values', () => {
    const settings = parseViewSettings({
      kindSwitcher: 'ring',
      wheelDock: 'topLeft',
      isWheelOpenedAtPointer: 'yes',
      isWheelButtonInStatusBar: 1,
    });

    expect(settings.kindSwitcher).toBe('both');
    expect(settings.wheelDock).toBe('bottomInlineEnd');
    expect(settings.isWheelOpenedAtPointer).toBe(false);
    expect(settings.isWheelButtonInStatusBar).toBe(false);
  });

  it('a saved state without the setting reads as Source', () => {
    expect(parseViewSettings({ theme: 'dark' }).editingMode).toBe('source');
    expect(parseViewSettings({ editingMode: 'richText' }).editingMode).toBe('richText');
    expect(parseViewSettings({ editingMode: 'wysiwyg' }).editingMode).toBe('source');
  });

  it('a new installation starts in Rich text', () => {
    expect(DEFAULT_VIEW_SETTINGS.editingMode).toBe('richText');
    expect(parseViewSettings(undefined).editingMode).toBe('richText');
  });

  it('reads Show hidden characters, off unless it was turned on', () => {
    expect(parseViewSettings({ isShowingHiddenCharacters: true }).isShowingHiddenCharacters).toBe(true);
    expect(parseViewSettings({ isShowingHiddenCharacters: 'yes' }).isShowingHiddenCharacters).toBe(false);
    expect(parseViewSettings({}).isShowingHiddenCharacters).toBe(false);
  });

  it('reads the automatic prompt injection check, falling back to agent files for unknown values', () => {
    expect(parseViewSettings({ automaticInjectionCheck: 'allDocuments' }).automaticInjectionCheck).toBe(
      'allDocuments',
    );
    expect(parseViewSettings({ automaticInjectionCheck: 'off' }).automaticInjectionCheck).toBe('off');
    expect(parseViewSettings({ automaticInjectionCheck: 'always' }).automaticInjectionCheck).toBe(
      'agentContext',
    );
  });

  it('remembers the prompt injection panel as the side bar view', () => {
    expect(parseViewSettings({ sidebarView: 'promptInjection' }).sidebarView).toBe('promptInjection');
  });
});
