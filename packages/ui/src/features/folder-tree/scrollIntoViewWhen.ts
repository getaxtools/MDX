/** Scrolls an element into view each time `shouldScroll` turns true, such as a newly revealed tree row. */
export function scrollIntoViewWhen(
  element: HTMLElement,
  shouldScroll: boolean,
): { update: (shouldScroll: boolean) => void } {
  let wasScrolled = false;
  function scrollIfAsked(isAsked: boolean) {
    if (isAsked && !wasScrolled) element.scrollIntoView({ block: 'nearest' });
    wasScrolled = isAsked;
  }
  scrollIfAsked(shouldScroll);
  return { update: scrollIfAsked };
}
