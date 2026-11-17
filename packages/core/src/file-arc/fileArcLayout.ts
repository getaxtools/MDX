/** The dial's centre lies this far outside the inline-start edge of the document area. */
export const ARC_CENTRE_OUTSIDE_PX = 230;
/** Names end on this circle, as the card's trailing edge does. */
export const ARC_NAME_RADIUS_PX = 550;
export const ARC_DOT_RADIUS_PX = 590;
export const ARC_DIAL_RADIUS_PX = 612;
/** The card's trailing edge sits here from the edge and leaves it this much room. */
export const ARC_CARD_END_PX = ARC_NAME_RADIUS_PX - ARC_CENTRE_OUTSIDE_PX;
export const ARC_CARD_MAX_WIDTH_PX = 284;
export const MAX_NAMES_PER_SIDE = 4;
/** The look was drawn for a 900 pixel document area with names 10.5 degrees apart. */
const DRAWN_AREA_HEIGHT_PX = 900;
const DRAWN_STEP_DEGREES = 10.5;
/** Names stay at least 44 pixels apart, as touch targets. */
const MIN_STEP_DEGREES = 4.5;
const NAME_HALF_HEIGHT_PX = 16;
const DOT_HALF_SIZE_PX = 5;
/** The hint at the bottom of the area, and its margin, which no name may cover. */
const HINT_CLEARANCE_PX = 64;
const SCALE_LOSS_PER_STEP = 0.06;
const OPACITY_LOSS_PER_STEP = 0.19;
const DOT_OPACITY_NEAR = 0.55;
const DOT_OPACITY_LOSS_PER_STEP = 0.08;
const DEGREES_PER_HALF_TURN = 180;
const DEGREES_TO_RADIANS = Math.PI / DEGREES_PER_HALF_TURN;

export type LayoutDirection = 'ltr' | 'rtl';

export interface FileArcLayoutRequest {
  readonly listLength: number;
  readonly highlighted: number;
  readonly areaWidth: number;
  readonly areaHeight: number;
  readonly direction: LayoutDirection;
}

/** A shown name: `distance` is negative before the highlight; `left` is physical, `top` from the middle. */
export interface FileArcPlace {
  readonly index: number;
  readonly distance: number;
  readonly left: number;
  readonly top: number;
  readonly scale: number;
  readonly opacity: number;
}

export interface FileArcLayout {
  readonly names: readonly FileArcPlace[];
  readonly dots: readonly FileArcPlace[];
  readonly card: { readonly left: number; readonly top: number };
  readonly dial: { readonly centreLeft: number; readonly radius: number };
  readonly stepDegrees: number;
}

/** Where everything on the arc goes; only the shown entries, at most nine, are laid out. */
export function fileArcLayout(request: FileArcLayoutRequest): FileArcLayout {
  const stepDegrees = stepDegreesFor(request.areaHeight);
  const perSide = namesPerSide(request.areaHeight, stepDegrees);
  const dotsPerSide = Math.min(perSide + 1, MAX_NAMES_PER_SIDE, dotsThatFit(request.areaHeight, stepDegrees));
  const physicalLeft = (inlineX: number) =>
    request.direction === 'rtl' ? request.areaWidth - inlineX : inlineX;
  const place = (distance: number, radius: number, opacity: number): FileArcPlace => {
    const angle = distance * stepDegrees * DEGREES_TO_RADIANS;
    return {
      index: wrapped(request.highlighted + distance, request.listLength),
      distance,
      left: physicalLeft(radius * Math.cos(angle) - ARC_CENTRE_OUTSIDE_PX),
      top: radius * Math.sin(angle),
      scale: 1 - SCALE_LOSS_PER_STEP * Math.abs(distance),
      opacity,
    };
  };
  return {
    names: distancesFor(request.listLength, perSide)
      .filter((distance) => distance !== 0)
      .map((distance) => place(distance, ARC_NAME_RADIUS_PX, 1 - OPACITY_LOSS_PER_STEP * Math.abs(distance))),
    dots: distancesFor(request.listLength, dotsPerSide).map((distance) =>
      place(distance, ARC_DOT_RADIUS_PX, dotOpacityAt(distance)),
    ),
    card: { left: physicalLeft(ARC_CARD_END_PX), top: 0 },
    dial: { centreLeft: physicalLeft(-ARC_CENTRE_OUTSIDE_PX), radius: ARC_DIAL_RADIUS_PX },
    stepDegrees,
  };
}

function stepDegreesFor(areaHeight: number): number {
  return Math.max(MIN_STEP_DEGREES, (DRAWN_STEP_DEGREES * areaHeight) / DRAWN_AREA_HEIGHT_PX);
}

/** The most names, from four down to one, whose outermost one stays inside the area above the hint. */
function namesPerSide(areaHeight: number, stepDegrees: number): number {
  const room = areaHeight / 2 - HINT_CLEARANCE_PX - NAME_HALF_HEIGHT_PX;
  for (let count = MAX_NAMES_PER_SIDE; count > 1; count -= 1) {
    if (ARC_NAME_RADIUS_PX * Math.sin(count * stepDegrees * DEGREES_TO_RADIANS) <= room) return count;
  }
  return 1;
}

function dotsThatFit(areaHeight: number, stepDegrees: number): number {
  const room = areaHeight / 2 - DOT_HALF_SIZE_PX;
  let count = 1;
  while (
    count < MAX_NAMES_PER_SIDE &&
    ARC_DOT_RADIUS_PX * Math.sin((count + 1) * stepDegrees * DEGREES_TO_RADIANS) <= room
  ) {
    count += 1;
  }
  return count;
}

/** The distances shown around the highlight; a short list shows each entry once, more of them after it. */
function distancesFor(listLength: number, perSide: number): number[] {
  if (listLength <= 0) return [];
  const before = Math.min(perSide, Math.floor((listLength - 1) / 2));
  const after = Math.min(perSide, listLength - 1 - before);
  return Array.from({ length: before + after + 1 }, (_, position) => position - before);
}

function dotOpacityAt(distance: number): number {
  return distance === 0 ? 1 : DOT_OPACITY_NEAR - DOT_OPACITY_LOSS_PER_STEP * Math.abs(distance);
}

function wrapped(index: number, length: number): number {
  return ((index % length) + length) % length;
}
