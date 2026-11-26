import { describe, expect, it } from 'vitest';
import { BLACK, contrastRatio, laidOver, rgbOf, WHITE } from './contrastRatio';

describe('contrastRatio', () => {
  it('gives 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio(rgbOf('#3b5bdb'), rgbOf('#3b5bdb'))).toBe(1);
  });

  it('matches a published pair: mid grey on white is 4.54', () => {
    expect(contrastRatio(rgbOf('#767676'), WHITE)).toBeCloseTo(4.54, 2);
  });

  it('reads a six-digit hex colour in either case', () => {
    expect(rgbOf('#1A66a8')).toEqual([0x1a, 0x66, 0xa8]);
  });

  it('refuses anything but a six-digit hex colour', () => {
    expect(() => rgbOf('#fff')).toThrow('not a hex colour: #fff');
    expect(() => rgbOf('Canvas')).toThrow('not a hex colour: Canvas');
  });

  it('mixes a colour into its backdrop by its opacity', () => {
    expect(laidOver(WHITE, 1, BLACK)).toEqual(WHITE);
    expect(laidOver(WHITE, 0, BLACK)).toEqual(BLACK);
    expect(laidOver(WHITE, 0.5, BLACK)).toEqual([127.5, 127.5, 127.5]);
  });
});
