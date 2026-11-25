import { AppStateRefusedError, type AppStatePort } from '@mdx/platform';
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
    const stateJson = jsonTextOf(state);
    try {
      await tauriCommands.saveAppState(stateJson);
    } catch (error) {
      if (isRefusedStateReply(error)) throw new AppStateRefusedError();
      throw error;
    }
  }

  async grantSavedAccess(): Promise<void> {
    await tauriCommands.grantAppStateAccess();
  }

  async removeBackups(): Promise<void> {
    await tauriCommands.removeAppStateBackups();
  }
}

function jsonTextOf(state: unknown): string {
  try {
    return JSON.stringify(state);
  } catch {
    // Nesting too deep for the stack, or a value JSON cannot hold
    throw new AppStateRefusedError();
  }
}

function isRefusedStateReply(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'invalidState';
}
