import type { FileArcTreeRow, NoteTreeNode } from '@mdx/core';
import type { NoteTreeMemory } from '../notes/NoteTreeMemory';
import { childrenFolderOf, keyOfNode } from '../notes/noteTreeState';

/**
 * The rows of the note tree as it is expanded, from the folders it has already listed. A note with
 * child notes is both a file and a folder; its children follow it.
 */
export function noteArcRows(
  locationPath: string,
  tree: NoteTreeMemory,
  isSectionExpanded: boolean,
): FileArcTreeRow[] {
  return isSectionExpanded ? levelRows(locationPath, tree) : [];
}

function levelRows(folderPath: string, tree: NoteTreeMemory): FileArcTreeRow[] {
  return (tree.nodesByFolder.get(folderPath) ?? []).map((node) => rowOf(node, tree));
}

function rowOf(node: NoteTreeNode, tree: NoteTreeMemory): FileArcTreeRow {
  const isExpanded = node.folder !== undefined && tree.expandedKeys.has(keyOfNode(node));
  return {
    label: node.name,
    ...(node.note ? { file: node.note } : {}),
    ...(isExpanded ? { children: levelRows(childrenFolderOf(node), tree) } : {}),
  };
}
