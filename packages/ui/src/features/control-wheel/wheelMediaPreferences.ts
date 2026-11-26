export interface WheelMediaPreferences {
  readonly isMotionReduced: boolean;
  /** Transparency effects are off, a contrast theme is on, or the app's high contrast theme is chosen. */
  readonly isSurfaceOpaque: boolean;
}

const OPAQUE_SURFACE_QUERIES = ['(prefers-reduced-transparency: reduce)', '(forced-colors: active)'];
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const HIGH_CONTRAST_THEME = 'highContrast';

/** Read once each time the wheel opens, so a test can pin the result and nothing listens while closed. */
export function readWheelMediaPreferences(root: HTMLElement): WheelMediaPreferences {
  return {
    isMotionReduced: matchesMedia(REDUCED_MOTION_QUERY),
    isSurfaceOpaque:
      root.dataset.theme === HIGH_CONTRAST_THEME ||
      OPAQUE_SURFACE_QUERIES.some((query) => matchesMedia(query)),
  };
}

function matchesMedia(query: string): boolean {
  return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia(query).matches;
}
