export interface AppStatePort {
  load(): Promise<unknown>;
  save(state: unknown): Promise<void>;
  /** Removes the copies kept of saved state that could not be used (unreadable, or from a newer version). */
  removeBackups(): Promise<void>;
  /** Lets the window read the documents and folders saved in the state file, when it is used. */
  grantSavedAccess(): Promise<void>;
}
