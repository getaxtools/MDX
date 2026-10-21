export const MAX_BREADCRUMB_FOLDERS = 3;

export interface BreadcrumbFolders {
  /** The nearest folders above the document, outermost first. */
  readonly names: readonly string[];
  /** True when folders further up were left out. */
  readonly isShortened: boolean;
}

const PATH_SEPARATOR = /[\\/]+/;

/** The folders that hold a document, as breadcrumbs: `C:\Docs\guides\setup.md` gives Docs, guides. */
export function breadcrumbFolders(
  displayPath: string,
  maxFolders = MAX_BREADCRUMB_FOLDERS,
): BreadcrumbFolders {
  const parts = displayPath.split(PATH_SEPARATOR).filter((part) => part !== '');
  const folders = parts.slice(0, -1).filter((part) => !isDriveOrShareRoot(part));
  return {
    names: folders.slice(-maxFolders),
    isShortened: folders.length > maxFolders,
  };
}

function isDriveOrShareRoot(part: string): boolean {
  return /^[a-z]:$/i.test(part) || part === '?' || part === '.';
}
