import { DEFAULT_VIEW_SETTINGS } from '@mdx/core';
import { describe, expect, it } from 'vitest';
import { applyViewCommand, isViewCommand } from './viewCommands';

describe('view commands', () => {
  it('changes zoom, theme, reading width, typography and sidebar visibility', () => {
    const zoomed = applyViewCommand(DEFAULT_VIEW_SETTINGS, { kind: 'zoomIn' });
    const themed = applyViewCommand(zoomed, { kind: 'setTheme', theme: 'dark' });
    const widened = applyViewCommand(themed, { kind: 'setReadingWidth', readingWidth: 'full' });
    const restyled = applyViewCommand(widened, { kind: 'setTypography', typography: 'academic' });
    const withoutSidebar = applyViewCommand(restyled, { kind: 'toggleSidebar' });

    expect(withoutSidebar).toEqual({
      theme: 'dark',
      zoomPercent: 110,
      readingWidth: 'full',
      typography: 'academic',
      language: 'system',
      isSidebarVisible: false,
      sidebarView: 'explorer',
      isStatusBarVisible: true,
      isBreadcrumbsVisible: true,
      collapsedExplorerSections: [],
      explorerSectionHeights: {},
      panelWidths: {},
      isPreviewBesideEditor: false,
      editorSharePercent: 50,
    });
    expect(applyViewCommand(withoutSidebar, { kind: 'resetZoom' }).zoomPercent).toBe(100);
    expect(applyViewCommand(withoutSidebar, { kind: 'zoomOut' }).zoomPercent).toBe(100);
  });

  it('sets the zoom to a chosen step', () => {
    expect(applyViewCommand(DEFAULT_VIEW_SETTINGS, { kind: 'setZoom', zoomPercent: 150 }).zoomPercent).toBe(
      150,
    );
  });

  it('shows and hides the breadcrumbs, and shows a side bar view', () => {
    const withoutBreadcrumbs = applyViewCommand(DEFAULT_VIEW_SETTINGS, { kind: 'toggleBreadcrumbs' });
    const hidden = { ...DEFAULT_VIEW_SETTINGS, isSidebarVisible: false };

    expect(withoutBreadcrumbs.isBreadcrumbsVisible).toBe(false);
    expect(applyViewCommand(hidden, { kind: 'showSidebarView', sidebarView: 'explorer' })).toMatchObject({
      isSidebarVisible: true,
      sidebarView: 'explorer',
    });
  });

  it('shows the Explorer from the menu the same way as from the activity bar, even while Search is shown', () => {
    const searching = { ...DEFAULT_VIEW_SETTINGS, sidebarView: 'search' as const };

    expect(applyViewCommand(searching, { kind: 'toggleSidebar' })).toMatchObject({
      isSidebarVisible: true,
      sidebarView: 'explorer',
    });
  });

  it('shows the outline in the side bar and hides it again', () => {
    const outline = applyViewCommand(DEFAULT_VIEW_SETTINGS, { kind: 'toggleOutline' });

    expect(outline).toMatchObject({ isSidebarVisible: true, sidebarView: 'outline' });
    expect(applyViewCommand(outline, { kind: 'toggleOutline' }).isSidebarVisible).toBe(false);
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

  it('resizes side panels, returns them to their default width and sets the editor share', () => {
    const resized = applyViewCommand(DEFAULT_VIEW_SETTINGS, {
      kind: 'resizePanel',
      panel: 'explorer',
      widthPx: 300,
    });
    const shared = applyViewCommand(resized, { kind: 'setEditorShare', sharePercent: 70 });

    expect(shared.panelWidths).toEqual({ explorer: 300 });
    expect(shared.editorSharePercent).toBe(70);
    expect(applyViewCommand(shared, { kind: 'resetPanelWidth', panel: 'explorer' }).panelWidths).toEqual({});
  });
});
