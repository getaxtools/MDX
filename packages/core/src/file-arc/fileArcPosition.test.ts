import { describe, expect, it } from 'vitest';
import {
  NO_WHEEL_MOVEMENT,
  addWheelMovement,
  startingIndex,
  steppedIndex,
  type WheelSum,
} from './fileArcPosition';

const KEYS = ['readme.md', 'getting-started.md', 'install.md'];
const PIXELS = 0;
const LINES = 1;
const PAGES = 2;
const NOTCH = { deltaY: 100, deltaMode: PIXELS };
const PAGE_HEIGHT = 800;

describe('fileArcPosition', () => {
  it('ctrl and wheel down opens the arc on the next file', () => {
    const { step } = addWheelMovement(NO_WHEEL_MOVEMENT, NOTCH, PAGE_HEIGHT);

    expect(step).toBe('forward');
    expect(startingIndex(KEYS, 'getting-started.md', 'forward')).toBe(2);
  });

  it('ctrl and wheel up opens the arc on the previous file', () => {
    const { step } = addWheelMovement(NO_WHEEL_MOVEMENT, { deltaY: -100, deltaMode: PIXELS }, PAGE_HEIGHT);

    expect(step).toBe('back');
    expect(startingIndex(KEYS, 'getting-started.md', 'back')).toBe(0);
  });

  it('one notch moves one entry', () => {
    const lineNotch = addWheelMovement(NO_WHEEL_MOVEMENT, { deltaY: 3, deltaMode: LINES }, PAGE_HEIGHT);
    const pageNotch = addWheelMovement(NO_WHEEL_MOVEMENT, { deltaY: 1, deltaMode: PAGES }, PAGE_HEIGHT);
    const bigNotch = addWheelMovement(NO_WHEEL_MOVEMENT, { deltaY: 600, deltaMode: PIXELS }, PAGE_HEIGHT);

    expect([lineNotch.step, pageNotch.step, bigNotch.step]).toEqual(['forward', 'forward', 'forward']);
    expect(bigNotch.sum).toEqual(NO_WHEEL_MOVEMENT);
    expect(steppedIndex(2, 12, 'forward')).toBe(3);
  });

  it('a small touchpad scroll does not skip entries', () => {
    let sum: WheelSum = NO_WHEEL_MOVEMENT;
    const steps: string[] = [];

    for (const deltaY of [12, 15, 18, 20, 14]) {
      const added = addWheelMovement(sum, { deltaY, deltaMode: PIXELS }, PAGE_HEIGHT);
      sum = added.sum;
      if (added.step) steps.push(added.step);
    }

    expect(steps).toEqual(['forward']);
  });

  it('moving past the last entry wraps to the first', () => {
    expect(steppedIndex(11, 12, 'forward')).toBe(0);
    expect(steppedIndex(0, 12, 'back')).toBe(11);
  });

  it('a file outside the list starts at the first entry', () => {
    expect(startingIndex(KEYS, 'elsewhere.md', 'forward')).toBe(0);
    expect(startingIndex(KEYS, undefined, 'back')).toBe(2);
  });

  it('an empty list does not open', () => {
    expect(startingIndex([], undefined, 'forward')).toBeUndefined();
    expect(startingIndex(['readme.md'], 'readme.md', 'forward')).toBeUndefined();
  });
});
