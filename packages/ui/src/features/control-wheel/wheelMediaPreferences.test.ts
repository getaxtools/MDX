import { afterEach, describe, expect, it, vi } from 'vitest';
import { readWheelMediaPreferences } from './wheelMediaPreferences';

function stubMatchingMedia(...matchingQueries: string[]) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: matchingQueries.includes(query) }));
}

describe('wheel media preferences', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.theme;
  });

  it('reduces nothing when the system asks for nothing', () => {
    stubMatchingMedia();

    expect(readWheelMediaPreferences(document.documentElement)).toEqual({
      isMotionReduced: false,
      isSurfaceOpaque: false,
    });
  });

  it('reduces motion when the system asks for it', () => {
    stubMatchingMedia('(prefers-reduced-motion: reduce)');

    expect(readWheelMediaPreferences(document.documentElement).isMotionReduced).toBe(true);
  });

  it('makes the surface opaque when transparency effects are off', () => {
    stubMatchingMedia('(prefers-reduced-transparency: reduce)');

    expect(readWheelMediaPreferences(document.documentElement).isSurfaceOpaque).toBe(true);
  });

  it('makes the surface opaque in a contrast theme', () => {
    stubMatchingMedia('(forced-colors: active)');

    expect(readWheelMediaPreferences(document.documentElement).isSurfaceOpaque).toBe(true);
  });

  it('makes the surface opaque with the high contrast app theme', () => {
    stubMatchingMedia();
    document.documentElement.dataset.theme = 'highContrast';

    expect(readWheelMediaPreferences(document.documentElement).isSurfaceOpaque).toBe(true);
  });

  it('reduces nothing where media queries cannot be read', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(readWheelMediaPreferences(document.documentElement)).toEqual({
      isMotionReduced: false,
      isSurfaceOpaque: false,
    });
  });
});
