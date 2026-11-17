import { describe, expect, it } from 'vitest';
import { galleryPositionAfter } from './templateGalleryKeyboard';

const LAYOUT = { rowLengths: [5, 2, 4], isRightToLeft: false };

describe('template gallery keyboard', () => {
  it('Left and Right move along a row and stop at its ends', () => {
    expect(galleryPositionAfter('ArrowRight', { row: 0, column: 1 }, LAYOUT)).toEqual({ row: 0, column: 2 });
    expect(galleryPositionAfter('ArrowRight', { row: 1, column: 1 }, LAYOUT)).toEqual({ row: 1, column: 1 });
    expect(galleryPositionAfter('ArrowLeft', { row: 0, column: 0 }, LAYOUT)).toEqual({ row: 0, column: 0 });
  });

  it('Up and Down go to the nearest template of the next row', () => {
    expect(galleryPositionAfter('ArrowDown', { row: 0, column: 4 }, LAYOUT)).toEqual({ row: 1, column: 1 });
    expect(galleryPositionAfter('ArrowUp', { row: 0, column: 3 }, LAYOUT)).toEqual({ row: 0, column: 3 });
    expect(galleryPositionAfter('ArrowDown', { row: 2, column: 0 }, LAYOUT)).toEqual({ row: 2, column: 0 });
  });

  it('Home and End go to the ends of the row', () => {
    expect(galleryPositionAfter('Home', { row: 2, column: 3 }, LAYOUT)).toEqual({ row: 2, column: 0 });
    expect(galleryPositionAfter('End', { row: 2, column: 0 }, LAYOUT)).toEqual({ row: 2, column: 3 });
  });

  it('Left and Right are mirrored in right-to-left', () => {
    const rightToLeft = { ...LAYOUT, isRightToLeft: true };

    expect(galleryPositionAfter('ArrowLeft', { row: 0, column: 1 }, rightToLeft)).toEqual({
      row: 0,
      column: 2,
    });
  });

  it('other keys do not move', () => {
    expect(galleryPositionAfter('a', { row: 0, column: 0 }, LAYOUT)).toBeUndefined();
  });
});
