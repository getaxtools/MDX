export interface DocumentLocation {
  readonly canonicalKey: string;
  readonly displayPath: string;
  readonly fileName: string;
}

const UNTITLED_KEY_PREFIX = 'untitled:';
const VIEW_KEY_PREFIX = 'view:';

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

/**
 * A tab that shows a view of the app, such as a project dashboard, instead of a document. Its key is
 * not a path, so it is never read, watched, saved or listed in recent files.
 */
export function viewLocation(viewKey: string, title: string): DocumentLocation {
  return { canonicalKey: `${VIEW_KEY_PREFIX}${viewKey}`, displayPath: title, fileName: title };
}

export function isViewLocation(location: DocumentLocation): boolean {
  return location.canonicalKey.startsWith(VIEW_KEY_PREFIX);
}

/** Whether a tab shows a file on disk, rather than a document not saved yet or a view of the app. */
export function hasFile(location: DocumentLocation): boolean {
  return !isUntitledLocation(location) && !isViewLocation(location);
}
