import { describe, expect, it } from 'vitest';
import { currentHeadingId } from './currentHeadingId';

function placeAt(element: Element, top: number) {
  element.getBoundingClientRect = () => ({ top }) as DOMRect;
}

function documentWithHeadingsAt(...tops: number[]) {
  const readingArea = document.createElement('main');
  const article = document.createElement('article');
  readingArea.append(article);
  placeAt(readingArea, 100);
  tops.forEach((top, index) => {
    const heading = document.createElement('h2');
    heading.id = `mdx-section-${String(index + 1)}`;
    placeAt(heading, top);
    article.append(heading);
  });
  return { readingArea, article };
}

describe('currentHeadingId', () => {
  it('picks the last heading that has reached the top of the reading area', () => {
    const { readingArea, article } = documentWithHeadingsAt(-400, 50, 110, 600);

    expect(currentHeadingId(article, readingArea)).toBe('mdx-section-3');
  });

  it('has no current heading before the first heading is reached', () => {
    const { readingArea, article } = documentWithHeadingsAt(300, 700);

    expect(currentHeadingId(article, readingArea)).toBeUndefined();
  });
});
