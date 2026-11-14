import type { StoredWorkspace } from '@mdx/platform';
import { isRecord } from '../session/savedValues';

export const NOTES_KIND_ID = 'notes';
export const DEFAULT_NOTES_FOLDER_NAME = 'MDX Notes';

/** What a Notes workspace keeps in its kind data: where its notes are and the id written there. */
export interface NotesLocation {
  readonly path: string;
  readonly canonicalKey: string;
  readonly locationId: string;
}

export type LocationClaimProblem = 'claimed' | 'insideLocation' | 'containsLocation';

/** `Documents\MDX Notes` for the first Notes workspace, `Documents\MDX Notes - Work` for one named Work. */
export function defaultNotesLocationPath(
  documentsFolder: string,
  {
    workspaceName,
    isFirstNotesWorkspace,
  }: { readonly workspaceName: string; readonly isFirstNotesWorkspace: boolean },
): string {
  const folderName = isFirstNotesWorkspace
    ? DEFAULT_NOTES_FOLDER_NAME
    : `${DEFAULT_NOTES_FOLDER_NAME} - ${safeFolderName(workspaceName)}`;
  return `${withoutTrailing(documentsFolder, '\\/')}\\${folderName}`;
}

/** Characters Windows does not allow in a folder name become spaces; trailing dots and spaces go. */
function safeFolderName(name: string): string {
  const allowed = name.replaceAll(/[<>:"/\\|?*]|\p{Cc}/gu, ' ');
  return withoutTrailing(allowed, '. ').trim() || DEFAULT_NOTES_FOLDER_NAME;
}

// A loop instead of a `[…]+$` pattern, which backtracks on long runs of those characters.
function withoutTrailing(text: string, characters: string): string {
  let end = text.length;
  while (end > 0 && characters.includes(text.charAt(end - 1))) end -= 1;
  return text.slice(0, end);
}

/** Whether a path is the folder or inside it, comparing as Windows compares paths. */
export function isInsideFolder(path: string, folder: string): boolean {
  const pathKey = keyOf(path);
  const folderKey = keyOf(folder);
  return pathKey === folderKey || pathKey.startsWith(`${folderKey}\\`);
}

/** Whether a sync program such as OneDrive backs up the folder. */
export function isSyncedFolder(path: string, syncedFolders: readonly string[]): boolean {
  return syncedFolders.some((syncedFolder) => isInsideFolder(path, syncedFolder));
}

/** One Notes workspace per folder, and Notes folders never nest. */
export function locationClaimProblem(
  candidatePath: string,
  claimedPaths: readonly string[],
): LocationClaimProblem | undefined {
  for (const claimed of claimedPaths) {
    if (keyOf(candidatePath) === keyOf(claimed)) return 'claimed';
    if (isInsideFolder(candidatePath, claimed)) return 'insideLocation';
    if (isInsideFolder(claimed, candidatePath)) return 'containsLocation';
  }
  return undefined;
}

export function notesLocationOf(workspace: StoredWorkspace): NotesLocation | undefined {
  const data = workspace.kindData;
  if (!isRecord(data) || !isRecord(data.location)) return undefined;
  const { path, canonicalKey, locationId } = data.location;
  if (typeof path !== 'string' || typeof canonicalKey !== 'string' || typeof locationId !== 'string')
    return undefined;
  return { path, canonicalKey, locationId };
}

export function notesKindData(location: NotesLocation): { readonly location: NotesLocation } {
  return { location };
}

/** The folders other Notes workspaces have claimed, leaving out the one being changed. */
export function claimedNotesLocations(
  workspaces: readonly StoredWorkspace[],
  exceptWorkspaceId?: string,
): string[] {
  return workspaces
    .filter((workspace) => workspace.id !== exceptWorkspaceId)
    .flatMap((workspace) => {
      const location = notesLocationOf(workspace);
      return location ? [location.path] : [];
    });
}

function keyOf(path: string): string {
  return path.replaceAll('/', '\\').replace(/\\+$/, '').toLowerCase();
}
