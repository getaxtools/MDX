import { describe, expect, it } from 'vitest';
import { headingIdAtLine } from './headingIdAtLine';

const outline = [
  { level: 1, text: 'Guide', id: 'mdx-guide', line: 0 },
  { level: 2, text: 'Install', id: 'mdx-install', line: 10 },
  { level: 2, text: 'Usage', id: 'mdx-usage', line: 30 },
];

describe('headingIdAtLine', () => {
  it('names the last heading at or above the top line', () => {
    expect(headingIdAtLine(outline, 0)).toBe('mdx-guide');
    expect(headingIdAtLine(outline, 29.4)).toBe('mdx-install');
    expect(headingIdAtLine(outline, 30)).toBe('mdx-usage');
  });

  it('counts a heading as current once most of its line has scrolled past the top', () => {
    expect(headingIdAtLine(outline, 9.6)).toBe('mdx-install');
  });

  it('names no heading above the first one', () => {
    expect(headingIdAtLine([{ level: 2, text: 'Late', id: 'mdx-late', line: 5 }], 2)).toBeUndefined();
  });
});
