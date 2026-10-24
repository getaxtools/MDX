import { HEADING_ID_PREFIX } from '@mdx/renderer';

/** The heading of this document that an in-document link such as `#install` points to. */
export function findLinkedHeading(article: HTMLElement, fragment: string): HTMLElement | undefined {
  const name = decodedFragment(fragment);
  const candidateIds = name.startsWith(HEADING_ID_PREFIX)
    ? [name]
    : [`${HEADING_ID_PREFIX}${name}`, `${HEADING_ID_PREFIX}${name.toLowerCase()}`];
  for (const id of candidateIds) {
    const element = article.ownerDocument.getElementById(id);
    if (element && article.contains(element)) return element;
  }
  return undefined;
}

function decodedFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}
