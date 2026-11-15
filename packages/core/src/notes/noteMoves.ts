import type { DocumentLocation } from '@mdx/platform';

const NOTE_EXTENSION = /\.(md|markdown|mdown|mkd|mdx)$/i;

/** A note renamed or moved, with the folder of its child notes. */
export interface MovedNote {
  readonly from: DocumentLocation;
  readonly to: DocumentLocation;
}

/** Where a document is after the move: the note itself or one of its child notes; undefined otherwise. */
export function locationAfterNoteMove(
  location: DocumentLocation,
  { from, to }: MovedNote,
): DocumentLocation | undefined {
  if (location.canonicalKey === from.canonicalKey) return to;
  const fromFolder = childrenFolderOf(from);
  if (!location.canonicalKey.startsWith(`${fromFolder.canonicalKey}\\`)) return undefined;
  const toFolder = childrenFolderOf(to);
  return {
    canonicalKey: toFolder.canonicalKey + location.canonicalKey.slice(fromFolder.canonicalKey.length),
    displayPath: toFolder.displayPath + location.displayPath.slice(fromFolder.displayPath.length),
    fileName: location.fileName,
  };
}

/** Whether the note or one of its child notes is among the keys, such as those with unsaved changes. */
export function isNoteOrChildAmong(note: DocumentLocation, canonicalKeys: Iterable<string>): boolean {
  const folderKey = childrenFolderOf(note).canonicalKey;
  return [...canonicalKeys].some((key) => key === note.canonicalKey || key.startsWith(`${folderKey}\\`));
}

function childrenFolderOf(note: DocumentLocation): Pick<DocumentLocation, 'canonicalKey' | 'displayPath'> {
  return {
    canonicalKey: note.canonicalKey.replace(NOTE_EXTENSION, ''),
    displayPath: note.displayPath.replace(NOTE_EXTENSION, ''),
  };
}
