import type { ProtectedShellPort, ShellEvent, ShellEventListener } from '../ProtectedShellPort';

/** What the clipboard holds, and whether Windows may keep it in its history. */
export interface FakeClipboard {
  readonly text: string;
  readonly isKeptOutOfHistory: boolean;
}

export class InMemoryProtectedShell implements ProtectedShellPort {
  clipboard: FakeClipboard | undefined;
  private ownCopy: FakeClipboard | undefined;
  private readonly listeners = new Set<ShellEventListener>();

  onShellEvent(listener: ShellEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  copyOutsideHistory(text: string): Promise<void> {
    this.ownCopy = { text, isKeptOutOfHistory: true };
    this.clipboard = this.ownCopy;
    return Promise.resolve();
  }

  clearOwnCopy(): Promise<boolean> {
    const isStillOurs = this.ownCopy !== undefined && this.clipboard === this.ownCopy;
    if (isStillOurs) this.clipboard = undefined;
    this.ownCopy = undefined;
    return Promise.resolve(isStillOurs);
  }

  /** Acts as another program copying, even the same text, which the clipboard sees as new content. */
  copyElsewhere(text: string): void {
    this.clipboard = { text, isKeptOutOfHistory: false };
  }

  /** Acts as Windows reporting a session or power change. */
  emit(event: ShellEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
