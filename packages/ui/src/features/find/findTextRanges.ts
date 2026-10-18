export const MAX_FIND_MATCHES = 1000;

/** Finds every case-insensitive occurrence of the query in the text below the root, as DOM ranges. */
export function findTextRanges(root: Node, query: string): Range[] {
  if (query.length === 0) return [];
  const document = root.ownerDocument ?? (root as Document);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const ranges: Range[] = [];
  for (let node = walker.nextNode(); node && ranges.length < MAX_FIND_MATCHES; node = walker.nextNode()) {
    for (const start of matchOffsets(node.nodeValue ?? '', query)) {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + query.length);
      ranges.push(range);
    }
  }
  return ranges.slice(0, MAX_FIND_MATCHES);
}

function matchOffsets(text: string, query: string): number[] {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  // Lowercasing can change the length of some characters, which would shift the offsets.
  const isCaseFoldingSafe = lowerText.length === text.length && lowerQuery.length === query.length;
  const [haystack, needle] = isCaseFoldingSafe ? [lowerText, lowerQuery] : [text, query];
  const offsets: number[] = [];
  for (
    let index = haystack.indexOf(needle);
    index !== -1;
    index = haystack.indexOf(needle, index + needle.length)
  ) {
    offsets.push(index);
  }
  return offsets;
}
