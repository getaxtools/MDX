import type { AppStatePort } from '@mdx/platform';
import { tauriCommands } from './tauriCommands';

export class TauriAppState implements AppStatePort {
  async load(): Promise<unknown> {
    const saved = await tauriCommands.loadAppState();
    if (saved === null) return undefined;
    try {
      return JSON.parse(saved) as unknown;
    } catch {
      return saved;
    }
  }

  async save(state: unknown): Promise<void> {
    await tauriCommands.saveAppState(JSON.stringify(state));
  }
}
