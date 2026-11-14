import { describe, expect, it } from 'vitest';
import { SessionWordCounts } from './SessionWordCounts';

describe('SessionWordCounts', () => {
  it('session change counts added and removed words', () => {
    const counts = new SessionWordCounts();

    const atFirstShow = counts.changeSince('c:\\a.md', 100);
    const afterWriting = counts.changeSince('c:\\a.md', 130);
    const afterCutting = counts.changeSince('c:\\a.md', 90);

    expect([atFirstShow, afterWriting, afterCutting]).toEqual([0, 30, -10]);
  });

  it('keeps each document apart', () => {
    const counts = new SessionWordCounts();
    counts.changeSince('c:\\a.md', 100);

    expect(counts.changeSince('c:\\b.md', 5)).toBe(0);
  });
});
