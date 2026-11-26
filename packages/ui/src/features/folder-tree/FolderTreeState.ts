import type { FolderListing } from '@mdx/platform';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

/**
 * What a folder tree has expanded and read, kept outside its rows so a hidden side bar shows the
 * tree as it was, and so the file arc can list what the tree shows without reading anything.
 */
export class FolderTreeState {
  /** Roots are expanded unless collapsed; keyed by canonical key. */
  readonly collapsedRootKeys = new SvelteSet<string>();
  /**
   * Keyed by the path the tree reached the folder through, so a link back to an enclosing folder
   * is never shown expanded by itself.
   */
  readonly expandedFolderPaths = new SvelteSet<string>();
  /** The latest listing of each folder the tree has shown, keyed by its path. */
  readonly listings = new SvelteMap<string, FolderListing>();

  toggleRoot(canonicalKey: string): void {
    if (this.collapsedRootKeys.has(canonicalKey)) this.collapsedRootKeys.delete(canonicalKey);
    else this.collapsedRootKeys.add(canonicalKey);
  }

  toggleFolder(folderPath: string): void {
    if (this.expandedFolderPaths.has(folderPath)) this.expandedFolderPaths.delete(folderPath);
    else this.expandedFolderPaths.add(folderPath);
  }
}
