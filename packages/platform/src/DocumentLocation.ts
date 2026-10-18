export interface DocumentLocation {
  readonly canonicalKey: string;
  readonly displayPath: string;
  readonly fileName: string;
}

const UNTITLED_KEY_PREFIX = 'untitled:';

export function isSameDocument(first: DocumentLocation, second: DocumentLocation): boolean {
  return first.canonicalKey === second.canonicalKey;
}

/** A document that exists only in memory until the user saves it. */
export function untitledLocation(number: number, fileName: string): DocumentLocation {
  return { canonicalKey: `${UNTITLED_KEY_PREFIX}${String(number)}`, displayPath: fileName, fileName };
}

export function isUntitledLocation(location: DocumentLocation): boolean {
  return location.canonicalKey.startsWith(UNTITLED_KEY_PREFIX);
}
