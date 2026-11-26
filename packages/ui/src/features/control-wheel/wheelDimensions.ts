import { sectorPointAt, type RingLayout, type RingPoint, type RingSector, type SectorShape } from '@mdx/core';

// The ring is drawn in a 200-unit view box that fills the wheel, so at 100% text size one unit is
// one pixel; every size below is in those units and so grows and shrinks with the wheel.
export const VIEW_BOX_SIZE = 200;
export const RING_RADII = { outer: 96, inner: 40 };
export const SECTOR_SHAPE: SectorShape = { gap: 6, cornerRadius: 6 };
/** The frosted surface reaches past the tiles, so it shows in the gaps, the hub and a band round the rim. */
const SURFACE_BAND = 6;
export const RIM_WIDTH = 3;
/** Key caps sit between the icons and the gear, clear of the check badge. */
const KEY_CAP_OFFSET = 10;
const HALF_PERCENT = 50;
export const SURFACE_RADIUS = RING_RADII.outer + SURFACE_BAND;
/** The rim runs along the inside of the tile's outer edge, so it always lies on the opaque tile. */
export const RIM_RADIUS = RING_RADII.outer - RIM_WIDTH / 2;
export const KEY_CAP_RADIUS = RING_RADII.inner + KEY_CAP_OFFSET;
export const LIT_LIFT = 4;
export const EDGE_BAND_REM = 1.5;

const LIFT_DECIMALS = 2;

/**
 * How far a lit segment moves outward along its middle, as a CSS `translate` value in pixels for
 * the given pixels per unit; a ring of one segment stays in place.
 */
export function liftTranslation(sector: RingSector, layout: RingLayout, pixelsPerUnit: number): string {
  const lift = layout.sectors.length === 1 ? { x: 0, y: 0 } : sectorPointAt(sector, LIT_LIFT);
  return `${pixels(lift.x * pixelsPerUnit)} ${pixels(lift.y * pixelsPerUnit)}`;
}

function pixels(value: number): string {
  return `${String(Number(value.toFixed(LIFT_DECIMALS)) || 0)}px`;
}

/** Where a point in view units sits in the wheel, as a percentage of its size from the top left corner. */
export function percentPositionOf(point: RingPoint): RingPoint {
  return {
    x: HALF_PERCENT + percentOfRadius(point.x),
    y: HALF_PERCENT + percentOfRadius(point.y),
  };
}

/** The CSS `inset` that makes a round element inside the wheel reach out to a radius. */
export function insetForRadius(radius: number): string {
  return `${String(HALF_PERCENT - percentOfRadius(radius))}%`;
}

function percentOfRadius(distance: number): number {
  return (distance / (VIEW_BOX_SIZE / 2)) * HALF_PERCENT;
}
