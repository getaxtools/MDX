export interface AppStatePort {
  load(): Promise<unknown>;
  /** Rejects with `AppStateRefusedError` when the state itself cannot be stored. */
  save(state: unknown): Promise<void>;
  /** Removes the copies kept of saved state that could not be used (unreadable, or from a newer version). */
  removeBackups(): Promise<void>;
  /** Lets the window read the documents and folders saved in the state file, when it is used. */
  grantSavedAccess(): Promise<void>;
}

/** The state was not saved because it is too large or not valid JSON; the stored state is unchanged. */
export class AppStateRefusedError extends Error {
  constructor() {
    super('The app state was refused as too large or not valid JSON');
    this.name = 'AppStateRefusedError';
  }
}
