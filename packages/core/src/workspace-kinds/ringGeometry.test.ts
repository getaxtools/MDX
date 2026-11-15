import { describe, expect, it } from 'vitest';
import {
  hitTestRing,
  ringLayout,
  rimArcPath,
  sectorPath,
  sectorPointAt,
  type RingLayout,
  type RingPoint,
  type RingSector,
} from './ringGeometry';

const RADII = { outer: 96, inner: 40 };
const MIDDLE_RADIUS = 68;
const SHAPE = { gap: 6, cornerRadius: 6 };
const EDGE_BAND = 24;

const straightUp = { x: 0, y: -MIDDLE_RADIUS };
const straightRight = { x: MIDDLE_RADIUS, y: 0 };
const straightDown = { x: 0, y: MIDDLE_RADIUS };
const straightLeft = { x: -MIDDLE_RADIUS, y: 0 };

function segmentAt(point: RingPoint, count: number, direction: 1 | -1 = 1) {
  const hit = hitTestRing(point, ringLayout(count, RADII, direction));
  return hit.area === 'segment' ? hit.index : hit.area;
}

function segmentWithBandAt(point: RingPoint, count: number, direction: 1 | -1 = 1) {
  const hit = hitTestRing(point, ringLayout(count, RADII, direction), EDGE_BAND);
  return hit.area === 'segment' ? hit.index : hit.area;
}

function sectorOf(layout: RingLayout, index: number): RingSector {
  const sector = layout.sectors[index];
  if (!sector) throw new Error(`expected sector ${String(index)}`);
  return sector;
}

interface StraightEdges {
  readonly start: readonly [RingPoint, RingPoint];
  readonly end: readonly [RingPoint, RingPoint];
}

/** The two straight sides of a drawn sector, each from its outer to its inner end. */
function straightEdgesOf(path: string): StraightEdges {
  const tokens = path.split(' ');
  const pointAt = (index: number): RingPoint => ({ x: Number(tokens[index]), y: Number(tokens[index + 1]) });
  const lineIndex = tokens.indexOf('L');
  const closeIndex = tokens.indexOf('Z');
  return {
    start: [pointAt(1), pointAt(closeIndex - 2)],
    end: [pointAt(lineIndex - 2), pointAt(lineIndex + 1)],
  };
}

function distanceFromLine(point: RingPoint, [from, to]: readonly [RingPoint, RingPoint]): number {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.abs((to.x - from.x) * (from.y - point.y) - (from.x - point.x) * (to.y - from.y)) / length;
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

    it('gives the middle of a gap to the next segment clockwise', () => {
      const middleOfRightGap = { x: 70, y: 0 };
      const middleOfLeftGap = { x: -70, y: 0 };

      expect(segmentAt(middleOfRightGap, 2)).toBe(1);
      expect(segmentAt(middleOfLeftGap, 2)).toBe(0);
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

  describe('edge band', () => {
    it('gives a point in the edge band beyond the outer radius to the segment in its direction', () => {
      expect(segmentWithBandAt({ x: 96 + 12, y: 0 }, 4)).toBe(1);
      expect(segmentWithBandAt({ x: 0, y: 96 + 23 }, 4)).toBe(2);
    });

    it('treats a point beyond the edge band as outside', () => {
      expect(segmentWithBandAt({ x: 96 + 40, y: 0 }, 4)).toBe('outside');
    });

    it('follows the mirrored layout in right-to-left layouts', () => {
      expect(segmentWithBandAt({ x: -(96 + 12), y: 0 }, 4, -1)).toBe(1);
      expect(segmentWithBandAt({ x: 96 + 12, y: 0 }, 4, -1)).toBe(3);
    });

    it('has no edge band unless one is given', () => {
      expect(segmentAt({ x: 96 + 12, y: 0 }, 4)).toBe('outside');
    });
  });

  describe('drawing', () => {
    it('draws one segment as a closed ring of two circles without a seam', () => {
      const layout = ringLayout(1, RADII, 1);

      const path = sectorPath(sectorOf(layout, 0), layout, SHAPE);

      expect(path.match(/A /g)).toHaveLength(4);
      expect(path.match(/Z/g)).toHaveLength(2);
      expect(path).not.toContain('L');
      expect(path).toContain('M 0 -96');
      expect(path).toContain('M 0 -40');
    });

    it('keeps the gap between neighbouring segments the same width at the inner and outer edge', () => {
      const layout = ringLayout(8, RADII, 1);
      const first = straightEdgesOf(sectorPath(sectorOf(layout, 0), layout, SHAPE));
      const second = straightEdgesOf(sectorPath(sectorOf(layout, 1), layout, SHAPE));

      const gapAtOuterEdge = distanceFromLine(first.end[0], second.start);
      const gapAtInnerEdge = distanceFromLine(first.end[1], second.start);

      expect(gapAtOuterEdge).toBeCloseTo(6, 2);
      expect(gapAtInnerEdge).toBeCloseTo(6, 2);
    });

    it('keeps the gap even in right-to-left layouts', () => {
      const layout = ringLayout(3, RADII, -1);
      const first = straightEdgesOf(sectorPath(sectorOf(layout, 0), layout, SHAPE));
      const onItsRight = straightEdgesOf(sectorPath(sectorOf(layout, 2), layout, SHAPE));

      expect(distanceFromLine(first.end[0], onItsRight.start)).toBeCloseTo(6, 2);
      expect(distanceFromLine(first.end[1], onItsRight.start)).toBeCloseTo(6, 2);
    });

    it('rounds every corner of a segment', () => {
      const layout = ringLayout(3, RADII, 1);

      const path = sectorPath(sectorOf(layout, 0), layout, SHAPE);

      expect(path.match(/A 6 6 0 0 1 /g)).toHaveLength(4);
      expect(path).toContain('A 96 96 0 0 1');
      expect(path).toContain('A 40 40 0 0 0');
    });

    it('starts a segment on its straight side, inside the ring', () => {
      const layout = ringLayout(4, RADII, 1);

      const { start, end } = straightEdgesOf(sectorPath(sectorOf(layout, 0), layout, SHAPE));

      for (const point of [...start, ...end]) {
        expect(Math.hypot(point.x, point.y)).toBeLessThan(RADII.outer);
        expect(Math.hypot(point.x, point.y)).toBeGreaterThan(RADII.inner);
      }
    });

    it('draws the rim arc along the outer edge of the segment only', () => {
      const layout = ringLayout(3, RADII, 1);

      const rim = rimArcPath(sectorOf(layout, 1), layout, { radius: 99, shape: SHAPE });

      expect(rim).toMatch(/^M [\d.-]+ [\d.-]+ A 99 99 0 0 1 [\d.-]+ [\d.-]+$/);
      const [, startX, startY] = rim.split(' ').map(Number);
      expect(Math.atan2(startX ?? 0, -(startY ?? 0))).toBeGreaterThan(Math.PI / 3);
    });

    it('draws the rim of a single segment as a whole circle', () => {
      const layout = ringLayout(1, RADII, 1);

      const rim = rimArcPath(sectorOf(layout, 0), layout, { radius: 99, shape: SHAPE });

      expect(rim.match(/A 99 99/g)).toHaveLength(2);
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

    it('finds a point at any radius on the middle of a segment', () => {
      const layout = ringLayout(4, RADII, 1);

      const point = sectorPointAt(sectorOf(layout, 1), 50);

      expect(point.x).toBeCloseTo(50);
      expect(point.y).toBeCloseTo(0);
    });
  });
});
