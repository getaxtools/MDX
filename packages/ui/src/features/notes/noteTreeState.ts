import type { NoteTreeNode } from '@mdx/core';
import type { FolderListing } from '@mdx/platform';

const NOTE_EXTENSION = /\.(md|markdown|mdown|mkd|mdx)$/i;

/** What every level of the note tree shares: the tree's state and how its rows act. */
export interface NoteTreeState {
  readonly revision: number;
  readonly folderRevisions: ReadonlyMap<string, number>;
  readonly expandedKeys: ReadonlySet<string>;
  /** The rows of each folder listed so far, kept while the side bar is hidden. */
  readonly listedNodes: ReadonlyMap<string, readonly NoteTreeNode[]>;
  readonly onListed: (folderPath: string, nodes: NoteTreeNode[]) => void;
  readonly activeDocumentKey: string | undefined;
  readonly renamingKey: string | undefined;
  /** The folder or note a new note is being named under. */
  readonly creatingIn: string | undefined;
  readonly cutKey: string | undefined;
  readonly dropTargetPath: string | undefined;
  /** A row to focus once it is listed, such as a note just renamed or moved. */
  readonly focusPath: string | undefined;
  readonly onFocused: () => void;
  readonly onListFolder: (folderPath: string) => Promise<FolderListing>;
  readonly onShowFolder: (folderPath: string) => () => void;
  readonly onOpenNote: (path: string) => void;
  readonly onToggle: (key: string) => void;
  /** True when the tree handled the key, such as F2 or Ctrl+X. */
  readonly onRowKeydown: (event: KeyboardEvent, node: NoteTreeNode, folderPath: string) => boolean;
  readonly onRowContextMenu: (event: MouseEvent, node: NoteTreeNode, folderPath: string) => void;
  readonly onRowPointerdown: (event: PointerEvent, node: NoteTreeNode) => void;
  readonly onFinishRename: (node: NoteTreeNode, name: string | undefined) => void;
  readonly onFinishCreate: (name: string | undefined) => void;
}

/** A node's key, which is also the key its expanded state is kept under. */
export function keyOfNode(node: NoteTreeNode): string {
  if (node.folder) return node.folder.canonicalKey;
  return node.note ? node.note.canonicalKey.replace(NOTE_EXTENSION, '') : node.name;
}

/** The folder that holds a node's child notes; a note's may not exist yet. */
export function childrenFolderOf(node: NoteTreeNode): string {
  if (node.folder) return node.folder.displayPath;
  return node.note ? node.note.displayPath.replace(NOTE_EXTENSION, '') : node.name;
}

/** Where a note dropped on the node goes: into the folder, or under the note. */
export function dropPathOf(node: NoteTreeNode): string {
  return node.note?.displayPath ?? childrenFolderOf(node);
}
