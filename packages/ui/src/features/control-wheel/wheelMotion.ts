export interface MotionStep {
  readonly delayMs: number;
  readonly durationMs: number;
}

export interface WheelMotion {
  /** The surface, the gear and the caption growing in from the centre. */
  readonly surface: MotionStep;
  /** One step per segment in ring order, so they pop out one after another from the top. */
  readonly segments: readonly MotionStep[];
  readonly close: MotionStep;
  /** The chosen segment's pulse, played while the wheel fades out. */
  readonly confirm: MotionStep;
}

export interface WheelMotionRequest {
  readonly segmentCount: number;
  readonly isMotionReduced: boolean;
}

/** Whether the wheel is appearing, shown again during its fade without replaying the motion, or fading out. */
export type WheelPhase = 'opening' | 'reopened' | 'closing';

const SURFACE_OPEN_MS = 140;
const SEGMENT_OPEN_MS = 120;
const MAX_SEGMENT_STAGGER_MS = 16;
/** Spread across all segments, so eight segments still finish inside the open budget. */
const TOTAL_SEGMENT_STAGGER_MS = 60;
const CLOSE_MS = 120;
const CONFIRM_MS = 120;
const NO_MOTION: MotionStep = { delayMs: 0, durationMs: 0 };

/** When each part of the wheel moves; the kind switch and focus return never wait for it. */
export function wheelMotion({ segmentCount, isMotionReduced }: WheelMotionRequest): WheelMotion {
  if (isMotionReduced) {
    return {
      surface: NO_MOTION,
      segments: Array.from({ length: segmentCount }, () => NO_MOTION),
      close: NO_MOTION,
      confirm: NO_MOTION,
    };
  }
  const staggerMs = Math.min(MAX_SEGMENT_STAGGER_MS, TOTAL_SEGMENT_STAGGER_MS / Math.max(segmentCount, 1));
  return {
    surface: { delayMs: 0, durationMs: SURFACE_OPEN_MS },
    segments: Array.from({ length: segmentCount }, (_, index) => ({
      delayMs: index * staggerMs,
      durationMs: SEGMENT_OPEN_MS,
    })),
    close: { delayMs: 0, durationMs: CLOSE_MS },
    confirm: { delayMs: 0, durationMs: CONFIRM_MS },
  };
}
