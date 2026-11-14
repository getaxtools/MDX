import type { AppStatePort } from '../AppStatePort';

export class InMemoryAppState implements AppStatePort {
  saveCount = 0;
  backupRemovalCount = 0;
  savedAccessGrantCount = 0;

  constructor(private storedState?: unknown) {}

  load(): Promise<unknown> {
    return Promise.resolve(structuredClone(this.storedState));
  }

  save(state: unknown): Promise<void> {
    this.storedState = structuredClone(state);
    this.saveCount += 1;
    return Promise.resolve();
  }

  grantSavedAccess(): Promise<void> {
    this.savedAccessGrantCount += 1;
    return Promise.resolve();
  }

  removeBackups(): Promise<void> {
    this.backupRemovalCount += 1;
    return Promise.resolve();
  }
}
