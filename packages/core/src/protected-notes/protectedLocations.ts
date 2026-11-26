import { isProtectedNoteLocation, type DocumentLocation } from '@mdx/platform';

/** Where a protected section keeps its encrypted files, inside its notes location. */
const APP_FOLDER = '.mdx-notes';
const SECTION_FOLDER = 'protected';

function pathParts(path: string): string[] {
  return path
    .split(/[\\/]+/)
    .filter((part) => part !== '')
    .map((part) => part.toLowerCase());
}

/**
 * The section's folder, or a copy of it set aside beside it, such as `protected.replaced-1` or
 * `protected.restoring-1` during a restore; each holds the same encrypted files.
 */
function isSectionFolderName(part: string | undefined): boolean {
  return part === SECTION_FOLDER || (part?.startsWith(`${SECTION_FOLDER}.`) ?? false);
}

/** Whether a path is a protected section's folder or lies inside one, in any notes location. */
export function isInsideProtectedSection(path: string): boolean {
  const parts = pathParts(path);
  return parts.some((part, index) => part === APP_FOLDER && isSectionFolderName(parts[index + 1]));
}

/**
 * The one rule every feature asks before it lists, indexes, keeps, exports or prints a document:
 * a protected note, or any file of a protected section, is protected.
 */
export function isProtectedLocation(location: DocumentLocation): boolean {
  return isProtectedNoteLocation(location) || isInsideProtectedSection(location.displayPath);
}

/** The locations a feature may keep or show, in their order. */
export function withoutProtectedLocations<Item>(
  items: readonly Item[],
  locationOf: (item: Item) => DocumentLocation,
): Item[] {
  return items.filter((item) => !isProtectedLocation(locationOf(item)));
}
