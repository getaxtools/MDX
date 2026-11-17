import type { FileArcTreeRow } from '@mdx/core';
import type { DocumentLocation } from '@mdx/platform';
import type { FolderTreeState } from '../folder-tree/FolderTreeState';

/**
 * The rows of the Explorer's Folders section as it is expanded, from the listings it has already
 * read. A collapsed section or root still counts as a root, so the arc does not fall back to the
 * recent files just because the tree is folded away.
 */
export function explorerArcRows(
  roots: readonly DocumentLocation[],
  tree: FolderTreeState,
  isSectionExpanded: boolean,
): FileArcTreeRow[] {
  return roots.map((root) => {
    const isRootExpanded = isSectionExpanded && !tree.collapsedRootKeys.has(root.canonicalKey);
    return isRootExpanded
      ? { label: root.fileName, children: folderRows(root.displayPath, tree) }
      : { label: root.fileName };
  });
}

function folderRows(folderPath: string, tree: FolderTreeState): FileArcTreeRow[] {
  const listing = tree.listings.get(folderPath);
  if (!listing) return [];
  return [
    ...listing.folders.map((folder): FileArcTreeRow => {
      return tree.expandedFolderPaths.has(folder.displayPath)
        ? { label: folder.fileName, children: folderRows(folder.displayPath, tree) }
        : { label: folder.fileName };
    }),
    ...listing.documents.map((document): FileArcTreeRow => ({ label: document.fileName, file: document })),
  ];
}
