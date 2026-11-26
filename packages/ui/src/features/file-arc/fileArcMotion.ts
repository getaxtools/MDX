/** How the arc moves; every value is zero when reduced motion is asked for. */
export interface FileArcMotion {
  readonly openMs: number;
  /** How far the arc slides in from its edge while it fades in. */
  readonly openSlidePx: number;
  readonly stepMs: number;
  readonly closeMs: number;
}

const OPEN_MS = 170;
const OPEN_SLIDE_PX = 28;
const STEP_MS = 170;
const CLOSE_MS = 130;

export function fileArcMotion(isMotionReduced: boolean): FileArcMotion {
  if (isMotionReduced) return { openMs: 0, openSlidePx: 0, stepMs: 0, closeMs: 0 };
  return { openMs: OPEN_MS, openSlidePx: OPEN_SLIDE_PX, stepMs: STEP_MS, closeMs: CLOSE_MS };
}
