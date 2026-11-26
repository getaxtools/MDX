/** Longer than the 200 ms exit fade, so a fade the WebView never reports as ended still closes the dialog. */
export const CLOSE_FALLBACK_MS = 400;

function hasAnimationsApi(element: Element): boolean {
  return typeof (element as Partial<Element>).getAnimations === 'function';
}

/** Resolves when the animations running on `element` end, or is undefined when nothing is animating. */
export function animationsEnded(element: Element): Promise<void> | undefined {
  const animations = hasAnimationsApi(element) ? element.getAnimations() : [];
  if (animations.length === 0) return undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  const fallback = new Promise<void>((resolve) => {
    fallbackTimer = setTimeout(resolve, CLOSE_FALLBACK_MS);
  });
  const ended = Promise.allSettled(animations.map(async (animation) => animation.finished));
  return Promise.race([ended, fallback]).then(() => clearTimeout(fallbackTimer));
}
