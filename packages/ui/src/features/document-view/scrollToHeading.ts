/** Scrolls a heading into view and moves keyboard focus to it, so reading continues from there. */
export function scrollToHeading(root: Document, headingId: string): void {
  const heading = root.getElementById(headingId);
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.scrollIntoView({ block: 'start' });
  heading.focus({ preventScroll: true });
}
