/** The lists each workspace keeps, named like the fields of the earlier state file. */
export const WORKSPACE_LIST_NAMES = [
  'recentFiles',
  'favourites',
  'favouriteGroups',
  'explorerFolders',
  /** The workspace's own theme, reading width and typography. */
  'settingsOverrides',
] as const;

export type WorkspaceListName = (typeof WORKSPACE_LIST_NAMES)[number];

/** A workspace's row in the registry; `kindId` may name a kind this version does not know. */
export interface StoredWorkspace {
  readonly id: string;
  readonly kindId: string;
  /** Null until the user renames it, so the catalog name is shown in the display language. */
  readonly name: string | null;
  readonly icon: string | null;
  readonly colour: string | null;
  readonly position: number;
  readonly lastShownAtMs: number | null;
}

/** A workspace's lists, and the session the asking window last had in it. */
export interface StoredWorkspaceContents {
  readonly lists: Partial<Readonly<Record<WorkspaceListName, unknown>>>;
  readonly windowSession: unknown;
}

/** The earlier single state, moved into one workspace on the first start of the workspaces version. */
export interface LegacyStateImport {
  readonly workspace: StoredWorkspace;
  readonly lists: Readonly<Record<WorkspaceListName, unknown>>;
  readonly windowId: string;
  readonly windowSession: unknown;
  readonly appValues: Readonly<Record<string, unknown>>;
}

export interface WorkspaceStorePort {
  /**
   * Writes the whole import in one transaction and checks it by reading it back; on any failure nothing is
   * kept. Refused when any workspace exists already.
   */
  importLegacyState(legacyState: LegacyStateImport): Promise<void>;
  /** Removes every workspace, list, session and app value, as on a first start. */
  clearAll(): Promise<void>;
  /** Every workspace, in its order, including those of disabled or unknown kinds. */
  loadRegistry(): Promise<StoredWorkspace[]>;
  /** Undefined when no workspace has this id. */
  loadWorkspace(workspaceId: string, windowId: string): Promise<StoredWorkspaceContents | undefined>;
  /** Adds the workspace, or replaces the row with the same id. */
  saveWorkspace(workspace: StoredWorkspace): Promise<void>;
  /** Removes the workspace with its lists and sessions; files on disk are never touched. */
  deleteWorkspace(workspaceId: string): Promise<void>;
  saveList(workspaceId: string, listName: WorkspaceListName, value: unknown): Promise<void>;
  saveWindowSession(windowId: string, workspaceId: string, session: unknown): Promise<void>;
  loadAppValues(): Promise<Readonly<Record<string, unknown>>>;
  /** Lets the window read the folders and documents of the workspace it now shows. */
  grantAccess(workspaceId: string, windowId: string): Promise<void>;
  saveAppValue(key: string, value: unknown): Promise<void>;
}

/** Thrown when a list or session is saved for a workspace that does not exist. */
export class UnknownWorkspaceError extends Error {
  constructor(readonly workspaceId: string) {
    super(`No workspace has the id ${workspaceId}`);
    this.name = 'UnknownWorkspaceError';
  }
}
