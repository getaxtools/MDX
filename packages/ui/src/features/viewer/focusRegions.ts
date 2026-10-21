/** Marks a part of the window that F6 and Shift+F6 move between, such as the Explorer or the status bar. */
export const FOCUS_REGION_ATTRIBUTE = 'data-focus-region';

/** Tried in this order, so a roving tab stop such as the active tab wins over buttons before it. */
const FOCUS_TARGET_SELECTORS = [
  '[tabindex="0"]',
  '[contenteditable="true"]',
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled)',
];

/**
 * Moves focus to the next or previous region that has something to focus, wrapping around.
 * Returns false when focus stays where it is, such as inside a dialog.
 */
export function moveFocusBetweenRegions(
  root: ParentNode,
  direction: 1 | -1,
  focused: Element | null,
): boolean {
  if (focused?.closest('[role="dialog"]')) return false;
  const regions = [...root.querySelectorAll(`[${FOCUS_REGION_ATTRIBUTE}]`)];
  const currentIndex = regions.findIndex((region) => focused !== null && region.contains(focused));
  for (let step = 1; step <= regions.length; step += 1) {
    const index = wrappedIndex(currentIndex, direction * step, regions.length);
    const target = focusTargetIn(regions[index]);
    if (target) {
      target.focus();
      return true;
    }
  }
  return false;
}

function wrappedIndex(currentIndex: number, offset: number, count: number): number {
  const start = currentIndex === -1 && offset < 0 ? count : currentIndex;
  return (((start + offset) % count) + count) % count;
}

function focusTargetIn(region: Element | undefined): HTMLElement | undefined {
  if (!region) return undefined;
  for (const selector of FOCUS_TARGET_SELECTORS) {
    const target = region.querySelector<HTMLElement>(selector);
    if (target) return target;
  }
  return undefined;
}
