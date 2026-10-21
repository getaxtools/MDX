export const MAX_FIND_MATCHES = 1000;

export interface FindOptions {
  readonly isCaseSensitive: boolean;
  readonly isWholeWord: boolean;
}

export const DEFAULT_FIND_OPTIONS: FindOptions = { isCaseSensitive: false, isWholeWord: false };

/** Text to find with its options, such as a query carried over from Find in Folders. */
export interface FindQuery extends FindOptions {
  readonly text: string;
}

const WORD_CHARACTER = /[\p{L}\p{M}\p{N}_]/u;

/** Finds every occurrence of the query in the text below the root, as DOM ranges. */
export function findTextRanges(
  root: Node,
  query: string,
  options: FindOptions = DEFAULT_FIND_OPTIONS,
): Range[] {
  if (query.length === 0) return [];
  const document = root.ownerDocument ?? (root as Document);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const ranges: Range[] = [];
  for (let node = walker.nextNode(); node && ranges.length < MAX_FIND_MATCHES; node = walker.nextNode()) {
    for (const start of matchOffsets(node.nodeValue ?? '', query, options)) {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + query.length);
      ranges.push(range);
    }
  }
  return ranges.slice(0, MAX_FIND_MATCHES);
}

function matchOffsets(text: string, query: string, options: FindOptions): number[] {
  const [haystack, needle] = options.isCaseSensitive ? [text, query] : caseFolded(text, query);
  const offsets: number[] = [];
  for (
    let index = haystack.indexOf(needle);
    index !== -1;
    index = haystack.indexOf(needle, index + needle.length)
  ) {
    if (!options.isWholeWord || isWholeWordAt(text, index, needle.length)) offsets.push(index);
  }
  return offsets;
}

function caseFolded(text: string, query: string): [string, string] {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  // Lowercasing can change the length of some characters, which would shift the offsets.
  const isCaseFoldingSafe = lowerText.length === text.length && lowerQuery.length === query.length;
  return isCaseFoldingSafe ? [lowerText, lowerQuery] : [text, query];
}

function isWholeWordAt(text: string, start: number, length: number): boolean {
  const before = text.charAt(start - 1);
  const after = text.charAt(start + length);
  return !WORD_CHARACTER.test(before) && !WORD_CHARACTER.test(after);
}
