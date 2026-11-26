/** A change of the Windows session or the power state after which protected notes lock. */
export type ShellEvent = 'sessionLocked' | 'sessionUnlocked' | 'suspending' | 'resumed';

export type ShellEventListener = (event: ShellEvent) => void;

/** What protected notes need from Windows: session and power changes, and a private clipboard. */
export interface ProtectedShellPort {
  onShellEvent(listener: ShellEventListener): () => void;
  /** Copies text so Windows keeps it out of clipboard history and off the cloud clipboard. */
  copyOutsideHistory(text: string): Promise<void>;
  /** Empties the clipboard if it still holds the last copy made here; false when something else was copied since. */
  clearOwnCopy(): Promise<boolean>;
}
