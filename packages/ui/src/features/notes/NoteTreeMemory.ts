import type { NoteTreeNode } from '@mdx/core';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

/**
 * What the note tree has expanded and listed, kept outside its rows so a hidden side bar shows the
 * tree as it was, and so the file arc can list the notes it shows without reading anything.
 */
export class NoteTreeMemory {
  /** Keyed as `keyOfNode` keys a row. */
  readonly expandedKeys = new SvelteSet<string>();
  /** The rows of each folder the tree has listed, keyed by the folder's path. */
  readonly nodesByFolder = new SvelteMap<string, NoteTreeNode[]>();

  toggle(key: string): void {
    if (this.expandedKeys.has(key)) this.expandedKeys.delete(key);
    else this.expandedKeys.add(key);
  }
}
