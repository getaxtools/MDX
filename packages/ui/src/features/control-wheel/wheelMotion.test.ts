import { describe, expect, it } from 'vitest';
import { wheelMotion, type MotionStep } from './wheelMotion';

const OPEN_BUDGET_MS = 200;
const CLOSE_BUDGET_MS = 120;

function endOf(steps: readonly MotionStep[]): number {
  return Math.max(...steps.map((step) => step.delayMs + step.durationMs));
}

describe('wheel motion', () => {
  it('starts the segments appearing clockwise from the top', () => {
    const { segments } = wheelMotion({ segmentCount: 3, isMotionReduced: false });

    expect(segments[0]?.delayMs).toBe(0);
    expect(segments.map((segment) => segment.delayMs)).toEqual([0, 16, 32]);
  });

  it('gives every segment a step', () => {
    expect(wheelMotion({ segmentCount: 5, isMotionReduced: false }).segments).toHaveLength(5);
  });

  it('ends the open motion within 200 milliseconds for one to eight segments', () => {
    for (let segmentCount = 1; segmentCount <= 8; segmentCount += 1) {
      const { surface, segments } = wheelMotion({ segmentCount, isMotionReduced: false });

      expect(endOf([surface, ...segments]), `${String(segmentCount)} segments`).toBeLessThanOrEqual(
        OPEN_BUDGET_MS,
      );
    }
  });

  it('ends the close motion and the confirmation pulse within 120 milliseconds', () => {
    const { close, confirm } = wheelMotion({ segmentCount: 8, isMotionReduced: false });

    expect(endOf([close])).toBeLessThanOrEqual(CLOSE_BUDGET_MS);
    expect(endOf([confirm])).toBeLessThanOrEqual(endOf([close]));
  });

  it('makes every delay and duration zero with reduced motion', () => {
    const { surface, segments, close, confirm } = wheelMotion({ segmentCount: 4, isMotionReduced: true });

    expect(endOf([surface, ...segments, close, confirm])).toBe(0);
    expect(segments).toHaveLength(4);
  });
});
