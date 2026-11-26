/** Wheel down and Ctrl+Down move forward through the list; wheel up and Ctrl+Up move back. */
export type FileArcDirection = 'forward' | 'back';

/** One mouse wheel notch is about 100 pixels; half of it takes a step, so a notch always does. */
export const WHEEL_PIXELS_PER_STEP = 50;
/** `WheelEvent.deltaMode` reports lines or pages for some mice and settings. */
export const WHEEL_PIXELS_PER_LINE = 40;
const DELTA_MODE_LINE = 1;
const DELTA_MODE_PAGE = 2;

/**
 * Where the arc opens: one step from the active entry, or, when the active document is not listed,
 * the first entry going forward and the last going back. Undefined when nothing else is listed.
 */
export function startingIndex(
  keys: readonly string[],
  activeKey: string | undefined,
  direction: FileArcDirection,
): number | undefined {
  const activeIndex = activeKey === undefined ? -1 : keys.indexOf(activeKey);
  const others = activeIndex === -1 ? keys.length : keys.length - 1;
  if (others === 0) return undefined;
  if (activeIndex === -1) return direction === 'forward' ? 0 : keys.length - 1;
  return steppedIndex(activeIndex, keys.length, direction);
}

/** One entry further, wrapping past either end. */
export function steppedIndex(index: number, length: number, direction: FileArcDirection): number {
  const step = direction === 'forward' ? 1 : -1;
  return (((index + step) % length) + length) % length;
}

/** Wheel movement summed since the last step, in pixels; positive is down. */
export interface WheelSum {
  readonly pixels: number;
}

export const NO_WHEEL_MOVEMENT: WheelSum = { pixels: 0 };

export interface WheelMovement {
  readonly deltaY: number;
  readonly deltaMode: number;
}

/**
 * Adds a wheel event and takes at most one step once the sum reaches a step; a touchpad's many
 * small events then move one entry at a time, never skipping.
 */
export function addWheelMovement(
  sum: WheelSum,
  { deltaY, deltaMode }: WheelMovement,
  pageHeightPx: number,
): { readonly sum: WheelSum; readonly step: FileArcDirection | undefined } {
  const pixels = sum.pixels + deltaY * pixelsPerUnit(deltaMode, pageHeightPx);
  if (Math.abs(pixels) < WHEEL_PIXELS_PER_STEP) return { sum: { pixels }, step: undefined };
  return { sum: NO_WHEEL_MOVEMENT, step: pixels > 0 ? 'forward' : 'back' };
}

function pixelsPerUnit(deltaMode: number, pageHeightPx: number): number {
  if (deltaMode === DELTA_MODE_LINE) return WHEEL_PIXELS_PER_LINE;
  if (deltaMode === DELTA_MODE_PAGE) return pageHeightPx;
  return 1;
}
