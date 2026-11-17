/** A template in the gallery: its group's row and its place in the row. */
export interface GalleryPosition {
  readonly row: number;
  readonly column: number;
}

/**
 * Where a key moves in the gallery: Left and Right along a row (mirrored in right-to-left), Up and
 * Down to the nearest template of the row above or below, Home and End to the row's ends. Undefined
 * for any other key.
 */
export function galleryPositionAfter(
  key: string,
  { row, column }: GalleryPosition,
  layout: { readonly rowLengths: readonly number[]; readonly isRightToLeft: boolean },
): GalleryPosition | undefined {
  const { rowLengths, isRightToLeft } = layout;
  const lastInRow = (rowIndex: number) => Math.max((rowLengths[rowIndex] ?? 1) - 1, 0);
  const forward = isRightToLeft ? 'ArrowLeft' : 'ArrowRight';
  const backward = isRightToLeft ? 'ArrowRight' : 'ArrowLeft';
  const toRow = (next: number) => {
    const target = Math.min(Math.max(next, 0), rowLengths.length - 1);
    return { row: target, column: Math.min(column, lastInRow(target)) };
  };
  if (key === forward) return { row, column: Math.min(column + 1, lastInRow(row)) };
  if (key === backward) return { row, column: Math.max(column - 1, 0) };
  if (key === 'ArrowDown') return toRow(row + 1);
  if (key === 'ArrowUp') return toRow(row - 1);
  if (key === 'Home') return { row, column: 0 };
  if (key === 'End') return { row, column: lastInRow(row) };
  return undefined;
}
