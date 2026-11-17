import type { WorkspaceListName } from './WorkspaceStorePort';

/** What a window shows, so files opened from Windows go to the window that already has them. */
export interface WindowStateReport {
  readonly workspaceId: string;
  readonly openDocumentPaths: readonly string[];
  readonly rootPaths: readonly string[];
}

/** A workspace Windows asked this window to show, with the files to open in it once it shows it. */
export interface WorkspaceToShow {
  readonly workspaceId: string;
  readonly documentPaths: readonly string[];
}

export type WorkspaceIdListener = (workspaceId: string) => void;
export type WorkspaceListChangeListener = (workspaceId: string, listName: WorkspaceListName) => void;

/** The app's windows: each shows one workspace with its own tabs and layout. */
export interface AppWindowsPort {
  /** Names this window's tabs and layout in the workspace store. */
  readonly windowId: string;
  /** The workspace this window opens with; undefined lets it show the one shown last. */
  startupWorkspaceId(): Promise<string | undefined>;
  /** True once when the app was started with a workspace that does not exist. */
  takeStartupWorkspaceNotice(): Promise<boolean>;
  /** Opens another window on the workspace this window shows. */
  openNewWindow(): Promise<void>;
  reportState(report: WindowStateReport): Promise<void>;
  /** Sends files on to the window the usual rules choose, such as files this window did not open. */
  routeDocuments(paths: readonly string[]): Promise<void>;
  /** Brings forward another window showing the workspace; false when none does. */
  focusWindowShowing(workspaceId: string): Promise<boolean>;
  /** Another window saved a list, such as the favourites, of a workspace this window shows. */
  onWorkspaceListChanged(listener: WorkspaceListChangeListener): () => void;
  /** Windows asked this window to show a workspace, such as from a Jump List entry. */
  onShowWorkspaceRequested(listener: (request: WorkspaceToShow) => void): () => void;
  /** Windows asked for a workspace that does not exist. */
  onWorkspaceNotFound(listener: () => void): () => void;
  /** Another window deleted a workspace. */
  onWorkspaceDeleted(listener: WorkspaceIdListener): () => void;
}
