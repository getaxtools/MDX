import { HEADING_ID_PREFIX } from '@mdx/renderer';

/** The heading of this document that an in-document link such as `#install` points to. */
export function findLinkedHeading(article: HTMLElement, fragment: string): HTMLElement | undefined {
  for (const id of linkedHeadingIds(fragment)) {
    const element = article.ownerDocument.getElementById(id);
    if (element && article.contains(element)) return element;
  }
  return undefined;
}

/** The heading ids a link's fragment may mean, in the order the preview tries them. */
export function linkedHeadingIds(fragment: string): string[] {
  const name = decodedFragment(fragment);
  return name.startsWith(HEADING_ID_PREFIX)
    ? [name]
    : [`${HEADING_ID_PREFIX}${name}`, `${HEADING_ID_PREFIX}${name.toLowerCase()}`];
}

function decodedFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}
