import type { OutlineEntry } from '@mdx/renderer';

const READING_LINE_OFFSET_PX = 16;

/** Scrolls the source view so that a zero-based line of the document starts at the top of the area. */
export function scrollSourceLineToTop(area: HTMLElement, sourceView: HTMLElement, line: number): void {
  const lineTopPx = lineTopOf(sourceView, line);
  if (lineTopPx === undefined) return;
  area.scrollTop += lineTopPx - area.getBoundingClientRect().top;
}

/** The heading of the section at the top of the source view, measured like the rendered view. */
export function headingIdInSourceView(
  area: HTMLElement,
  sourceView: HTMLElement,
  outline: readonly OutlineEntry[],
): string | undefined {
  const readingLinePx = area.getBoundingClientRect().top + READING_LINE_OFFSET_PX;
  let currentId: string | undefined;
  for (const entry of outline) {
    const lineTopPx = lineTopOf(sourceView, entry.line);
    if (lineTopPx === undefined || lineTopPx > readingLinePx) break;
    currentId = entry.id;
  }
  return currentId;
}

/** Highlighting splits the text into many nodes, so the line is found by counting line breaks across them. */
function lineTopOf(sourceView: HTMLElement, line: number): number | undefined {
  const walker = sourceView.ownerDocument.createTreeWalker(sourceView, NodeFilter.SHOW_TEXT);
  let linesToSkip = line;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    let offset = 0;
    while (linesToSkip > 0) {
      const lineBreak = text.indexOf('\n', offset);
      if (lineBreak === -1) break;
      offset = lineBreak + 1;
      linesToSkip -= 1;
    }
    if (linesToSkip === 0 && offset < text.length) return topOfPosition(node, offset);
  }
  return undefined;
}

function topOfPosition(node: Node, offset: number): number {
  const range = node.ownerDocument?.createRange();
  if (!range) return 0;
  range.setStart(node, offset);
  range.setEnd(node, offset);
  return range.getBoundingClientRect().top;
}
