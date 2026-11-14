export interface AppStatePort {
  load(): Promise<unknown>;
  save(state: unknown): Promise<void>;
  /** Removes the copies kept of saved state that could not be used (unreadable, or from a newer version). */
  removeBackups(): Promise<void>;
}
