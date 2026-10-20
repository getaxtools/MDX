import type { ExplorerFolders } from '@mdx/core';

export interface RemoveExplorerFolderCommand {
  readonly kind: 'removeExplorerFolder';
  readonly canonicalKey: string;
}

/** Commands with a folder dialog, or that change favourites too, which the viewer runs. */
export type ExplorerActionCommand =
  | { readonly kind: 'addFolderFavourite' }
  | { readonly kind: 'addExplorerFolderToFavourites'; readonly canonicalKey: string };

export function isRemoveExplorerFolderCommand(command: {
  readonly kind: string;
}): command is RemoveExplorerFolderCommand {
  return command.kind === 'removeExplorerFolder';
}

export function applyRemoveExplorerFolderCommand(
  explorerFolders: ExplorerFolders,
  { canonicalKey }: RemoveExplorerFolderCommand,
): ExplorerFolders {
  return explorerFolders.remove(canonicalKey);
}
