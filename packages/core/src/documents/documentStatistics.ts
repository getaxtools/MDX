export interface DocumentStatistics {
  readonly words: number;
  readonly characters: number;
  readonly readingMinutes: number;
}

export const READING_WORDS_PER_MINUTE = 200;

export function measureDocument(text: string, locale = 'en'): DocumentStatistics {
  const words = countSegments(text, locale, 'word');
  return {
    words,
    characters: countSegments(text.replace(/\s/gu, ''), locale, 'grapheme'),
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE)),
  };
}

function countSegments(text: string, locale: string, granularity: 'word' | 'grapheme'): number {
  let count = 0;
  for (const segment of new Intl.Segmenter(locale, { granularity }).segment(text)) {
    if (granularity === 'grapheme' || segment.isWordLike === true) count += 1;
  }
  return count;
}
