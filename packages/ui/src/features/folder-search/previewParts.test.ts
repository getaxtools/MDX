import { describe, expect, it } from 'vitest';
import { previewParts } from './previewParts';

describe('previewParts', () => {
  it('splits the preview into plain and matched text', () => {
    expect(
      previewParts({
        lineNumber: 1,
        preview: 'Run setup, then setup',
        ranges: [
          [4, 9],
          [16, 21],
        ],
      }),
    ).toEqual([
      { text: 'Run ', isMatch: false },
      { text: 'setup', isMatch: true },
      { text: ', then ', isMatch: false },
      { text: 'setup', isMatch: true },
    ]);
  });

  it('counts characters, not UTF-16 units, so emoji and Indic text stay whole', () => {
    expect(previewParts({ lineNumber: 1, preview: '🚀 నమస్తే', ranges: [[2, 4]] })).toEqual([
      { text: '🚀 ', isMatch: false },
      { text: 'నమ', isMatch: true },
      { text: 'స్తే', isMatch: false },
    ]);
  });

  it('ignores ranges that overlap or fall outside the preview', () => {
    expect(
      previewParts({
        lineNumber: 1,
        preview: 'abc',
        ranges: [
          [0, 2],
          [1, 3],
          [2, 9],
        ],
      }),
    ).toEqual([
      { text: 'ab', isMatch: true },
      { text: 'c', isMatch: false },
    ]);
  });
});
