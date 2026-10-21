import { afterEach, describe, expect, it } from 'vitest';
import { horizontalDirectionOf, logicalArrowKey } from './textDirection';

function elementInside(direction: 'ltr' | 'rtl'): HTMLElement {
  const page = document.createElement('div');
  page.dir = direction;
  const element = document.createElement('span');
  page.append(element);
  document.body.append(page);
  return element;
}

describe('text direction', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('reads the direction from the nearest element that sets one', () => {
    expect(horizontalDirectionOf(elementInside('rtl'))).toBe(-1);
    expect(horizontalDirectionOf(elementInside('ltr'))).toBe(1);
    expect(horizontalDirectionOf(document.createElement('span'))).toBe(1);
  });

  it('swaps Left and Right only in a right-to-left layout', () => {
    const rightToLeft = elementInside('rtl');

    expect(logicalArrowKey('ArrowLeft', rightToLeft)).toBe('ArrowRight');
    expect(logicalArrowKey('ArrowRight', rightToLeft)).toBe('ArrowLeft');
    expect(logicalArrowKey('ArrowDown', rightToLeft)).toBe('ArrowDown');
    expect(logicalArrowKey('ArrowLeft', elementInside('ltr'))).toBe('ArrowLeft');
  });
});
