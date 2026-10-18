import { describe, expect, it } from 'vitest';
import { measureDocument } from './documentStatistics';

describe('measureDocument', () => {
  it('counts words, ignoring Markdown punctuation', () => {
    expect(measureDocument('# Getting started\n\n- Open a *file*.').words).toBe(5);
  });

  it('counts characters without whitespace, treating combined characters as one', () => {
    expect(measureDocument('ab c').characters).toBe(3);
    expect(measureDocument('నమస్తే').characters).toBe(3);
  });

  it('counts Japanese words without spaces between them', () => {
    expect(measureDocument('私は学生です', 'ja').words).toBeGreaterThan(1);
  });

  it('estimates reading time at 200 words a minute, at least one minute for any text', () => {
    expect(measureDocument('word '.repeat(450)).readingMinutes).toBe(2);
    expect(measureDocument('one word').readingMinutes).toBe(1);
    expect(measureDocument('').readingMinutes).toBe(0);
  });
});
