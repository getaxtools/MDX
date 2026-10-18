const MATCH_HIGHLIGHT = 'mdx-find-match';
const CURRENT_MATCH_HIGHLIGHT = 'mdx-find-current';

function highlightRegistry(): HighlightRegistry | undefined {
  return typeof CSS !== 'undefined' && 'highlights' in CSS ? CSS.highlights : undefined;
}

/** Paints matches with the CSS Custom Highlight API, which never changes the document's DOM. */
export function paintFindHighlights(ranges: readonly Range[], currentIndex: number): void {
  const registry = highlightRegistry();
  if (!registry) return;
  registry.set(MATCH_HIGHLIGHT, new Highlight(...ranges.filter((_range, index) => index !== currentIndex)));
  const currentRange = ranges[currentIndex];
  if (currentRange) registry.set(CURRENT_MATCH_HIGHLIGHT, new Highlight(currentRange));
  else registry.delete(CURRENT_MATCH_HIGHLIGHT);
}

export function clearFindHighlights(): void {
  const registry = highlightRegistry();
  registry?.delete(MATCH_HIGHLIGHT);
  registry?.delete(CURRENT_MATCH_HIGHLIGHT);
}
