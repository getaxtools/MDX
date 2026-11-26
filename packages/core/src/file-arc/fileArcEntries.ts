import type { DocumentLocation } from '@mdx/platform';
import { isProtectedLocation } from '../protected-notes/protectedLocations';

/**
 * One row of a side bar tree as the arc sees it: a file, a folder, or both (a note with child
 * notes). `children` is given only while the row is expanded in the tree, so a collapsed folder
 * contributes nothing.
 */
export interface FileArcTreeRow {
  readonly label: string;
  readonly file?: DocumentLocation;
  readonly children?: readonly FileArcTreeRow[];
}

/** One name on the arc. */
export interface FileArcEntry {
  readonly location: DocumentLocation;
  readonly name: string;
  /** Where it lies, such as `Handbook › docs`; empty for a recent file outside every folder. */
  readonly folderLabel: string;
  readonly isOpenInTab: boolean;
}

export interface FileArcSource {
  /** The tree's roots in the order the side bar shows them. */
  readonly roots: readonly FileArcTreeRow[];
  /** Listed, newest first, when the tree has no roots. */
  readonly recentFiles: readonly DocumentLocation[];
  readonly openTabKeys: ReadonlySet<string>;
}

const FOLDER_SEPARATOR = ' › ';

/**
 * The files of the tree as it is expanded, depth first in tree order, each once; the recent files
 * when there is no tree. Nothing is read: only rows the tree already has are used.
 */
export function fileArcEntries({ roots, recentFiles, openTabKeys }: FileArcSource): FileArcEntry[] {
  const entries: FileArcEntry[] = [];
  const seenKeys = new Set<string>();
  const add = (location: DocumentLocation, name: string, folderLabel: string) => {
    if (seenKeys.has(location.canonicalKey) || isProtectedLocation(location)) return;
    seenKeys.add(location.canonicalKey);
    entries.push({ location, name, folderLabel, isOpenInTab: openTabKeys.has(location.canonicalKey) });
  };
  if (roots.length === 0) {
    for (const location of recentFiles) add(location, location.fileName, folderOfPath(location.displayPath));
    return entries;
  }
  const visit = (rows: readonly FileArcTreeRow[], folders: readonly string[]) => {
    for (const row of rows) {
      if (row.file) add(row.file, row.label, folders.join(FOLDER_SEPARATOR));
      if (row.children) visit(row.children, [...folders, row.label]);
    }
  };
  visit(roots, []);
  return entries;
}

/** The name of the folder that holds the file. */
function folderOfPath(displayPath: string): string {
  const parts = displayPath.split(/[\\/]/).filter(Boolean);
  parts.pop();
  return parts.pop() ?? '';
}
