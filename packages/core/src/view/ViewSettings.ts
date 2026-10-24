export type ThemePreference = 'system' | 'light' | 'dark';
export type ReadingWidth = 'narrow' | 'medium' | 'wide' | 'full';
export type Typography = 'github' | 'book' | 'academic';
/** A language tag such as `hi` or `pt-BR`, or `system` to follow the language of Windows. */
export type LanguagePreference = 'system' | (string & {});
export type ExplorerSection = 'favourites' | 'folders' | 'recentFiles';
/** The side bar, whatever view it shows; saved as `explorer` by earlier versions. */
export type ResizablePanel = 'explorer';
export type SidebarView = 'explorer' | 'search' | 'outline';

export interface ViewSettings {
  readonly theme: ThemePreference;
  readonly zoomPercent: number;
  readonly readingWidth: ReadingWidth;
  readonly typography: Typography;
  readonly language: LanguagePreference;
  readonly isSidebarVisible: boolean;
  /** What the side bar shows: the Explorer, Find in Folders or the outline of the document. */
  readonly sidebarView: SidebarView;
  readonly isStatusBarVisible: boolean;
  /** Folder, file and current heading above the document. */
  readonly isBreadcrumbsVisible: boolean;
  readonly collapsedExplorerSections: readonly ExplorerSection[];
  /** Heights the user dragged sections to; a section without one takes the height of its content. */
  readonly explorerSectionHeights: Readonly<Partial<Record<ExplorerSection, number>>>;
  /** Widths the user dragged side panels to; a panel without one has its default width. */
  readonly panelWidths: Readonly<Partial<Record<ResizablePanel, number>>>;
  /** While editing, the rendered preview is shown next to the editor and scrolls with it. */
  readonly isPreviewBesideEditor: boolean;
  /** How much of the reading area the editor takes when the preview is beside it. */
  readonly editorSharePercent: number;
}

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];
export const READING_WIDTHS: readonly ReadingWidth[] = ['narrow', 'medium', 'wide', 'full'];
export const TYPOGRAPHIES: readonly Typography[] = ['github', 'book', 'academic'];
export const EXPLORER_SECTIONS: readonly ExplorerSection[] = ['favourites', 'folders', 'recentFiles'];
export const MIN_EXPLORER_SECTION_HEIGHT_PX = 48;
export const MAX_EXPLORER_SECTION_HEIGHT_PX = 4000;
export const RESIZABLE_PANELS: readonly ResizablePanel[] = ['explorer'];
export const SIDEBAR_VIEWS: readonly SidebarView[] = ['explorer', 'search', 'outline'];
export const DEFAULT_PANEL_WIDTHS_PX: Readonly<Record<ResizablePanel, number>> = {
  explorer: 260,
};
export const MIN_PANEL_WIDTH_PX = 160;
export const MAX_PANEL_WIDTH_PX = 800;
const LANGUAGE_TAG = /^(system|[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2})$/;
export const DEFAULT_EDITOR_SHARE_PERCENT = 50;
export const MIN_EDITOR_SHARE_PERCENT = 20;
export const MAX_EDITOR_SHARE_PERCENT = 80;
/* eslint-disable @typescript-eslint/no-magic-numbers -- this list is the named set of zoom steps */
export const ZOOM_LEVELS_PERCENT: readonly number[] = [
  50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300,
];
/* eslint-enable @typescript-eslint/no-magic-numbers */
export const DEFAULT_ZOOM_PERCENT = 100;

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  theme: 'system',
  zoomPercent: DEFAULT_ZOOM_PERCENT,
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
  editorSharePercent: DEFAULT_EDITOR_SHARE_PERCENT,
};

export function zoomIn(settings: ViewSettings): ViewSettings {
  const next = ZOOM_LEVELS_PERCENT.find((level) => level > settings.zoomPercent);
  return next === undefined ? settings : { ...settings, zoomPercent: next };
}

export function zoomOut(settings: ViewSettings): ViewSettings {
  const previous = ZOOM_LEVELS_PERCENT.findLast((level) => level < settings.zoomPercent);
  return previous === undefined ? settings : { ...settings, zoomPercent: previous };
}

/** Sets one of the zoom steps; any other value leaves the zoom as it is. */
export function setZoom(settings: ViewSettings, zoomPercent: number): ViewSettings {
  return ZOOM_LEVELS_PERCENT.includes(zoomPercent) ? { ...settings, zoomPercent } : settings;
}

export function resetZoom(settings: ViewSettings): ViewSettings {
  return { ...settings, zoomPercent: DEFAULT_ZOOM_PERCENT };
}

/** Shows a side bar view, or hides the side bar when that view is already shown. */
export function toggleSidebarView(settings: ViewSettings, sidebarView: SidebarView): ViewSettings {
  return { ...settings, isSidebarVisible: !isSidebarViewShown(settings, sidebarView), sidebarView };
}

export function isSidebarViewShown(settings: ViewSettings, sidebarView: SidebarView): boolean {
  return settings.isSidebarVisible && settings.sidebarView === sidebarView;
}

export function showSidebarView(settings: ViewSettings, sidebarView: SidebarView): ViewSettings {
  return { ...settings, isSidebarVisible: true, sidebarView };
}

export function toggleExplorerSection(settings: ViewSettings, section: ExplorerSection): ViewSettings {
  const isCollapsed = settings.collapsedExplorerSections.includes(section);
  return {
    ...settings,
    collapsedExplorerSections: isCollapsed
      ? settings.collapsedExplorerSections.filter((collapsed) => collapsed !== section)
      : [...settings.collapsedExplorerSections, section],
  };
}

export function resizeExplorerSection(
  settings: ViewSettings,
  section: ExplorerSection,
  heightPx: number,
): ViewSettings {
  return {
    ...settings,
    explorerSectionHeights: { ...settings.explorerSectionHeights, [section]: clampSectionHeight(heightPx) },
  };
}

export function panelWidthOf(settings: ViewSettings, panel: ResizablePanel): number {
  return settings.panelWidths[panel] ?? DEFAULT_PANEL_WIDTHS_PX[panel];
}

export function resizePanel(settings: ViewSettings, panel: ResizablePanel, widthPx: number): ViewSettings {
  return { ...settings, panelWidths: { ...settings.panelWidths, [panel]: clampPanelWidth(widthPx) } };
}

export function resetPanelWidth(settings: ViewSettings, panel: ResizablePanel): ViewSettings {
  const panelWidths = Object.fromEntries(
    Object.entries(settings.panelWidths).filter(([resizedPanel]) => resizedPanel !== panel),
  );
  return { ...settings, panelWidths };
}

export function setEditorShare(settings: ViewSettings, sharePercent: number): ViewSettings {
  return { ...settings, editorSharePercent: clampEditorShare(sharePercent) };
}

/** Shows the Explorer with one of its sections open, such as Folders after opening a folder. */
export function showExplorerSection(settings: ViewSettings, section: ExplorerSection): ViewSettings {
  return {
    ...settings,
    isSidebarVisible: true,
    sidebarView: 'explorer',
    collapsedExplorerSections: settings.collapsedExplorerSections.filter(
      (collapsed) => collapsed !== section,
    ),
  };
}

export function parseViewSettings(saved: unknown): ViewSettings {
  if (typeof saved !== 'object' || saved === null) return DEFAULT_VIEW_SETTINGS;
  const {
    theme,
    zoomPercent,
    readingWidth,
    typography,
    language,
    isSidebarVisible,
    sidebarView,
    isStatusBarVisible,
    isBreadcrumbsVisible,
    collapsedExplorerSections,
    explorerSectionHeights,
    panelWidths,
    isPreviewBesideEditor,
    editorSharePercent,
  } = saved as Record<string, unknown>;
  return {
    theme: oneOf(THEME_PREFERENCES, theme, DEFAULT_VIEW_SETTINGS.theme),
    zoomPercent: oneOf(ZOOM_LEVELS_PERCENT, zoomPercent, DEFAULT_ZOOM_PERCENT),
    readingWidth: oneOf(READING_WIDTHS, readingWidth, DEFAULT_VIEW_SETTINGS.readingWidth),
    typography: oneOf(TYPOGRAPHIES, typography, DEFAULT_VIEW_SETTINGS.typography),
    language: typeof language === 'string' && LANGUAGE_TAG.test(language) ? language : 'system',
    isSidebarVisible: booleanOr(isSidebarVisible, true),
    sidebarView: oneOf(SIDEBAR_VIEWS, sidebarView, DEFAULT_VIEW_SETTINGS.sidebarView),
    isStatusBarVisible: booleanOr(isStatusBarVisible, true),
    isBreadcrumbsVisible: booleanOr(isBreadcrumbsVisible, true),
    collapsedExplorerSections: EXPLORER_SECTIONS.filter(
      (section) => Array.isArray(collapsedExplorerSections) && collapsedExplorerSections.includes(section),
    ),
    explorerSectionHeights: parseSectionHeights(explorerSectionHeights),
    panelWidths: parsePanelWidths(panelWidths),
    isPreviewBesideEditor: isPreviewBesideEditor === true,
    editorSharePercent: parseEditorShare(editorSharePercent),
  };
}

function oneOf<Choice>(choices: readonly Choice[], saved: unknown, fallback: Choice): Choice {
  return choices.find((choice) => choice === saved) ?? fallback;
}

function booleanOr(saved: unknown, fallback: boolean): boolean {
  return typeof saved === 'boolean' ? saved : fallback;
}

function parseEditorShare(saved: unknown): number {
  return typeof saved === 'number' && Number.isFinite(saved)
    ? clampEditorShare(saved)
    : DEFAULT_EDITOR_SHARE_PERCENT;
}

function parsePanelWidths(saved: unknown): Partial<Record<ResizablePanel, number>> {
  if (typeof saved !== 'object' || saved === null) return {};
  const widths = saved as Record<string, unknown>;
  return Object.fromEntries(
    RESIZABLE_PANELS.flatMap((panel) => {
      const width = widths[panel];
      return typeof width === 'number' && Number.isFinite(width) ? [[panel, clampPanelWidth(width)]] : [];
    }),
  );
}

function clampPanelWidth(widthPx: number): number {
  return Math.round(Math.min(Math.max(widthPx, MIN_PANEL_WIDTH_PX), MAX_PANEL_WIDTH_PX));
}

function clampEditorShare(sharePercent: number): number {
  return Math.round(Math.min(Math.max(sharePercent, MIN_EDITOR_SHARE_PERCENT), MAX_EDITOR_SHARE_PERCENT));
}

function parseSectionHeights(saved: unknown): Partial<Record<ExplorerSection, number>> {
  if (typeof saved !== 'object' || saved === null) return {};
  const heights = saved as Record<string, unknown>;
  return Object.fromEntries(
    EXPLORER_SECTIONS.flatMap((section) => {
      const height = heights[section];
      return typeof height === 'number' && Number.isFinite(height)
        ? [[section, clampSectionHeight(height)]]
        : [];
    }),
  );
}

function clampSectionHeight(heightPx: number): number {
  return Math.round(
    Math.min(Math.max(heightPx, MIN_EXPLORER_SECTION_HEIGHT_PX), MAX_EXPLORER_SECTION_HEIGHT_PX),
  );
}
