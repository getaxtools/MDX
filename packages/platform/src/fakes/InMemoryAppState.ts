import type { AppStatePort } from '../AppStatePort';

export class InMemoryAppState implements AppStatePort {
  saveCount = 0;

  constructor(private storedState?: unknown) {}

  load(): Promise<unknown> {
    return Promise.resolve(structuredClone(this.storedState));
  }

  save(state: unknown): Promise<void> {
    this.storedState = structuredClone(state);
    this.saveCount += 1;
    return Promise.resolve();
  }
}
