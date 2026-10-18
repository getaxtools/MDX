const READING_LINE_OFFSET_PX = 16;

/** The id of the last heading that has scrolled to the top of the reading area, if any. */
export function currentHeadingId(article: HTMLElement, readingArea: HTMLElement): string | undefined {
  const readingLine = readingArea.getBoundingClientRect().top + READING_LINE_OFFSET_PX;
  let currentId: string | undefined;
  for (const heading of article.querySelectorAll<HTMLElement>(':is(h1, h2, h3, h4, h5, h6)[id]')) {
    if (heading.getBoundingClientRect().top > readingLine) break;
    currentId = heading.id;
  }
  return currentId;
}
