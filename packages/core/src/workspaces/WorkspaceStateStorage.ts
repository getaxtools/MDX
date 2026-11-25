import {
  WORKSPACE_LIST_NAMES,
  type AppStatePort,
  type StoredWorkspace,
  type WorkspaceListName,
  type WorkspaceStorePort,
} from '@mdx/platform';
import {
  restoreAppState,
  toPersistedAppState,
  type PersistedAppState,
  type ViewerState,
} from '../session/persistedAppState';
import { unknownFieldsOf } from '../session/savedValues';
import { UnknownSavedFields } from '../session/UnknownSavedFields';
import { VIEW_SETTING_FIELDS } from '../view/ViewSettings';
import {
  DEFAULT_WORKSPACE_KIND_ID,
  isBuiltKind,
  type WorkspaceKind,
} from '../workspace-kinds/workspaceKinds';
import { migrateLegacyAppState } from './migrateLegacyAppState';
import {
  APP_VALUE_KEYS,
  DEFAULT_WORKSPACE_ID,
  storedViewerStateOf,
  viewerStateFrom,
  type AppValueKey,
  type SavedViewerParts,
  type StoredViewerState,
} from './storedViewerState';
import type { RestoredViewerState, ViewerStateStorage } from './ViewerStateStorage';
import { WorkspaceRegistry } from './WorkspaceRegistry';

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
  private registry = WorkspaceRegistry.fromStored([]);
  private shownWorkspaceId: string = DEFAULT_WORKSPACE_ID;
  /** Set when the store cannot be used; the earlier state file is then read and written as before. */
  private isOnEarlierState = false;
  /** Kept in the state file earlier versions read, which is the only place a newer version left them. */
  private readonly earlierStateUnknownFields = new UnknownSavedFields();
  /** View settings a newer version saved in the store, written back with every save of the settings. */
  private unknownViewSettings: Readonly<Record<string, unknown>> = {};

  constructor(private readonly options: WorkspaceStateStorageOptions) {}

  async restore(preferredWorkspaceId?: string): Promise<RestoredViewerState> {
    try {
      const workspaces = await this.options.workspaceStore.loadRegistry();
      if (workspaces.length === 0) return await this.migrate();
      this.registry = WorkspaceRegistry.fromStored(workspaces);
      this.shownWorkspaceId = this.workspaceToRestore(preferredWorkspaceId);
      return await this.restoreShownWorkspace();
    } catch {
      return await this.startOnEarlierState(await this.options.appState.load());
    }
  }

  async save(state: ViewerState): Promise<void> {
    if (this.isOnEarlierState) {
      await this.writeEarlierVersionState(state);
      return;
    }
    const hasChanges = await this.saveChangedParts(storedViewerStateOf(state));
    if (hasChanges && this.shownWorkspaceId === DEFAULT_WORKSPACE_ID)
      await this.writeEarlierVersionCopy(state);
  }

  async clearAll(): Promise<void> {
    const { appState, workspaceStore } = this.options;
    this.savedJson.clear();
    this.earlierStateUnknownFields.forget();
    this.unknownViewSettings = {};
    try {
      if (this.isOnEarlierState) await workspaceStore.clearAll();
      else await this.clearWorkspaceStore();
    } catch (storeError) {
      await appState.removeBackups().catch(() => undefined);
      throw storeError;
    }
    await appState.removeBackups();
  }

  private async clearWorkspaceStore(): Promise<void> {
    const failures: unknown[] = [];
    await this.options.workspaceStore.clearAll().catch((clearError: unknown) => failures.push(clearError));
    await this.showDefaultWorkspaceOfStore().catch((readBackError: unknown) => {
      failures.push(readBackError);
      this.registry = WorkspaceRegistry.fromStored([this.defaultWorkspace()]);
      this.shownWorkspaceId = DEFAULT_WORKSPACE_ID;
    });
    if (failures.length > 0) throw failures[0];
  }

  /** A clear can fail after its rows are gone, so the registry is read back rather than assumed. */
  private async showDefaultWorkspaceOfStore(): Promise<void> {
    const { workspaceStore } = this.options;
    let stored = await workspaceStore.loadRegistry();
    if (!stored.some((workspace) => workspace.id === DEFAULT_WORKSPACE_ID)) {
      const defaultWorkspace = this.defaultWorkspace();
      await workspaceStore.saveWorkspace(defaultWorkspace);
      stored = [...stored, defaultWorkspace];
    }
    this.registry = WorkspaceRegistry.fromStored(stored);
    this.shownWorkspaceId = DEFAULT_WORKSPACE_ID;
  }

  /** False while the store cannot be used and the earlier state file stands in for it. */
  hasWorkspaces(): boolean {
    return !this.isOnEarlierState;
  }

  workspaces(): WorkspaceRegistry {
    return this.registry;
  }

  shownWorkspace(): StoredWorkspace | undefined {
    return this.registry.find(this.shownWorkspaceId);
  }

  /** Stores a created or renamed workspace together with the registry that contains it. */
  async saveWorkspace(registry: WorkspaceRegistry, workspace: StoredWorkspace): Promise<void> {
    await this.options.workspaceStore.saveWorkspace(workspace);
    this.registry = registry;
  }

  /** Lists a new workspace starts with, such as the folders and favourites of a workspace file. */
  async saveInitialLists(
    workspaceId: string,
    lists: Partial<Readonly<Record<WorkspaceListName, unknown>>>,
  ): Promise<void> {
    for (const [listName, value] of Object.entries(lists))
      await this.options.workspaceStore.saveList(workspaceId, listName as WorkspaceListName, value);
  }

  async deleteWorkspace(registry: WorkspaceRegistry, workspaceId: string): Promise<void> {
    await this.options.workspaceStore.deleteWorkspace(workspaceId);
    this.registry = registry;
  }

  /**
   * Saves the current workspace, then gives the target's tabs, layout and lists with the current app-wide
   * values: settings, kinds, shortcuts, word goals and snippets stay as they are.
   */
  async switchTo(
    workspaceId: string,
    current: ViewerState,
    { shouldSaveCurrent = true } = {},
  ): Promise<RestoredViewerState> {
    const { workspaceStore, kindRegistry, windowId, now } = this.options;
    if (shouldSaveCurrent) await this.save(current);
    const shown = this.registry.markShown(workspaceId, now());
    if (shown?.outcome === 'changed') await this.saveWorkspace(shown.registry, shown.workspace);
    this.shownWorkspaceId = workspaceId;
    this.forgetSavedWorkspaceParts();
    const contents = await workspaceStore.loadWorkspace(workspaceId, windowId);
    await workspaceStore.grantAccess(workspaceId, windowId);
    const restored = viewerStateFrom(
      {
        lists: contents?.lists ?? {},
        windowSession: contents?.windowSession ?? null,
        appValues: storedViewerStateOf(current).appValues,
      },
      kindRegistry,
    );
    this.rememberSaved(storedViewerStateOf(restored));
    return { ...restored, hasEarlierVersionChanges: false };
  }

  /** False while the state holds a change to the list that this window has not saved yet. */
  isListSaved(listName: WorkspaceListName, state: ViewerState): boolean {
    const json = JSON.stringify(storedViewerStateOf(state).lists[listName]);
    return this.savedJson.get(`list.${listName}`) === json;
  }

  /** One list of a workspace as stored, such as after another window saved it. */
  async loadList(workspaceId: string, listName: WorkspaceListName): Promise<unknown> {
    const { workspaceStore, windowId } = this.options;
    return (await workspaceStore.loadWorkspace(workspaceId, windowId))?.lists[listName];
  }

  /** The state with one list replaced by a loaded value, which counts as saved, so it is not written back. */
  withLoadedList(listName: WorkspaceListName, value: unknown, current: ViewerState): ViewerState {
    const { lists, windowSession, appValues } = storedViewerStateOf(current);
    const reloaded = viewerStateFrom(
      { lists: { ...lists, [listName]: value }, windowSession, appValues },
      this.options.kindRegistry,
    );
    this.hasChanged(`list.${listName}`, storedViewerStateOf(reloaded).lists[listName]);
    return { ...current, ...stateFieldsOf(listName, reloaded) };
  }

  /** Reads the registry again, such as after another window deleted a workspace. */
  async reloadRegistry(): Promise<void> {
    this.registry = WorkspaceRegistry.fromStored(await this.options.workspaceStore.loadRegistry());
  }

  private async migrate(): Promise<RestoredViewerState> {
    const { workspaceStore, appState, kindRegistry, windowId, now } = this.options;
    const earlierState = await appState.load();
    this.earlierStateUnknownFields.rememberFrom(earlierState);
    const migration = migrateLegacyAppState(earlierState, { kindRegistry, nowMs: now() });
    try {
      await workspaceStore.importLegacyState({ ...migration, windowId });
      await workspaceStore.grantAccess(migration.workspace.id, windowId);
    } catch {
      return this.startOnEarlierState(earlierState);
    }
    this.registry = WorkspaceRegistry.fromStored([migration.workspace]);
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
      workspaceStore.grantAccess(this.shownWorkspaceId, windowId),
    ]);
    this.earlierStateUnknownFields.rememberFrom(earlierState);
    this.unknownViewSettings = unknownFieldsOf(appValues.viewSettings, VIEW_SETTING_FIELDS);
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

  /** The preferred workspace, or else the one shown last, among those whose kind this version has built. */
  private workspaceToRestore(preferredWorkspaceId: string | undefined): string {
    const openable = this.registry
      .workspaces()
      .filter((workspace) => isBuiltKind(this.options.kindRegistry, workspace.kindId));
    if (openable.some((workspace) => workspace.id === preferredWorkspaceId))
      return preferredWorkspaceId ?? DEFAULT_WORKSPACE_ID;
    const lastShown = openable.reduce<StoredWorkspace | undefined>(
      (latest, workspace) =>
        latest === undefined || (workspace.lastShownAtMs ?? 0) > (latest.lastShownAtMs ?? 0)
          ? workspace
          : latest,
      undefined,
    );
    return lastShown?.id ?? DEFAULT_WORKSPACE_ID;
  }

  /** Lists and the window session belong to one workspace; app-wide values carry over a switch. */
  private forgetSavedWorkspaceParts(): void {
    for (const part of [...this.savedJson.keys()]) if (!part.startsWith('app.')) this.savedJson.delete(part);
  }

  private async startOnEarlierState(earlierState: unknown): Promise<RestoredViewerState> {
    this.isOnEarlierState = true;
    this.earlierStateUnknownFields.rememberFrom(earlierState);
    await this.options.appState.grantSavedAccess();
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
      await workspaceStore.saveAppValue(key, this.withUnknownViewSettings(key, appValues[key]));
      hasChanges = true;
    }
    return hasChanges;
  }

  /** Earlier versions read only the single state file, so it keeps the Default workspace until 2.0. */
  private async writeEarlierVersionCopy(state: ViewerState): Promise<void> {
    const copy = await this.writeEarlierVersionState(state);
    await this.options.workspaceStore.saveAppValue(
      EARLIER_VERSION_COPY_HASH_KEY,
      hashOf(JSON.stringify(copy)),
    );
  }

  private async writeEarlierVersionState(state: ViewerState): Promise<PersistedAppState> {
    const { appState, appVersion } = this.options;
    return this.earlierStateUnknownFields.saveWith(appState, toPersistedAppState(state, appVersion));
  }

  private withUnknownViewSettings(key: AppValueKey, value: unknown): unknown {
    if (key !== 'viewSettings' || Object.keys(this.unknownViewSettings).length === 0) return value;
    return { ...this.unknownViewSettings, ...(value as object) };
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

/** The parts of the viewer state a stored list is read into. */
function stateFieldsOf(listName: WorkspaceListName, state: ViewerState): Partial<ViewerState> {
  switch (listName) {
    case 'recentFiles':
      return { recentFiles: state.recentFiles };
    case 'favourites':
    case 'favouriteGroups':
      return { favourites: state.favourites };
    case 'explorerFolders':
      return { explorerFolders: state.explorerFolders };
    case 'settingsOverrides':
      return { workspaceOverrides: state.workspaceOverrides ?? {} };
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
