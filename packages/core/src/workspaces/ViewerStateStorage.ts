import type { AppStatePort } from '@mdx/platform';
import {
  restoreAppState,
  toPersistedAppState,
  type RestoredAppState,
  type ViewerState,
} from '../session/persistedAppState';
import type { WorkspaceKind } from '../workspace-kinds/workspaceKinds';

export interface RestoredViewerState extends RestoredAppState {
  /** Lists changed by an earlier version in its copy were brought into the Default workspace. */
  readonly hasEarlierVersionChanges: boolean;
}

/** Where the viewer state is kept between starts. */
export interface ViewerStateStorage {
  restore(): Promise<RestoredViewerState>;
  save(state: ViewerState): Promise<void>;
  /** Forgets everything stored, including backup copies, as on a first start. */
  clearAll(): Promise<void>;
}

export interface LegacyStateStorageOptions {
  readonly appState: AppStatePort;
  readonly kindRegistry: readonly WorkspaceKind[];
  readonly appVersion: string | undefined;
}

/** The single state file of versions before workspaces. */
export class LegacyStateStorage implements ViewerStateStorage {
  constructor(private readonly options: LegacyStateStorageOptions) {}

  async restore(): Promise<RestoredViewerState> {
    const { appState, kindRegistry } = this.options;
    const [saved] = await Promise.all([appState.load(), appState.grantSavedAccess()]);
    const restored = restoreAppState(saved, kindRegistry);
    return { ...restored, hasEarlierVersionChanges: false };
  }

  async save(state: ViewerState): Promise<void> {
    await this.options.appState.save(toPersistedAppState(state, this.options.appVersion));
  }

  async clearAll(): Promise<void> {
    await this.options.appState.removeBackups();
  }
}
