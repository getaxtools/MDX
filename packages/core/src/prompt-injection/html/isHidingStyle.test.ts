import { describe, expect, it } from 'vitest';
import { isHidingStyle, normalizeColor, pixelsOf } from './isHidingStyle';

const THRESHOLDS = { minFontSizePx: 2, offScreenOffsetPx: 999 };

describe('isHidingStyle', () => {
  it.each([
    'display: none',
    'DISPLAY:NONE !important',
    'visibility: hidden',
    'visibility: collapse',
    'opacity: 0',
    'opacity: 0.0',
    'font-size: 0',
    'font-size: 1px',
    'font-size: 0.05em',
    'width: 0; height: 0; overflow: hidden',
    'max-height: 0; overflow: clip',
    'position: absolute; left: -9999px',
    'position: fixed; top: -100em',
    'text-indent: -9999px',
    'clip: rect(0, 0, 0, 0); position: absolute',
    'clip: rect(1px 1px 1px 1px)',
    'clip-path: inset(50%)',
    'clip-path: circle(0)',
    'color: transparent',
    'color: rgba(0, 0, 0, 0)',
    'color: #fff; background-color: #FFFFFF',
    'color: white; background: #fff',
    'transform: scale(0)',
  ])('treats "%s" as hiding the text', (style) => {
    expect(isHidingStyle(style, THRESHOLDS)).toBe(true);
  });

  it.each([
    'color: red',
    'font-size: 12px',
    'opacity: 0.5',
    'width: 0',
    'position: absolute; left: 10px',
    'position: relative; left: -9999px',
    'text-indent: 2em',
    'clip-path: inset(10%)',
    'color: #333; background: #fff',
    'display: block',
    '',
  ])('does not treat "%s" as hiding the text', (style) => {
    expect(isHidingStyle(style, THRESHOLDS)).toBe(false);
  });

  it('reads lengths in pixels and normalises colours', () => {
    expect(pixelsOf('12pt')).toBe(16);
    expect(pixelsOf('1.5em')).toBe(24);
    expect(pixelsOf('auto')).toBeUndefined();
    expect(normalizeColor(' #ABC ')).toBe('#aabbcc');
    expect(normalizeColor('White')).toBe('#ffffff');
  });
});
