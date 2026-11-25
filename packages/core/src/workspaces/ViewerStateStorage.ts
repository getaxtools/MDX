import type { AppStatePort } from '@mdx/platform';
import {
  restoreAppState,
  toPersistedAppState,
  type RestoredAppState,
  type ViewerState,
} from '../session/persistedAppState';
import { UnknownSavedFields } from '../session/UnknownSavedFields';
import type { WorkspaceKind } from '../workspace-kinds/workspaceKinds';

export interface RestoredViewerState extends RestoredAppState {
  /** Lists changed by an earlier version in its copy were brought into the Default workspace. */
  readonly hasEarlierVersionChanges: boolean;
}

/** Where the viewer state is kept between starts. */
export interface ViewerStateStorage {
  /** The preferred workspace is shown when it exists; storage without workspaces ignores it. */
  restore(preferredWorkspaceId?: string): Promise<RestoredViewerState>;
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
  private readonly unknownSavedFields = new UnknownSavedFields();

  constructor(private readonly options: LegacyStateStorageOptions) {}

  async restore(): Promise<RestoredViewerState> {
    const { appState, kindRegistry } = this.options;
    const [saved] = await Promise.all([appState.load(), appState.grantSavedAccess()]);
    const restored = restoreAppState(saved, kindRegistry);
    this.unknownSavedFields.rememberFrom(saved);
    return { ...restored, hasEarlierVersionChanges: false };
  }

  async save(state: ViewerState): Promise<void> {
    const { appState, appVersion } = this.options;
    await this.unknownSavedFields.saveWith(appState, toPersistedAppState(state, appVersion));
  }

  async clearAll(): Promise<void> {
    this.unknownSavedFields.forget();
    await this.options.appState.removeBackups();
  }
}
