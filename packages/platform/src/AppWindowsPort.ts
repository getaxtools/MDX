/** What a window shows, so files opened from Windows go to the window that already has them. */
export interface WindowStateReport {
  readonly workspaceId: string;
  readonly openDocumentPaths: readonly string[];
  readonly rootPaths: readonly string[];
}

export type WorkspaceIdListener = (workspaceId: string) => void;

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
  /** Brings forward another window showing the workspace; false when none does. */
  focusWindowShowing(workspaceId: string): Promise<boolean>;
  /** Another window saved a list, such as the favourites, of a workspace this window shows. */
  onWorkspaceListChanged(listener: WorkspaceIdListener): () => void;
  /** Windows asked this window to show a workspace, such as from a Jump List entry. */
  onShowWorkspaceRequested(listener: WorkspaceIdListener): () => void;
  /** Windows asked for a workspace that does not exist. */
  onWorkspaceNotFound(listener: () => void): () => void;
}
