/** Where a block that starts on a source line sits in the preview, in pixels from the top of its content. */
export interface SourceLineAnchor {
  readonly line: number;
  readonly top: number;
}

const SOURCE_LINE_SELECTOR = '[data-mdx-source-line]';

/** The preview position that shows the same place as a source line, between the nearest blocks. */
export function previewTopForLine(anchors: readonly SourceLineAnchor[], line: number): number {
  const [before, after] = surrounding(anchors, (anchor) => anchor.line <= line);
  if (!before) return 0;
  if (!after || after.line === before.line) return before.top;
  return before.top + ((line - before.line) / (after.line - before.line)) * (after.top - before.top);
}

/** The source line shown at a preview position, between the nearest blocks. */
export function lineForPreviewTop(anchors: readonly SourceLineAnchor[], top: number): number {
  const [before, after] = surrounding(anchors, (anchor) => anchor.top <= top);
  if (!before) return 0;
  if (!after || after.top === before.top) return before.line;
  return before.line + ((top - before.top) / (after.top - before.top)) * (after.line - before.line);
}

/**
 * Reads the marked blocks of a rendered preview, from the start of the document to its end, keeping only
 * blocks that are further down than the ones before them, such as the first of several on one line.
 */
export function readSourceLineAnchors(preview: HTMLElement, lineCount: number): SourceLineAnchor[] {
  const contentTop = preview.getBoundingClientRect().top - preview.scrollTop;
  const marked = [...preview.querySelectorAll<HTMLElement>(SOURCE_LINE_SELECTOR)].map((element) => ({
    line: Number(element.dataset.mdxSourceLine),
    top: element.getBoundingClientRect().top - contentTop,
  }));
  return increasingAnchors([{ line: 0, top: 0 }, ...marked, { line: lineCount, top: preview.scrollHeight }]);
}

function increasingAnchors(anchors: readonly SourceLineAnchor[]): SourceLineAnchor[] {
  const kept: SourceLineAnchor[] = [];
  for (const anchor of anchors) {
    const last = kept.at(-1);
    if (!last || (anchor.line > last.line && anchor.top >= last.top)) kept.push(anchor);
  }
  return kept;
}

function surrounding(
  anchors: readonly SourceLineAnchor[],
  isAtOrBefore: (anchor: SourceLineAnchor) => boolean,
): [SourceLineAnchor | undefined, SourceLineAnchor | undefined] {
  const afterIndex = anchors.findIndex((anchor) => !isAtOrBefore(anchor));
  if (afterIndex === -1) return [anchors.at(-1), undefined];
  return [anchors[afterIndex - 1], anchors[afterIndex]];
}
