import type { DocumentLocation, FolderListing } from '@mdx/platform';

/**
 * One row of a Notes tree: a note, a folder, or a note together with the folder of the same name
 * that holds its child notes.
 */
export interface NoteTreeNode {
  readonly name: string;
  readonly note?: DocumentLocation;
  readonly folder?: DocumentLocation;
}

const NOTE_EXTENSION = /\.(md|markdown|mdown|mkd|mdx)$/i;

/** A note's name is its file name without the Markdown extension. */
export function noteNameOf(fileName: string): string {
  return fileName.replace(NOTE_EXTENSION, '');
}

/**
 * The rows of one folder of a Notes location: folders first, then notes, each in the order the
 * Explorer uses (case ignored, numbers by value). Dot entries, the app folder among them, are hidden.
 */
export function noteTreeNodes(listing: FolderListing, locale: string): NoteTreeNode[] {
  const notesByName = new Map<string, DocumentLocation>();
  const nodes: NoteTreeNode[] = [];
  for (const note of listing.documents.filter(isShown)) {
    const name = noteNameOf(note.fileName);
    if (notesByName.has(name.toLowerCase())) nodes.push({ name, note });
    else notesByName.set(name.toLowerCase(), note);
  }
  for (const folder of listing.folders.filter(isShown)) {
    const note = notesByName.get(folder.fileName.toLowerCase());
    notesByName.delete(folder.fileName.toLowerCase());
    nodes.push(note ? { name: noteNameOf(note.fileName), note, folder } : { name: folder.fileName, folder });
  }
  for (const note of notesByName.values()) nodes.push({ name: noteNameOf(note.fileName), note });
  return sortLikeTheExplorer(nodes, locale);
}

function isShown(location: DocumentLocation): boolean {
  return !location.fileName.startsWith('.');
}

function sortLikeTheExplorer(nodes: NoteTreeNode[], locale: string): NoteTreeNode[] {
  const nameOrder = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  return nodes.sort(
    (first, second) =>
      Number(second.folder !== undefined) - Number(first.folder !== undefined) ||
      nameOrder.compare(first.name, second.name),
  );
}
