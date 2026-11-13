import { describe, expect, it } from 'vitest';
import { wheelPlacement, type WheelPlacementRequest } from './wheelPlacement';

const LARGE_WINDOW: WheelPlacementRequest = {
  dock: 'bottomInlineEnd',
  direction: 1,
  windowWidthPx: 1200,
  windowHeightPx: 800,
  rootFontSizePx: 16,
  bottomInsetPx: 24,
  captionHeightPx: 32,
};

describe('control wheel placement', () => {
  it('docks at the bottom right in left-to-right layouts', () => {
    expect(wheelPlacement(LARGE_WINDOW)).toEqual({ centerX: 1084, centerY: 660, diameterPx: 200 });
  });

  it('docks at the bottom left in right-to-left layouts', () => {
    const placement = wheelPlacement({ ...LARGE_WINDOW, direction: -1 });

    expect(placement.centerX).toBe(116);
  });

  it('docks at the start corner when asked', () => {
    expect(wheelPlacement({ ...LARGE_WINDOW, dock: 'bottomInlineStart' }).centerX).toBe(116);
    expect(wheelPlacement({ ...LARGE_WINDOW, dock: 'bottomInlineStart', direction: -1 }).centerX).toBe(1084);
  });

  it('opens at the pointer', () => {
    expect(wheelPlacement({ ...LARGE_WINDOW, pointer: { x: 600, y: 400 } })).toMatchObject({
      centerX: 600,
      centerY: 400,
    });
  });

  it('moves a wheel opened near an edge so it fits in the window', () => {
    const placement = wheelPlacement({ ...LARGE_WINDOW, pointer: { x: 5, y: 5 } });

    expect(placement.centerX).toBe(116);
    expect(placement.centerY).toBe(148);
  });

  it('opens in the dock corner when the pointer position is not known', () => {
    expect(wheelPlacement({ ...LARGE_WINDOW, pointer: undefined })).toEqual(wheelPlacement(LARGE_WINDOW));
  });

  it('follows the text size', () => {
    expect(wheelPlacement({ ...LARGE_WINDOW, rootFontSizePx: 24 }).diameterPx).toBe(300);
  });

  it('never draws the wheel smaller than its minimum size when there is room', () => {
    expect(wheelPlacement({ ...LARGE_WINDOW, rootFontSizePx: 10 }).diameterPx).toBe(160);
  });

  it('shrinks the wheel to fit a small window and keeps it inside', () => {
    const placement = wheelPlacement({ ...LARGE_WINDOW, windowWidthPx: 400, windowHeightPx: 240 });

    expect(placement.diameterPx).toBe(152);
    expect(placement.centerY + placement.diameterPx / 2).toBeLessThanOrEqual(240 - 16 - 24);
    expect(placement.centerY - placement.diameterPx / 2).toBeGreaterThanOrEqual(16 + 32);
  });
});
