import type { OutlineEntry } from '@mdx/renderer';

/** The heading of the section shown at a zero-based top line, such as the editor's first visible line. */
export function headingIdAtLine(outline: readonly OutlineEntry[], topLine: number): string | undefined {
  const shownLine = Math.round(topLine);
  return outline.findLast((entry) => entry.line <= shownLine)?.id;
}
