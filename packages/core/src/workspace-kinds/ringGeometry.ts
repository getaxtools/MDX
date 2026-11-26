export interface RingRadii {
  readonly outer: number;
  readonly inner: number;
}

/** 1 where segments follow the clock, -1 where a right-to-left layout mirrors them. */
export type RingDirection = 1 | -1;

/** A point relative to the centre of the ring, with y growing downwards as on screen. */
export interface RingPoint {
  readonly x: number;
  readonly y: number;
}

export interface RingSector {
  readonly index: number;
  /** Where the sector is drawn, in radians clockwise from 12 o'clock on screen. */
  readonly startAngle: number;
  readonly endAngle: number;
  readonly iconCenter: RingPoint;
}

export interface RingLayout {
  readonly radii: RingRadii;
  readonly direction: RingDirection;
  readonly sectors: readonly RingSector[];
}

/** How a sector is drawn, in the same units as the radii. */
export interface SectorShape {
  /** Width of the gap between neighbouring sectors, the same at every radius. */
  readonly gap: number;
  readonly cornerRadius: number;
}

export interface RimShape {
  readonly radius: number;
  readonly shape: SectorShape;
}

export type RingHit =
  | { readonly area: 'segment'; readonly index: number }
  | { readonly area: 'gear' }
  | { readonly area: 'outside' };

const FULL_TURN = 2 * Math.PI;
const PATH_DECIMALS = 3;

// Angles run clockwise from 12 o'clock, so segment 0 is centred at the top. A right-to-left
// layout mirrors the angle rather than the order, so segment numbers keep following reading
// order, and a point on a boundary belongs to the next segment in that order.
export function ringLayout(count: number, radii: RingRadii, direction: RingDirection): RingLayout {
  const step = FULL_TURN / count;
  const middleRadius = (radii.outer + radii.inner) / 2;
  const sectors = Array.from({ length: count }, (_, index) => {
    const centerAngle = normalizedAngle(direction * index * step);
    return {
      index,
      startAngle: centerAngle - step / 2,
      endAngle: centerAngle + step / 2,
      iconCenter: pointAt(middleRadius, centerAngle),
    };
  });
  return { radii, direction, sectors };
}

/**
 * Which part of the ring a point is in. A point up to `edgeBand` beyond the outer edge still
 * belongs to the segment in its direction, so a quick flick that overshoots still lands.
 */
export function hitTestRing(point: RingPoint, layout: RingLayout, edgeBand = 0): RingHit {
  const distance = Math.hypot(point.x, point.y);
  if (distance < layout.radii.inner) return { area: 'gear' };
  if (distance > layout.radii.outer + edgeBand || layout.sectors.length === 0) return { area: 'outside' };
  const step = FULL_TURN / layout.sectors.length;
  const screenAngle = normalizedAngle(Math.atan2(point.x, -point.y));
  const readingAngle = layout.direction === 1 ? screenAngle : normalizedAngle(-screenAngle);
  const index = Math.floor(normalizedAngle(readingAngle + step / 2) / step) % layout.sectors.length;
  return { area: 'segment', index };
}

/** The point at a radius on the line through the middle of a sector. */
export function sectorPointAt(sector: RingSector, radius: number): RingPoint {
  return pointAt(radius, middleAngleOf(sector));
}

/**
 * SVG path data for one sector with rounded corners and a gap of even width on each side; a ring of
 * one sector is drawn as two whole circles, so it has no seam.
 */
export function sectorPath(sector: RingSector, layout: RingLayout, shape: SectorShape): string {
  const { outer, inner } = layout.radii;
  if (layout.sectors.length === 1) return [...circlePath(outer), ...circlePath(inner)].join(' ');
  const outerCorner = cornerAngles(outer - shape.cornerRadius, shape);
  const innerCorner = cornerAngles(inner + shape.cornerRadius, shape);
  const corner = arc(shape.cornerRadius, { largeArc: 0, isClockwise: true });
  return [
    'M',
    ...coordinates(pointAt(outerCorner.lineRadius, sector.startAngle + outerCorner.lineAngle)),
    ...corner,
    ...coordinates(pointAt(outer, sector.startAngle + outerCorner.circleAngle)),
    ...arc(outer, { largeArc: largeArcFlag(sector, outerCorner), isClockwise: true }),
    ...coordinates(pointAt(outer, sector.endAngle - outerCorner.circleAngle)),
    ...corner,
    ...coordinates(pointAt(outerCorner.lineRadius, sector.endAngle - outerCorner.lineAngle)),
    'L',
    ...coordinates(pointAt(innerCorner.lineRadius, sector.endAngle - innerCorner.lineAngle)),
    ...corner,
    ...coordinates(pointAt(inner, sector.endAngle - innerCorner.circleAngle)),
    ...arc(inner, { largeArc: largeArcFlag(sector, innerCorner), isClockwise: false }),
    ...coordinates(pointAt(inner, sector.startAngle + innerCorner.circleAngle)),
    ...corner,
    ...coordinates(pointAt(innerCorner.lineRadius, sector.startAngle + innerCorner.lineAngle)),
    'Z',
  ].join(' ');
}

/** SVG path data for an open arc at `radius` that spans the outer edge of a drawn sector. */
export function rimArcPath(sector: RingSector, layout: RingLayout, rim: RimShape): string {
  if (layout.sectors.length === 1) return circlePath(rim.radius).slice(0, -1).join(' ');
  const { circleAngle } = cornerAngles(layout.radii.outer - rim.shape.cornerRadius, rim.shape);
  const start = sector.startAngle + circleAngle;
  const end = sector.endAngle - circleAngle;
  return [
    'M',
    ...coordinates(pointAt(rim.radius, start)),
    ...arc(rim.radius, { largeArc: end - start > Math.PI ? 1 : 0, isClockwise: true }),
    ...coordinates(pointAt(rim.radius, end)),
  ].join(' ');
}

interface CornerAngles {
  /** How far round from the sector boundary the corner meets the circle. */
  readonly circleAngle: number;
  /** Where the corner meets the straight side, in polar form from the centre. */
  readonly lineAngle: number;
  readonly lineRadius: number;
}

// Each straight side runs parallel to the sector boundary at half the gap, so the gap keeps one
// width at every radius. A corner is a circle of the corner radius that touches both the side and
// the ring circle; its centre sits at half the gap plus the corner radius from the boundary, and
// at the ring circle's radius moved into the ring by the corner radius.
function cornerAngles(cornerCentreRadius: number, shape: SectorShape): CornerAngles {
  const halfGap = shape.gap / 2;
  const offset = halfGap + shape.cornerRadius;
  const along = Math.sqrt(cornerCentreRadius ** 2 - offset ** 2);
  return {
    circleAngle: Math.atan2(offset, along),
    lineAngle: Math.atan2(halfGap, along),
    lineRadius: Math.hypot(along, halfGap),
  };
}

function largeArcFlag(sector: RingSector, corner: CornerAngles): 0 | 1 {
  return sector.endAngle - sector.startAngle - 2 * corner.circleAngle > Math.PI ? 1 : 0;
}

function middleAngleOf(sector: RingSector): number {
  return (sector.startAngle + sector.endAngle) / 2;
}

function arc(radius: number, { largeArc, isClockwise }: { largeArc: 0 | 1; isClockwise: boolean }) {
  return ['A', radius, radius, 0, largeArc, isClockwise ? 1 : 0];
}

function circlePath(radius: number): (string | number)[] {
  const fullArc = { largeArc: 1, isClockwise: true } as const;
  return ['M', 0, -radius, ...arc(radius, fullArc), 0, radius, ...arc(radius, fullArc), 0, -radius, 'Z'];
}

function pointAt(radius: number, angle: number): RingPoint {
  return { x: radius * Math.sin(angle), y: -radius * Math.cos(angle) };
}

function coordinates({ x, y }: RingPoint): number[] {
  return [rounded(x), rounded(y)];
}

function rounded(value: number): number {
  return Number(value.toFixed(PATH_DECIMALS)) || 0;
}

function normalizedAngle(angle: number): number {
  return ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN;
}
