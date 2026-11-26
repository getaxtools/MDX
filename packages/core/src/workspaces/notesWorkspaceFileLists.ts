import type { DocumentLocation } from '@mdx/platform';
import type { Favourite } from '../favourites/FavouritesList';
import type { PortableWorkspace } from './workspaceFile';
import { locationOfPath } from './windowsPaths';

/**
 * A Notes workspace file's first root is its notes folder on the machine it came from, so the
 * folder chosen for the new workspace takes its place, along with the favourites inside it.
 */
export function notesWorkspaceFileLists(
  workspace: PortableWorkspace,
  notesFolder: DocumentLocation,
): { readonly explorerFolders: readonly DocumentLocation[]; readonly favourites: readonly Favourite[] } {
  const [oldNotesFolder, ...otherRoots] = workspace.roots;
  return {
    explorerFolders: [notesFolder, ...otherRoots],
    favourites: oldNotesFolder
      ? workspace.favourites.map((favourite) => movedInto(favourite, oldNotesFolder, notesFolder))
      : workspace.favourites,
  };
}

function movedInto(favourite: Favourite, from: DocumentLocation, to: DocumentLocation): Favourite {
  const key = favourite.location.canonicalKey;
  if (key === from.canonicalKey) return { ...favourite, location: to };
  const folderPrefix = from.canonicalKey.endsWith('\\') ? from.canonicalKey : `${from.canonicalKey}\\`;
  if (!key.startsWith(folderPrefix)) return favourite;
  const pathInside = favourite.location.displayPath.slice(folderPrefix.length);
  const separator = to.displayPath.endsWith('\\') ? '' : '\\';
  return { ...favourite, location: locationOfPath(`${to.displayPath}${separator}${pathInside}`) };
}
