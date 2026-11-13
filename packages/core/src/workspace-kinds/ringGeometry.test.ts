import { describe, expect, it } from 'vitest';
import { hitTestRing, ringLayout, sectorPath } from './ringGeometry';

const RADII = { outer: 96, inner: 40 };
const MIDDLE_RADIUS = 68;

const straightUp = { x: 0, y: -MIDDLE_RADIUS };
const straightRight = { x: MIDDLE_RADIUS, y: 0 };
const straightDown = { x: 0, y: MIDDLE_RADIUS };
const straightLeft = { x: -MIDDLE_RADIUS, y: 0 };

function segmentAt(point: { x: number; y: number }, count: number, direction: 1 | -1 = 1) {
  const hit = hitTestRing(point, ringLayout(count, RADII, direction));
  return hit.area === 'segment' ? hit.index : hit.area;
}

describe('ring geometry', () => {
  describe('angle-to-segment hit testing', () => {
    it('puts the only segment all the way round', () => {
      expect(
        [straightUp, straightRight, straightDown, straightLeft].map((point) => segmentAt(point, 1)),
      ).toEqual([0, 0, 0, 0]);
    });

    it('splits two segments into top and bottom', () => {
      expect(segmentAt(straightUp, 2)).toBe(0);
      expect(segmentAt(straightDown, 2)).toBe(1);
    });

    it('goes clockwise from the top for three segments', () => {
      expect(segmentAt(straightUp, 3)).toBe(0);
      expect(segmentAt({ x: 50, y: 40 }, 3)).toBe(1);
      expect(segmentAt({ x: -50, y: 40 }, 3)).toBe(2);
    });

    it('goes clockwise from the top for four segments', () => {
      expect(
        [straightUp, straightRight, straightDown, straightLeft].map((point) => segmentAt(point, 4)),
      ).toEqual([0, 1, 2, 3]);
    });

    it('finds every one of eight segments', () => {
      const centres = ringLayout(8, RADII, 1).sectors.map((sector) => sector.iconCenter);

      expect(centres.map((centre) => segmentAt(centre, 8))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('gives a point on a boundary to the next segment clockwise', () => {
      expect(segmentAt({ x: 50, y: -50 }, 4)).toBe(1);
    });

    it('mirrors the ring in right-to-left layouts', () => {
      expect(segmentAt(straightRight, 4, -1)).toBe(3);
      expect(segmentAt(straightLeft, 4, -1)).toBe(1);
      expect(segmentAt(straightUp, 4, -1)).toBe(0);
    });

    it('treats a point inside the inner radius as the gear', () => {
      expect(segmentAt({ x: 10, y: 10 }, 3)).toBe('gear');
    });

    it('treats a point beyond the outer radius as outside', () => {
      expect(segmentAt({ x: 0, y: -120 }, 3)).toBe('outside');
    });
  });

  describe('drawing', () => {
    it('draws one segment as a full ring', () => {
      const layout = ringLayout(1, RADII, 1);
      const [sector] = layout.sectors;
      if (!sector) throw new Error('expected one sector');

      const path = sectorPath(sector, layout, 0.05);

      expect(path.match(/A /g)).toHaveLength(4);
      expect(path).toContain('M 0 -96');
      expect(path).toContain('M 0 -40');
    });

    it('draws a sector as two arcs joined by straight edges', () => {
      const layout = ringLayout(4, RADII, 1);
      const [first] = layout.sectors;
      if (!first) throw new Error('expected a sector');

      const path = sectorPath(first, layout, 0);

      expect(path).toBe(
        'M -67.882 -67.882 A 96 96 0 0 1 67.882 -67.882 L 28.284 -28.284 A 40 40 0 0 0 -28.284 -28.284 Z',
      );
    });

    it('puts icon centres on the middle radius', () => {
      const { sectors } = ringLayout(5, RADII, 1);

      for (const { iconCenter } of sectors)
        expect(Math.hypot(iconCenter.x, iconCenter.y)).toBeCloseTo(MIDDLE_RADIUS);
    });

    it('places the second icon on the left in right-to-left layouts', () => {
      const [, second] = ringLayout(4, RADII, -1).sectors;

      expect(second?.iconCenter.x).toBeCloseTo(-MIDDLE_RADIUS);
    });
  });
});
