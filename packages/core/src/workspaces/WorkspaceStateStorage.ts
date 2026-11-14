import {
  WORKSPACE_LIST_NAMES,
  type AppStatePort,
  type StoredWorkspace,
  type WorkspaceStorePort,
} from '@mdx/platform';
import { restoreAppState, toPersistedAppState, type ViewerState } from '../session/persistedAppState';
import { DEFAULT_WORKSPACE_KIND_ID, type WorkspaceKind } from '../workspace-kinds/workspaceKinds';
import { migrateLegacyAppState } from './migrateLegacyAppState';
import {
  APP_VALUE_KEYS,
  DEFAULT_WORKSPACE_ID,
  storedViewerStateOf,
  viewerStateFrom,
  type SavedViewerParts,
  type StoredViewerState,
} from './storedViewerState';
import type { RestoredViewerState, ViewerStateStorage } from './ViewerStateStorage';

/** The hash of the earlier-version copy last written, to notice when an earlier version changed it. */
export const EARLIER_VERSION_COPY_HASH_KEY = 'earlierVersionCopyHash';

export interface WorkspaceStateStorageOptions {
  readonly workspaceStore: WorkspaceStorePort;
  /** The earlier state file: read once to migrate, then kept as a copy for earlier versions. */
  readonly appState: AppStatePort;
  readonly kindRegistry: readonly WorkspaceKind[];
  readonly windowId: string;
  readonly now: () => number;
  readonly appVersion: string | undefined;
}

/** Keeps the viewer state in the workspace store, writing only the lists, session and values that changed. */
export class WorkspaceStateStorage implements ViewerStateStorage {
  private readonly savedJson = new Map<string, string>();
  private readonly shownWorkspaceId: string = DEFAULT_WORKSPACE_ID;
  /** Set when the store cannot be used; the earlier state file is then read and written as before. */
  private isOnEarlierState = false;

  constructor(private readonly options: WorkspaceStateStorageOptions) {}

  async restore(): Promise<RestoredViewerState> {
    try {
      const registry = await this.options.workspaceStore.loadRegistry();
      return registry.length === 0 ? await this.migrate() : await this.restoreShownWorkspace();
    } catch {
      return this.startOnEarlierState(await this.options.appState.load());
    }
  }

  async save(state: ViewerState): Promise<void> {
    if (this.isOnEarlierState) {
      await this.options.appState.save(toPersistedAppState(state, this.options.appVersion));
      return;
    }
    const hasChanges = await this.saveChangedParts(storedViewerStateOf(state));
    if (hasChanges && this.shownWorkspaceId === DEFAULT_WORKSPACE_ID)
      await this.writeEarlierVersionCopy(state);
  }

  async clearAll(): Promise<void> {
    const { workspaceStore, appState } = this.options;
    this.savedJson.clear();
    await appState.removeBackups();
    if (this.isOnEarlierState) return;
    await workspaceStore.clearAll();
    await workspaceStore.saveWorkspace(this.defaultWorkspace());
  }

  private async migrate(): Promise<RestoredViewerState> {
    const { workspaceStore, appState, kindRegistry, windowId, now } = this.options;
    const earlierState = await appState.load();
    const migration = migrateLegacyAppState(earlierState, { kindRegistry, nowMs: now() });
    try {
      await workspaceStore.importLegacyState({ ...migration, windowId });
    } catch {
      return this.startOnEarlierState(earlierState);
    }
    const restored = viewerStateFrom(migration, kindRegistry);
    this.rememberSaved(storedViewerStateOf(restored));
    return {
      ...restored,
      wasReset: migration.wasReset,
      newerSavedState: migration.newerSavedState,
      hasEarlierVersionChanges: false,
    };
  }

  private async restoreShownWorkspace(): Promise<RestoredViewerState> {
    const { workspaceStore, appState, kindRegistry, windowId } = this.options;
    const [contents, appValues, earlierState] = await Promise.all([
      workspaceStore.loadWorkspace(this.shownWorkspaceId, windowId),
      workspaceStore.loadAppValues(),
      appState.load(),
    ]);
    const stored = {
      lists: contents?.lists ?? {},
      windowSession: contents?.windowSession ?? null,
      appValues,
    };
    const earlierLists = this.listsChangedByEarlierVersion(earlierState, stored);
    const restored = viewerStateFrom(
      earlierLists ? { ...stored, lists: earlierLists } : stored,
      kindRegistry,
    );
    this.rememberSaved(storedViewerStateOf(viewerStateFrom(stored, kindRegistry)));
    return { ...restored, hasEarlierVersionChanges: earlierLists !== undefined };
  }

  /** The Default workspace's lists as an earlier version left them, when they differ from the stored ones. */
  private listsChangedByEarlierVersion(
    earlierState: unknown,
    stored: SavedViewerParts,
  ): StoredViewerState['lists'] | undefined {
    if (this.shownWorkspaceId !== DEFAULT_WORKSPACE_ID || earlierState === undefined) return undefined;
    if (hashOf(JSON.stringify(earlierState)) === stored.appValues[EARLIER_VERSION_COPY_HASH_KEY])
      return undefined;
    const earlier = restoreAppState(earlierState, this.options.kindRegistry);
    if (earlier.wasReset) return undefined;
    const earlierLists = storedViewerStateOf(earlier).lists;
    const storedLists = storedViewerStateOf(viewerStateFrom(stored, this.options.kindRegistry)).lists;
    return JSON.stringify(earlierLists) === JSON.stringify(storedLists) ? undefined : earlierLists;
  }

  private startOnEarlierState(earlierState: unknown): RestoredViewerState {
    this.isOnEarlierState = true;
    return { ...restoreAppState(earlierState, this.options.kindRegistry), hasEarlierVersionChanges: false };
  }

  private async saveChangedParts({ lists, windowSession, appValues }: StoredViewerState): Promise<boolean> {
    const { workspaceStore, windowId } = this.options;
    const workspaceId = this.shownWorkspaceId;
    let hasChanges = false;
    for (const listName of WORKSPACE_LIST_NAMES) {
      if (!this.hasChanged(`list.${listName}`, lists[listName])) continue;
      await workspaceStore.saveList(workspaceId, listName, lists[listName]);
      hasChanges = true;
    }
    if (this.hasChanged('windowSession', windowSession)) {
      await workspaceStore.saveWindowSession(windowId, workspaceId, windowSession);
      hasChanges = true;
    }
    for (const key of APP_VALUE_KEYS) {
      if (!this.hasChanged(`app.${key}`, appValues[key])) continue;
      await workspaceStore.saveAppValue(key, appValues[key]);
      hasChanges = true;
    }
    return hasChanges;
  }

  /** Earlier versions read only the single state file, so it keeps the Default workspace until 2.0. */
  private async writeEarlierVersionCopy(state: ViewerState): Promise<void> {
    const copy = toPersistedAppState(state, this.options.appVersion);
    await this.options.appState.save(copy);
    await this.options.workspaceStore.saveAppValue(
      EARLIER_VERSION_COPY_HASH_KEY,
      hashOf(JSON.stringify(copy)),
    );
  }

  private hasChanged(part: string, value: unknown): boolean {
    const json = JSON.stringify(value);
    if (this.savedJson.get(part) === json) return false;
    this.savedJson.set(part, json);
    return true;
  }

  private rememberSaved({ lists, windowSession, appValues }: StoredViewerState): void {
    for (const listName of WORKSPACE_LIST_NAMES) this.hasChanged(`list.${listName}`, lists[listName]);
    this.hasChanged('windowSession', windowSession);
    for (const key of APP_VALUE_KEYS) this.hasChanged(`app.${key}`, appValues[key]);
  }

  private defaultWorkspace(): StoredWorkspace {
    return {
      id: DEFAULT_WORKSPACE_ID,
      kindId: DEFAULT_WORKSPACE_KIND_ID,
      name: null,
      icon: null,
      colour: null,
      position: 0,
      lastShownAtMs: this.options.now(),
    };
  }
}

/** FNV-1a: enough to notice a changed file, not a security check. */
export function hashOf(text: string): string {
  const FNV_OFFSET_BASIS = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME);
  }
  const HEX_RADIX = 16;
  return (hash >>> 0).toString(HEX_RADIX).padStart('ffffffff'.length, '0');
}
