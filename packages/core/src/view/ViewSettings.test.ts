import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_SETTINGS, parseViewSettings, resetZoom, zoomIn, zoomOut } from './ViewSettings';

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
    };

    expect(parseViewSettings(saved)).toEqual(saved);
  });

  it('falls back to defaults for missing or invalid values', () => {
    expect(parseViewSettings(undefined)).toEqual(DEFAULT_VIEW_SETTINGS);
    expect(
      parseViewSettings({ theme: 'neon', zoomPercent: 333, readingWidth: 3, isSidebarVisible: 'no' }),
    ).toEqual(DEFAULT_VIEW_SETTINGS);
  });
});
