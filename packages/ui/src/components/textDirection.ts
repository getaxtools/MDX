/** 1 where the page reads left to right, -1 where it reads right to left and the layout is mirrored. */
export function horizontalDirectionOf(element: Element): 1 | -1 {
  return element.closest('[dir]')?.getAttribute('dir') === 'rtl' ? -1 : 1;
}

const MIRRORED_ARROW_KEYS: Readonly<Record<string, string>> = {
  ArrowLeft: 'ArrowRight',
  ArrowRight: 'ArrowLeft',
};

/** The key as the left-to-right layout means it: right to left, Left and Right swap, as WAI-ARIA asks. */
export function logicalArrowKey(key: string, element: Element): string {
  return horizontalDirectionOf(element) === -1 ? (MIRRORED_ARROW_KEYS[key] ?? key) : key;
}
