import type { EditorSelection } from '@codemirror/state';

/**
 * Rich text shows an element's Markdown when any selection range touches it, its edges included, so
 * an arrow key that lands next to an element reveals it and the next key moves into it.
 */
export function isTouchedBySelection(selection: EditorSelection, from: number, to: number): boolean {
  return selection.ranges.some((range) => range.from <= to && range.to >= from);
}
