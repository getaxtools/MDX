import { describe, expect, it } from 'vitest';
import { groupsThatFit, toolbarFocusAfter } from './toolbarKeyboard';

describe('toolbar keyboard and overflow', () => {
  it('Left and Right move between controls, mirrored in right-to-left, and Home and End go to the ends', () => {
    const leftToRight = { index: 1, count: 4, isRightToLeft: false };
    const rightToLeft = { ...leftToRight, isRightToLeft: true };

    expect(toolbarFocusAfter('ArrowRight', leftToRight)).toBe(2);
    expect(toolbarFocusAfter('ArrowLeft', leftToRight)).toBe(0);
    expect(toolbarFocusAfter('ArrowRight', rightToLeft)).toBe(0);
    expect(toolbarFocusAfter('ArrowRight', { ...leftToRight, index: 3 })).toBe(0);
    expect(toolbarFocusAfter('Home', leftToRight)).toBe(0);
    expect(toolbarFocusAfter('End', leftToRight)).toBe(3);
    expect(toolbarFocusAfter('a', leftToRight)).toBeUndefined();
  });

  it('a narrow window moves groups from the right into More formatting', () => {
    expect(groupsThatFit([40, 100, 60, 120, 30], 400, 30)).toBe(5);
    expect(groupsThatFit([40, 100, 60, 120, 30], 300, 30)).toBe(3);
    expect(groupsThatFit([40, 100], 50, 30)).toBe(0);
  });
});
