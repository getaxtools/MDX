export interface FuzzyMatch {
  readonly score: number;
  /** Positions in the text that matched the query, for highlighting. */
  readonly matchedIndexes: readonly number[];
}

const MATCH_SCORE = 1;
const CONSECUTIVE_BONUS = 8;
const WORD_START_BONUS = 6;
const TEXT_START_BONUS = 8;
const WORD_SEPARATORS = new Set([' ', '-', '_', '.', '/', '\\']);

/**
 * Matches the query's letters in order anywhere in the text, ignoring case, like quick open in editors.
 * Letters at word starts and runs of consecutive letters score higher; undefined when a letter is missing.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | undefined {
  const wantedLetters = query.toLocaleLowerCase();
  const letters = text.toLocaleLowerCase();
  const matchedIndexes: number[] = [];
  let score = 0;
  let textIndex = 0;
  for (const wanted of wantedLetters) {
    const found = letters.indexOf(wanted, textIndex);
    if (found === -1) return undefined;
    score += MATCH_SCORE + bonusAt(text, found, matchedIndexes.at(-1));
    matchedIndexes.push(found);
    textIndex = found + 1;
  }
  return { score, matchedIndexes };
}

/** The items that match, best first; equal scores keep their original order. */
export function rankByFuzzyMatch<Item>(
  items: readonly Item[],
  query: string,
  textOf: (item: Item) => string,
): { readonly item: Item; readonly match: FuzzyMatch }[] {
  return items
    .flatMap((item, index) => {
      const match = fuzzyMatch(query, textOf(item));
      return match ? [{ item, match, index }] : [];
    })
    .sort((first, second) => second.match.score - first.match.score || first.index - second.index)
    .map(({ item, match }) => ({ item, match }));
}

function bonusAt(text: string, index: number, previousIndex: number | undefined): number {
  if (index === 0) return TEXT_START_BONUS;
  if (previousIndex === index - 1) return CONSECUTIVE_BONUS;
  return isWordStart(text, index) ? WORD_START_BONUS : 0;
}

function isWordStart(text: string, index: number): boolean {
  const previous = text.charAt(index - 1);
  const current = text.charAt(index);
  const isCamelCaseBoundary = previous === previous.toLowerCase() && current !== current.toLowerCase();
  return WORD_SEPARATORS.has(previous) || isCamelCaseBoundary;
}
