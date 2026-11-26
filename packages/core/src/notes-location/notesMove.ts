import type { DocumentLocation } from '@mdx/platform';
import { locationOfPath } from '../workspaces/windowsPaths';

const FILE_SIZE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;
const BYTES_PER_UNIT = 1024;

/** `1.5 MB`, in the app language; sizes count in steps of 1,024 as File Explorer shows them. */
export function formatFileSize(bytes: number, locale: string): string {
  let value = Math.max(bytes, 0);
  let unitIndex = 0;
  while (value >= BYTES_PER_UNIT && unitIndex < FILE_SIZE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unitIndex += 1;
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: FILE_SIZE_UNITS[unitIndex] ?? 'byte',
    unitDisplay: 'short',
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  }).format(value);
}

/**
 * The same file in the folder the notes moved to, for a tab, favourite or recent file inside the
 * old folder; undefined for a location outside it.
 */
export function locationMovedInto(
  location: DocumentLocation,
  from: { readonly canonicalKey: string },
  to: { readonly displayPath: string },
): DocumentLocation | undefined {
  const folderKey = withoutTrailingSeparator(from.canonicalKey);
  if (location.canonicalKey === folderKey) return locationOfPath(to.displayPath);
  if (!location.canonicalKey.startsWith(`${folderKey}\\`)) return undefined;
  const pathInside = location.displayPath.slice(folderKey.length + 1);
  return locationOfPath(`${withoutTrailingSeparator(to.displayPath)}\\${pathInside}`);
}

function withoutTrailingSeparator(path: string): string {
  return path.endsWith('\\') ? path.slice(0, -1) : path;
}
