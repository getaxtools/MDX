/** Scrolls a heading into view and moves keyboard focus to it, so reading continues from there. */
export function scrollToHeading(root: Document, headingId: string): void {
  const heading = root.getElementById(headingId);
  if (heading) revealHeading(heading);
}

export function revealHeading(heading: HTMLElement): void {
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.scrollIntoView({ block: 'start' });
  heading.focus({ preventScroll: true });
}
