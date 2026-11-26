const SOURCE_RANGE_HIGHLIGHT = 'mdx-source-range';

export interface TextOffsets {
  readonly from: number;
  readonly to: number;
}

function highlightRegistry(): HighlightRegistry | undefined {
  return typeof CSS !== 'undefined' && 'highlights' in CSS ? CSS.highlights : undefined;
}

/** Highlighting splits the source into many text nodes, so offsets are counted across all of them. */
export function rangeAtTextOffsets(root: HTMLElement, { from, to }: TextOffsets): Range | undefined {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = root.ownerDocument.createRange();
  let nodeStart = 0;
  let hasStart = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const nodeEnd = nodeStart + (node.nodeValue?.length ?? 0);
    if (!hasStart && from < nodeEnd) {
      range.setStart(node, from - nodeStart);
      hasStart = true;
    }
    if (hasStart && to <= nodeEnd) {
      range.setEnd(node, to - nodeStart);
      return range;
    }
    nodeStart = nodeEnd;
  }
  return undefined;
}

/**
 * Outlines a range of the source view with the CSS Custom Highlight API, which never changes the
 * DOM, and outlines it again whenever highlighting replaces the text nodes. Returns the clean-up.
 */
export function keepSourceRangeOutlined(sourceView: HTMLElement, offsets: TextOffsets): () => void {
  const outline = () => {
    const range = rangeAtTextOffsets(sourceView, offsets);
    const registry = highlightRegistry();
    if (range) registry?.set(SOURCE_RANGE_HIGHLIGHT, new Highlight(range));
    else registry?.delete(SOURCE_RANGE_HIGHLIGHT);
  };
  outline();
  const observer = new MutationObserver(outline);
  observer.observe(sourceView, { childList: true, subtree: true, characterData: true });
  return () => {
    observer.disconnect();
    highlightRegistry()?.delete(SOURCE_RANGE_HIGHLIGHT);
  };
}
