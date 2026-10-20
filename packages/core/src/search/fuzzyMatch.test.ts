import { describe, expect, it } from 'vitest';
import { fuzzyMatch, rankByFuzzyMatch } from './fuzzyMatch';

describe('fuzzyMatch', () => {
  it('matches letters in order anywhere in the text, ignoring case', () => {
    expect(fuzzyMatch('rn', 'Release-Notes.md')?.matchedIndexes).toEqual([0, 8]);
  });

  it('does not match when a letter is missing or out of order', () => {
    expect(fuzzyMatch('xyz', 'Guide.md')).toBeUndefined();
    expect(fuzzyMatch('ed', 'Guide.md')?.matchedIndexes).toEqual([4, 7]);
    expect(fuzzyMatch('dg', 'Guide.md')).toBeUndefined();
  });

  it('matches everything with an empty query', () => {
    expect(fuzzyMatch('', 'Guide.md')).toEqual({ score: 0, matchedIndexes: [] });
  });

  it('scores a prefix above the same letters scattered', () => {
    const prefix = fuzzyMatch('gui', 'guide.md');
    const scattered = fuzzyMatch('gui', 'getting-up-in.md');

    expect(prefix?.score).toBeGreaterThan(scattered?.score ?? 0);
  });

  it('scores word starts above letters inside words', () => {
    const wordStarts = fuzzyMatch('rn', 'release-notes.md');
    const insideWords = fuzzyMatch('rn', 'a-return.md');

    expect(wordStarts?.score).toBeGreaterThan(insideWords?.score ?? 0);
  });

  it('treats a camel-case capital as a word start', () => {
    const camelCase = fuzzyMatch('va', 'saveAll');
    const lowerCase = fuzzyMatch('va', 'saveall');

    expect(camelCase?.score).toBeGreaterThan(lowerCase?.score ?? 0);
  });
});

describe('rankByFuzzyMatch', () => {
  const names = ['getting-started.md', 'guide.md', 'release-notes.md', 'notes.md'];

  it('keeps only matching items, best match first', () => {
    const ranked = rankByFuzzyMatch(names, 'notes', (name) => name);

    expect(ranked.map(({ item }) => item)).toEqual(['notes.md', 'release-notes.md']);
  });

  it('keeps the original order for an empty query', () => {
    const ranked = rankByFuzzyMatch(names, '', (name) => name);

    expect(ranked.map(({ item }) => item)).toEqual(names);
  });
});
