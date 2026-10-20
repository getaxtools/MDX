import { describe, expect, it } from 'vitest';
import { highlightSegments } from './highlightSegments';

describe('highlightSegments', () => {
  it('groups matched and unmatched characters into runs', () => {
    expect(highlightSegments('notes.md', [0, 1, 6])).toEqual([
      { text: 'no', isMatch: true },
      { text: 'tes.', isMatch: false },
      { text: 'm', isMatch: true },
      { text: 'd', isMatch: false },
    ]);
  });

  it('returns the whole text unmatched when nothing matched', () => {
    expect(highlightSegments('guide.md', [])).toEqual([{ text: 'guide.md', isMatch: false }]);
  });
});
