export type ThemePreference = 'system' | 'light' | 'dark';
export type ReadingWidth = 'narrow' | 'medium' | 'wide' | 'full';
export type ExplorerSection = 'favourites' | 'folders' | 'recentFiles';

export interface ViewSettings {
  readonly theme: ThemePreference;
  readonly zoomPercent: number;
  readonly readingWidth: ReadingWidth;
  readonly isSidebarVisible: boolean;
  readonly isOutlineVisible: boolean;
  readonly isStatusBarVisible: boolean;
  readonly collapsedExplorerSections: readonly ExplorerSection[];
  /** Heights the user dragged sections to; a section without one takes the height of its content. */
  readonly explorerSectionHeights: Readonly<Partial<Record<ExplorerSection, number>>>;
}

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];
export const READING_WIDTHS: readonly ReadingWidth[] = ['narrow', 'medium', 'wide', 'full'];
export const EXPLORER_SECTIONS: readonly ExplorerSection[] = ['favourites', 'folders', 'recentFiles'];
export const MIN_EXPLORER_SECTION_HEIGHT_PX = 48;
export const MAX_EXPLORER_SECTION_HEIGHT_PX = 4000;
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
  isSidebarVisible: true,
  isOutlineVisible: true,
  isStatusBarVisible: true,
  collapsedExplorerSections: [],
  explorerSectionHeights: {},
};

export function zoomIn(settings: ViewSettings): ViewSettings {
  const next = ZOOM_LEVELS_PERCENT.find((level) => level > settings.zoomPercent);
  return next === undefined ? settings : { ...settings, zoomPercent: next };
}

export function zoomOut(settings: ViewSettings): ViewSettings {
  const previous = ZOOM_LEVELS_PERCENT.findLast((level) => level < settings.zoomPercent);
  return previous === undefined ? settings : { ...settings, zoomPercent: previous };
}

export function resetZoom(settings: ViewSettings): ViewSettings {
  return { ...settings, zoomPercent: DEFAULT_ZOOM_PERCENT };
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

/** Shows the Explorer with one of its sections open, such as Folders after opening a folder. */
export function showExplorerSection(settings: ViewSettings, section: ExplorerSection): ViewSettings {
  return {
    ...settings,
    isSidebarVisible: true,
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
    isSidebarVisible,
    isOutlineVisible,
    isStatusBarVisible,
    collapsedExplorerSections,
    explorerSectionHeights,
  } = saved as Record<string, unknown>;
  return {
    theme: THEME_PREFERENCES.find((preference) => preference === theme) ?? DEFAULT_VIEW_SETTINGS.theme,
    zoomPercent: ZOOM_LEVELS_PERCENT.find((level) => level === zoomPercent) ?? DEFAULT_ZOOM_PERCENT,
    readingWidth:
      READING_WIDTHS.find((width) => width === readingWidth) ?? DEFAULT_VIEW_SETTINGS.readingWidth,
    isSidebarVisible: typeof isSidebarVisible === 'boolean' ? isSidebarVisible : true,
    isOutlineVisible: typeof isOutlineVisible === 'boolean' ? isOutlineVisible : true,
    isStatusBarVisible: typeof isStatusBarVisible === 'boolean' ? isStatusBarVisible : true,
    collapsedExplorerSections: EXPLORER_SECTIONS.filter(
      (section) => Array.isArray(collapsedExplorerSections) && collapsedExplorerSections.includes(section),
    ),
    explorerSectionHeights: parseSectionHeights(explorerSectionHeights),
  };
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
