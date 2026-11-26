/** Where Left, Right, Home and End move the focus in a toolbar; Left and Right swap in right-to-left text. */
export function toolbarFocusAfter(
  key: string,
  {
    index,
    count,
    isRightToLeft,
  }: { readonly index: number; readonly count: number; readonly isRightToLeft: boolean },
): number | undefined {
  if (count === 0) return undefined;
  const forward = isRightToLeft ? 'ArrowLeft' : 'ArrowRight';
  const backward = isRightToLeft ? 'ArrowRight' : 'ArrowLeft';
  if (key === forward) return (index + 1) % count;
  if (key === backward) return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  return key === 'End' ? count - 1 : undefined;
}

/** How many groups fit from the left, keeping room for the More button when some do not. */
export function groupsThatFit(
  groupWidths: readonly number[],
  availableWidth: number,
  moreButtonWidth: number,
): number {
  const total = groupWidths.reduce((sum, width) => sum + width, 0);
  if (total <= availableWidth) return groupWidths.length;
  let used = moreButtonWidth;
  for (const [index, width] of groupWidths.entries()) {
    if (used + width > availableWidth) return index;
    used += width;
  }
  return groupWidths.length;
}
