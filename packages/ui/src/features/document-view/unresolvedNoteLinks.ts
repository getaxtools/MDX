/**
 * Wiki-links to notes that do not exist yet render as text, since the sanitizer allows no role or
 * tab stop; this makes them links a keyboard can reach, which offer to create the note.
 */
export function makeUnresolvedNoteLinksFocusable(article: HTMLElement): void {
  for (const link of article.querySelectorAll<HTMLElement>('.wiki-link-unresolved')) {
    link.setAttribute('role', 'link');
    link.tabIndex = 0;
  }
}
