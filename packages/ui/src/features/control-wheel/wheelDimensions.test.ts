import { ringLayout } from '@mdx/core';
import { describe, expect, it } from 'vitest';
import { insetForRadius, liftTranslation, percentPositionOf, RING_RADII } from './wheelDimensions';

describe('wheel dimensions', () => {
  it('moves a lit segment four units outward along its middle', () => {
    const layout = ringLayout(4, RING_RADII, 1);
    const [top, right] = layout.sectors;
    if (!top || !right) throw new Error('expected four sectors');

    expect(liftTranslation(top, layout, 1)).toBe('0px -4px');
    expect(liftTranslation(right, layout, 1.5)).toBe('6px 0px');
  });

  it('keeps a ring of one segment in place', () => {
    const layout = ringLayout(1, RING_RADII, 1);
    const [only] = layout.sectors;
    if (!only) throw new Error('expected one sector');

    expect(liftTranslation(only, layout, 1)).toBe('0px 0px');
  });

  it('places a point in the wheel as a percentage of its size', () => {
    expect(percentPositionOf({ x: 0, y: 0 })).toEqual({ x: 50, y: 50 });
    expect(percentPositionOf({ x: 100, y: -100 })).toEqual({ x: 100, y: 0 });
  });

  it('reaches a round element out to a radius beyond the wheel box', () => {
    expect(insetForRadius(100)).toBe('0%');
    expect(insetForRadius(120)).toBe('-10%');
  });
});
