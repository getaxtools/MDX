export type ThemePreference = 'system' | 'light' | 'dark';
export type ReadingWidth = 'narrow' | 'medium' | 'wide' | 'full';

export interface ViewSettings {
  readonly theme: ThemePreference;
  readonly zoomPercent: number;
  readonly readingWidth: ReadingWidth;
  readonly isSidebarVisible: boolean;
  readonly isOutlineVisible: boolean;
  readonly isStatusBarVisible: boolean;
}

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];
export const READING_WIDTHS: readonly ReadingWidth[] = ['narrow', 'medium', 'wide', 'full'];
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

export function parseViewSettings(saved: unknown): ViewSettings {
  if (typeof saved !== 'object' || saved === null) return DEFAULT_VIEW_SETTINGS;
  const { theme, zoomPercent, readingWidth, isSidebarVisible, isOutlineVisible, isStatusBarVisible } =
    saved as Record<string, unknown>;
  return {
    theme: THEME_PREFERENCES.find((preference) => preference === theme) ?? DEFAULT_VIEW_SETTINGS.theme,
    zoomPercent: ZOOM_LEVELS_PERCENT.find((level) => level === zoomPercent) ?? DEFAULT_ZOOM_PERCENT,
    readingWidth:
      READING_WIDTHS.find((width) => width === readingWidth) ?? DEFAULT_VIEW_SETTINGS.readingWidth,
    isSidebarVisible: typeof isSidebarVisible === 'boolean' ? isSidebarVisible : true,
    isOutlineVisible: typeof isOutlineVisible === 'boolean' ? isOutlineVisible : true,
    isStatusBarVisible: typeof isStatusBarVisible === 'boolean' ? isStatusBarVisible : true,
  };
}
