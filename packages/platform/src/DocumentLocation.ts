export interface DocumentLocation {
  readonly canonicalKey: string;
  readonly displayPath: string;
  readonly fileName: string;
}

const UNTITLED_KEY_PREFIX = 'untitled:';
const VIEW_KEY_PREFIX = 'view:';
const PROTECTED_NOTE_KEY_PREFIX = 'protected:';

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

/**
 * A note of a protected section, open while the section is unlocked. Its key names the section's
 * notes location and the note's random id, never its title or folder; it is not a path, so nothing
 * reads, watches or lists it as a file.
 */
export function protectedNoteLocation(locationKey: string, noteId: string, title: string): DocumentLocation {
  return {
    canonicalKey: `${PROTECTED_NOTE_KEY_PREFIX}${locationKey}|${noteId}`,
    displayPath: title,
    fileName: title,
  };
}

export function isProtectedNoteLocation(location: DocumentLocation): boolean {
  return location.canonicalKey.startsWith(PROTECTED_NOTE_KEY_PREFIX);
}

/** Whether a location is a note of the protected section of the notes location with this canonical key. */
export function isProtectedNoteIn(location: DocumentLocation, locationKey: string): boolean {
  return location.canonicalKey.startsWith(`${PROTECTED_NOTE_KEY_PREFIX}${locationKey}|`);
}

/**
 * Whether a tab shows a plain file on disk, rather than a document not saved yet, a view of the app
 * or a protected note.
 */
export function hasFile(location: DocumentLocation): boolean {
  return !isUntitledLocation(location) && !isViewLocation(location) && !isProtectedNoteLocation(location);
}
