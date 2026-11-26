/** A workspace file as read from disk; relative paths in it resolve against `folder`. */
export interface WorkspaceFileContents {
  readonly path: string;
  readonly folder: string;
  readonly text: string;
}

export type WorkspaceFileListener = (contents: WorkspaceFileContents) => void;

/** Saving and opening portable workspace files; nothing a file lists is readable until confirmed. */
export interface WorkspaceFilePort {
  /** Asks where to save; the folder is needed to write paths relative to the file. Undefined on cancel. */
  chooseExportPlace(suggestedFileName: string): Promise<{ readonly folder: string } | undefined>;
  /** Writes the text to the place chosen just before and returns the saved path. */
  writeExport(text: string): Promise<string>;
  /** Asks for a workspace file; undefined on cancel. */
  openWorkspaceFile(): Promise<WorkspaceFileContents | undefined>;
  /** The workspace file the app was started with, given once. */
  takeStartupWorkspaceFile(): Promise<WorkspaceFileContents | undefined>;
  /** Workspace files opened from Windows while the app runs. */
  onWorkspaceFileOpened(listener: WorkspaceFileListener): () => void;
}
