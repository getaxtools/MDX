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

export function hitTestRing(point: RingPoint, layout: RingLayout): RingHit {
  const distance = Math.hypot(point.x, point.y);
  if (distance < layout.radii.inner) return { area: 'gear' };
  if (distance > layout.radii.outer || layout.sectors.length === 0) return { area: 'outside' };
  const step = FULL_TURN / layout.sectors.length;
  const screenAngle = normalizedAngle(Math.atan2(point.x, -point.y));
  const readingAngle = layout.direction === 1 ? screenAngle : normalizedAngle(-screenAngle);
  const index = Math.floor(normalizedAngle(readingAngle + step / 2) / step) % layout.sectors.length;
  return { area: 'segment', index };
}

/** SVG path data for one sector, with a gap on each side; a ring of one sector is drawn whole. */
export function sectorPath(sector: RingSector, layout: RingLayout, gapRadians: number): string {
  const { outer, inner } = layout.radii;
  if (layout.sectors.length === 1) return [...circlePath(outer), ...circlePath(inner)].join(' ');
  const start = sector.startAngle + gapRadians / 2;
  const end = sector.endAngle - gapRadians / 2;
  const largeArc = end - start > Math.PI ? 1 : 0;
  return [
    'M',
    ...coordinates(pointAt(outer, start)),
    ...arc(outer, { largeArc, isClockwise: true }),
    ...coordinates(pointAt(outer, end)),
    'L',
    ...coordinates(pointAt(inner, end)),
    ...arc(inner, { largeArc, isClockwise: false }),
    ...coordinates(pointAt(inner, start)),
    'Z',
  ].join(' ');
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
