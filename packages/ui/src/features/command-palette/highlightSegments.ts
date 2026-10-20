export interface HighlightSegment {
  readonly text: string;
  readonly isMatch: boolean;
}

/** Splits text into runs of matched and unmatched characters, so matches can be marked up. */
export function highlightSegments(text: string, matchedIndexes: readonly number[]): HighlightSegment[] {
  const matched = new Set(matchedIndexes);
  const segments: HighlightSegment[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    const isMatch = matched.has(index);
    const last = segments.at(-1);
    if (last?.isMatch === isMatch) segments[segments.length - 1] = { text: last.text + character, isMatch };
    else segments.push({ text: character, isMatch });
  }
  return segments;
}
