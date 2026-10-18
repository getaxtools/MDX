export interface AppStatePort {
  load(): Promise<unknown>;
  save(state: unknown): Promise<void>;
}
