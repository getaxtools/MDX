import type { DocumentLocation } from '@mdx/platform';
import type { Favourite, FavouriteGroup } from '../favourites/FavouritesList';
import { isRecord } from '../session/savedValues';
import { parseWorkspaceOverrides, type WorkspaceOverrides } from '../view/viewSettingsScopes';
import { isBuiltKind, type WorkspaceKind } from '../workspace-kinds/workspaceKinds';
import { locationOfPath, relativePathFrom, resolvePathFrom } from './windowsPaths';

export const WORKSPACE_FILE_FORMAT = 'mdx-workspace';
export const WORKSPACE_FILE_VERSION = 1;
export const WORKSPACE_FILE_EXTENSION = '.mdxworkspace';
/** 1 MB: a definition is small, so anything larger is not one. */
export const MAX_WORKSPACE_FILE_BYTES = 1_048_576;

/** A workspace's definition: what a portable file carries. Tabs, recent files and layout stay personal. */
export interface PortableWorkspace {
  readonly name: string;
  readonly kindId: string;
  readonly icon: string | null;
  readonly colour: string | null;
  readonly roots: readonly DocumentLocation[];
  readonly favourites: readonly Favourite[];
  readonly favouriteGroups: readonly FavouriteGroup[];
  readonly settingsOverrides: WorkspaceOverrides;
}

export interface WrittenWorkspaceFile {
  readonly text: string;
  /** Paths written in full because they are on another drive or share than the file. */
  readonly absolutePathCount: number;
}

export type WorkspaceFileRefusal = 'tooLarge' | 'notWorkspaceFile' | 'unsupportedVersion' | 'unknownKind';

export type WorkspaceFileReading =
  | { readonly outcome: 'read'; readonly workspace: PortableWorkspace }
  | { readonly outcome: 'refused'; readonly reason: WorkspaceFileRefusal };

/** Writes only the allowlisted fields; paths on the file's drive or share become relative. */
export function writeWorkspaceFile(workspace: PortableWorkspace, fileFolder: string): WrittenWorkspaceFile {
  let absolutePathCount = 0;
  const portablePath = (path: string) => {
    const relative = relativePathFrom(fileFolder, path);
    if (relative !== undefined) return relative;
    absolutePathCount += 1;
    return path.replaceAll('\\', '/');
  };
  const file = {
    format: WORKSPACE_FILE_FORMAT,
    formatVersion: WORKSPACE_FILE_VERSION,
    name: workspace.name,
    kind: workspace.kindId,
    icon: workspace.icon,
    colour: workspace.colour,
    roots: workspace.roots.map((root) => portablePath(root.displayPath)),
    favourites: workspace.favourites.map((favourite) => ({
      path: portablePath(favourite.location.displayPath),
      kind: favourite.kind,
      ...(favourite.label === undefined ? {} : { label: favourite.label }),
      ...(favourite.groupId === undefined ? {} : { group: favourite.groupId }),
    })),
    favouriteGroups: workspace.favouriteGroups.map(({ id, name }) => ({ id, name })),
    settingsOverrides: workspace.settingsOverrides,
  };
  return { text: `${JSON.stringify(file, null, 2)}\n`, absolutePathCount };
}

/** Reads a workspace file strictly; relative paths resolve against the file's folder. */
export function readWorkspaceFile(
  text: string,
  {
    fileFolder,
    kindRegistry,
  }: { readonly fileFolder: string; readonly kindRegistry: readonly WorkspaceKind[] },
): WorkspaceFileReading {
  if (new TextEncoder().encode(text).length > MAX_WORKSPACE_FILE_BYTES) return refused('tooLarge');
  const file = parsedJson(text);
  if (!isRecord(file) || file.format !== WORKSPACE_FILE_FORMAT || !isNamedFile(file))
    return refused('notWorkspaceFile');
  if (file.formatVersion !== WORKSPACE_FILE_VERSION) return refused('unsupportedVersion');
  if (typeof file.kind !== 'string' || !isBuiltKind(kindRegistry, file.kind)) return refused('unknownKind');
  const resolve = (written: unknown) =>
    typeof written === 'string' ? resolvePathFrom(fileFolder, written) : undefined;
  return {
    outcome: 'read',
    workspace: {
      name: file.name.trim(),
      kindId: file.kind,
      icon: typeof file.icon === 'string' ? file.icon : null,
      colour: typeof file.colour === 'string' ? file.colour : null,
      roots: arrayOf(file.roots).flatMap((root) => pathLocation(resolve(root))),
      favourites: arrayOf(file.favourites).flatMap((entry) => favouriteFrom(entry, resolve)),
      favouriteGroups: arrayOf(file.favouriteGroups).flatMap(groupFrom),
      settingsOverrides: parseWorkspaceOverrides(file.settingsOverrides),
    },
  };
}

function refused(reason: WorkspaceFileRefusal): WorkspaceFileReading {
  return { outcome: 'refused', reason };
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isNamedFile(file: Record<string, unknown>): file is Record<string, unknown> & { name: string } {
  return typeof file.name === 'string' && file.name.trim() !== '';
}

function arrayOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function pathLocation(path: string | undefined): DocumentLocation[] {
  return path === undefined ? [] : [locationOfPath(path)];
}

function favouriteFrom(entry: unknown, resolve: (written: unknown) => string | undefined): Favourite[] {
  if (!isRecord(entry) || (entry.kind !== 'file' && entry.kind !== 'folder')) return [];
  const path = resolve(entry.path);
  if (path === undefined) return [];
  return [
    {
      location: locationOfPath(path),
      kind: entry.kind,
      ...(typeof entry.label === 'string' ? { label: entry.label } : {}),
      ...(typeof entry.group === 'string' ? { groupId: entry.group } : {}),
    },
  ];
}

function groupFrom(entry: unknown): FavouriteGroup[] {
  if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') return [];
  return [{ id: entry.id, name: entry.name }];
}
