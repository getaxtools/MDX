import {
  DocumentOpenError,
  isViewLocation,
  untitledLocation,
  type AppStatePort,
  type DocumentFilePort,
  type DocumentLocation,
  type OpenedDocument,
  type PathStatus,
  type SaveSource,
  type StoredWorkspace,
  type WorkspaceListName,
  type WorkspaceStorePort,
} from '@mdx/platform';
import { withDocumentLineBreaks } from '../documents/lineEndings';
import { ExplorerFolders } from '../explorer/ExplorerFolders';
import { FavouritesList } from '../favourites/FavouritesList';
import { locationAfterNoteMove, type MovedNote } from '../notes/noteMoves';
import { RecentFilesList } from '../recent-files/RecentFilesList';
import type { ShortcutOverrides } from '../shortcuts/parseShortcutOverrides';
import type { WordGoals } from '../word-goals/wordGoals';
import { EMPTY_SNIPPET_LIBRARY, type SnippetLibrary } from '../snippets/snippetLibrary';
import { InjectionIgnoreList } from '../prompt-injection/InjectionIgnoreList';
import { TabStrip } from '../tabs/TabStrip';
import { DEFAULT_VIEW_SETTINGS, type ViewSettings } from '../view/ViewSettings';
import {
  changeShownSettings,
  setOverride,
  withOverrides,
  type WorkspaceOverrideField,
} from '../view/viewSettingsScopes';
import {
  DEFAULT_WORKSPACE_KIND_ID,
  WORKSPACE_KINDS,
  type WorkspaceKind,
} from '../workspace-kinds/workspaceKinds';
import { WorkspaceKindsState } from '../workspace-kinds/WorkspaceKindsState';
import type { NewerSavedState, ViewerState } from './persistedAppState';
import { MAIN_WINDOW_ID } from '../workspaces/storedViewerState';
import { LegacyStateStorage, type ViewerStateStorage } from '../workspaces/ViewerStateStorage';
import type {
  NewWorkspace,
  WorkspaceChange,
  WorkspaceRegistry,
  WorkspaceRemoval,
} from '../workspaces/WorkspaceRegistry';
import { WorkspaceStateStorage } from '../workspaces/WorkspaceStateStorage';

export interface ViewerSessionDependencies {
  readonly documentFiles: DocumentFilePort;
  readonly appState: AppStatePort;
  readonly now: () => number;
  /** The workspace kinds this build offers; the UI test build also offers planned ones. */
  readonly kindRegistry?: readonly WorkspaceKind[];
  /** Written with the saved state, so an older version can name the one that saved it. */
  readonly appVersion?: string;
  /** Keeps the state in workspaces; without it the earlier single state file is used. */
  readonly workspaceStore?: WorkspaceStorePort;
  /** Ids for new workspaces; random UUIDs unless a test needs fixed ones. */
  readonly createId?: () => string;
  /** Names this window's tabs and layout in the store; each window keeps its own. */
  readonly windowId?: string;
}

/** What the user enters for a new workspace; the session adds the id and the time. */
export type WorkspaceRequest = Omit<NewWorkspace, 'id' | 'nowMs'>;

/** Lists a new workspace starts with, such as the folders and favourites of a workspace file. */
export type InitialWorkspaceLists = Partial<Readonly<Record<WorkspaceListName, unknown>>>;

export interface RestoreOutcome {
  readonly wasReset: boolean;
  readonly newerSavedState: NewerSavedState | undefined;
  readonly hasEarlierVersionChanges: boolean;
}

export type { ViewerState } from './persistedAppState';

type ViewerStateListener = (state: ViewerState) => void;

function emptyState(kindRegistry: readonly WorkspaceKind[]): ViewerState {
  return {
    tabStrip: TabStrip.empty(),
    recentFiles: RecentFilesList.empty(),
    favourites: FavouritesList.empty(),
    explorerFolders: ExplorerFolders.empty(),
    viewSettings: DEFAULT_VIEW_SETTINGS,
    workspaceKinds: WorkspaceKindsState.initial(kindRegistry),
    shortcutOverrides: {},
    wordGoals: {},
    snippetLibrary: EMPTY_SNIPPET_LIBRARY,
    injectionIgnoreList: InjectionIgnoreList.empty(),
  };
}

function workspaceStorageFor(
  { appState, workspaceStore, now, appVersion, windowId }: ViewerSessionDependencies,
  kindRegistry: readonly WorkspaceKind[],
): WorkspaceStateStorage | undefined {
  if (!workspaceStore) return undefined;
  return new WorkspaceStateStorage({
    workspaceStore,
    appState,
    kindRegistry,
    windowId: windowId ?? MAIN_WINDOW_ID,
    now,
    appVersion,
  });
}

function viewerStateOf(restored: ViewerState): ViewerState {
  return {
    tabStrip: restored.tabStrip,
    recentFiles: restored.recentFiles,
    favourites: restored.favourites,
    explorerFolders: restored.explorerFolders,
    viewSettings: restored.viewSettings,
    workspaceKinds: restored.workspaceKinds,
    shortcutOverrides: restored.shortcutOverrides,
    wordGoals: restored.wordGoals,
    snippetLibrary: restored.snippetLibrary,
    injectionIgnoreList: restored.injectionIgnoreList,
    ...(restored.workspaceOverrides ? { workspaceOverrides: restored.workspaceOverrides } : {}),
  };
}

/** The state as the window shows it: the shown workspace's overrides on top of the app settings. */
function shownStateOf(state: ViewerState): ViewerState {
  const overrides = state.workspaceOverrides;
  if (!overrides || Object.keys(overrides).length === 0) return state;
  return { ...state, viewSettings: withOverrides(state.viewSettings, overrides) };
}

export class ViewerSession {
  private state: ViewerState;
  private readonly openedDocuments = new Map<string, OpenedDocument>();
  private readonly untitledDocuments = new Map<string, OpenedDocument>();
  /** Encodings the user chose with Reopen with Encoding, kept for live reload. */
  private readonly chosenEncodings = new Map<string, string>();
  private untitledCount = 0;
  private readonly listeners = new Set<ViewerStateListener>();

  private readonly kindRegistry: readonly WorkspaceKind[];
  private readonly storage: ViewerStateStorage;
  private readonly workspaceStorage: WorkspaceStateStorage | undefined;
  /** The shown state of the last state asked for, so it keeps its identity between changes. */
  private shownState: { readonly source: ViewerState; readonly shown: ViewerState } | undefined;

  constructor(private readonly dependencies: ViewerSessionDependencies) {
    this.kindRegistry = dependencies.kindRegistry ?? WORKSPACE_KINDS;
    this.state = emptyState(this.kindRegistry);
    this.workspaceStorage = workspaceStorageFor(dependencies, this.kindRegistry);
    this.storage =
      this.workspaceStorage ??
      new LegacyStateStorage({
        appState: dependencies.appState,
        kindRegistry: this.kindRegistry,
        appVersion: dependencies.appVersion,
      });
  }

  /** What the window shows; view settings already include the shown workspace's overrides. */
  currentState(): ViewerState {
    if (this.shownState?.source !== this.state) {
      this.shownState = { source: this.state, shown: shownStateOf(this.state) };
    }
    return this.shownState.shown;
  }

  /** Shows the preferred workspace when it exists, such as the one a new window was opened on. */
  async restore(preferredWorkspaceId?: string): Promise<RestoreOutcome> {
    const restored = await this.storage.restore(preferredWorkspaceId);
    this.openedDocuments.clear();
    this.replaceState(viewerStateOf(restored));
    const { wasReset, newerSavedState, hasEarlierVersionChanges } = restored;
    return { wasReset, newerSavedState, hasEarlierVersionChanges };
  }

  /** Forgets every tab, recent file, favourite, opened folder, setting and kind choice, as on a first start. */
  clearAllData(): void {
    this.openedDocuments.clear();
    this.untitledDocuments.clear();
    this.chosenEncodings.clear();
    this.untitledCount = 0;
    this.replaceState(emptyState(this.kindRegistry));
  }

  async save(): Promise<void> {
    await this.storage.save(this.state);
  }

  /** Removes stored workspaces, values and backup copies; the next save writes the current state again. */
  async clearStoredData(): Promise<void> {
    await this.storage.clearAll();
    this.replaceState(this.state);
  }

  /** The workspace registry, or undefined while the earlier state file stands in for the store. */
  workspaces(): WorkspaceRegistry | undefined {
    return this.workspaceStorage?.hasWorkspaces() ? this.workspaceStorage.workspaces() : undefined;
  }

  shownWorkspace(): StoredWorkspace | undefined {
    return this.workspaces() ? this.workspaceStorage?.shownWorkspace() : undefined;
  }

  /** Creates a workspace of an enabled kind and shows it in this window. */
  async createWorkspace(
    request: WorkspaceRequest,
    initialLists: InitialWorkspaceLists = {},
  ): Promise<WorkspaceChange | undefined> {
    const storage = this.workspaceStorage;
    const registry = this.workspaces();
    if (!storage || !registry) return undefined;
    const id = this.dependencies.createId?.() ?? crypto.randomUUID();
    const change = registry.create(
      { ...request, id, nowMs: this.dependencies.now() },
      this.state.workspaceKinds,
    );
    if (change.outcome !== 'changed') return change;
    await storage.saveWorkspace(change.registry, change.workspace);
    await storage.saveInitialLists(change.workspace.id, initialLists);
    await this.switchWorkspace(change.workspace.id);
    return change;
  }

  async renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceChange | undefined> {
    const registry = this.workspaces();
    if (!this.workspaceStorage || !registry) return undefined;
    const change = registry.rename(workspaceId, name);
    if (change.outcome === 'changed')
      await this.workspaceStorage.saveWorkspace(change.registry, change.workspace);
    this.replaceState(this.state);
    return change;
  }

  async updateWorkspaceKindData(workspaceId: string, kindData: unknown): Promise<void> {
    const change = this.workspaces()?.setKindData(workspaceId, kindData);
    if (!this.workspaceStorage || change?.outcome !== 'changed') return;
    await this.workspaceStorage.saveWorkspace(change.registry, change.workspace);
    this.replaceState(this.state);
  }

  /** A shown workspace is first replaced by the Markdown viewer workspace shown most recently. */
  async deleteWorkspace(workspaceId: string): Promise<WorkspaceRemoval | undefined> {
    const registry = this.workspaces();
    if (!this.workspaceStorage || !registry) return undefined;
    const removal = registry.remove(workspaceId);
    if (removal.outcome !== 'removed') return removal;
    if (this.shownWorkspace()?.id === workspaceId) {
      const fallback = removal.registry.lastShownOfKind(DEFAULT_WORKSPACE_KIND_ID);
      if (fallback) await this.switchWorkspace(fallback.id);
    }
    await this.workspaceStorage.deleteWorkspace(removal.registry, workspaceId);
    this.replaceState(this.state);
    return removal;
  }

  /** Takes the shown workspace's lists as another window saved them, keeping this window's tabs. */
  async reloadWorkspaceLists(workspaceId: string): Promise<void> {
    if (!this.workspaceStorage || this.shownWorkspace()?.id !== workspaceId) return;
    const reloaded = await this.workspaceStorage.reloadLists(this.state);
    this.replaceState({
      ...this.state,
      recentFiles: reloaded.recentFiles,
      favourites: reloaded.favourites,
      explorerFolders: reloaded.explorerFolders,
      ...(reloaded.workspaceOverrides ? { workspaceOverrides: reloaded.workspaceOverrides } : {}),
    });
  }

  /** Shows another workspace's tabs, lists and layout; the caller has dealt with unsaved edits. */
  async switchWorkspace(workspaceId: string): Promise<void> {
    if (!this.workspaceStorage || !this.workspaces()?.find(workspaceId)) return;
    const restored = await this.workspaceStorage.switchTo(workspaceId, this.state);
    this.openedDocuments.clear();
    this.untitledDocuments.clear();
    this.untitledCount = 0;
    const kindId = this.shownWorkspace()?.kindId ?? DEFAULT_WORKSPACE_KIND_ID;
    const workspaceKinds = restored.workspaceKinds.isEnabled(kindId)
      ? restored.workspaceKinds.switchKind(kindId)
      : restored.workspaceKinds;
    this.replaceState({ ...viewerStateOf(restored), workspaceKinds });
  }

  /**
   * Opens a document in a tab. A document already open only gets its tab focused: reading it again
   * would drop the encoding the user chose and the file time that edits are checked against.
   */
  async openDocument(path: string): Promise<OpenedDocument> {
    const document = this.alreadyOpenDocument(path) ?? (await this.dependencies.documentFiles.open(path));
    this.openedDocuments.set(document.location.canonicalKey, document);
    this.replaceState({
      ...this.state,
      tabStrip: this.state.tabStrip.openOrFocus(document.location),
      recentFiles: this.state.recentFiles.add(document.location, this.dependencies.now()),
    });
    return document;
  }

  /** Opens or focuses a tab that shows a view of the app; it reads nothing and stays out of recent files. */
  openView(location: DocumentLocation): void {
    this.replaceState({ ...this.state, tabStrip: this.state.tabStrip.openOrFocus(location) });
  }

  /** Opens text that has no file yet, such as a converted table, in a new tab named by `nameFor`. */
  openUntitledDocument(text: string, nameFor: (number: number) => string): OpenedDocument {
    this.untitledCount += 1;
    const document: OpenedDocument = {
      location: untitledLocation(this.untitledCount, nameFor(this.untitledCount)),
      text,
      encoding: 'utf-8',
      hasByteOrderMark: false,
      lineEnding: text.includes('\r\n') ? 'crlf' : 'lf',
      modifiedAtMs: this.dependencies.now(),
    };
    this.untitledDocuments.set(document.location.canonicalKey, document);
    this.replaceState({ ...this.state, tabStrip: this.state.tabStrip.openOrFocus(document.location) });
    return document;
  }

  /**
   * Saves an open document where the user chooses and shows the saved file in its tab. Edited text,
   * when given, is saved as UTF-8; otherwise a document with a file is copied byte for byte.
   */
  async saveDocumentAs(canonicalKey: string, editedText?: string): Promise<DocumentLocation | undefined> {
    const tab = this.state.tabStrip
      .tabs()
      .find((candidate) => candidate.location.canonicalKey === canonicalKey);
    if (!tab) return undefined;
    const source = this.saveSourceFor(tab.location, editedText);
    const savedPath = await this.dependencies.documentFiles.saveAs(source);
    if (savedPath === undefined) return undefined;
    const saved = await this.dependencies.documentFiles.open(savedPath);
    this.untitledDocuments.delete(canonicalKey);
    this.openedDocuments.set(saved.location.canonicalKey, saved);
    this.replaceState({
      ...this.state,
      tabStrip: this.state.tabStrip.replace(canonicalKey, saved.location),
      recentFiles: this.state.recentFiles.add(saved.location, this.dependencies.now()),
    });
    return saved.location;
  }

  /**
   * Writes edited text over an open document in its own encoding and line breaks; rejects with
   * `changedOnDisk` when another program changed the file since it was read, unless told to overwrite.
   */
  async saveEditedDocument(
    canonicalKey: string,
    editedText: string,
    { shouldOverwriteChangesOnDisk = false } = {},
  ): Promise<void> {
    const document = this.openedDocuments.get(canonicalKey);
    if (!document) throw new DocumentOpenError('unreadable', canonicalKey);
    if (document.hasDecodingErrors === true) {
      throw new DocumentOpenError('lossyDecoding', document.location.displayPath);
    }
    const text = withDocumentLineBreaks(editedText, document.lineEnding, document.text);
    const modifiedAtMs = await this.dependencies.documentFiles.save({
      path: document.location.displayPath,
      text,
      encoding: document.encoding,
      hasByteOrderMark: document.hasByteOrderMark,
      expectedModifiedAtMs: document.modifiedAtMs,
      shouldOverwriteChangesOnDisk,
    });
    this.openedDocuments.set(canonicalKey, { ...document, text, modifiedAtMs });
    this.chosenEncodings.set(canonicalKey, document.encoding);
    this.replaceState({ ...this.state });
  }

  async loadActiveDocument(): Promise<OpenedDocument | undefined> {
    const activeTab = this.state.tabStrip.activeTab();
    if (!activeTab) return undefined;
    if (isViewLocation(activeTab.location)) return undefined;
    const { canonicalKey, displayPath } = activeTab.location;
    return (
      this.untitledDocuments.get(canonicalKey) ??
      this.openedDocuments.get(canonicalKey) ??
      this.openDocument(displayPath)
    );
  }

  /** Re-reads open documents that changed on disk, without changing tabs or recent files. */
  async reloadDocuments(displayPaths: readonly string[]): Promise<void> {
    const changedTabs = this.state.tabStrip
      .tabs()
      .filter((tab) => !isViewLocation(tab.location) && displayPaths.includes(tab.location.displayPath));
    if (changedTabs.length === 0) return;
    for (const { location } of changedTabs) {
      try {
        this.openedDocuments.set(
          location.canonicalKey,
          await this.dependencies.documentFiles.open(
            location.displayPath,
            this.chosenEncodings.get(location.canonicalKey),
          ),
        );
      } catch {
        this.openedDocuments.delete(location.canonicalKey);
      }
    }
    this.replaceState({ ...this.state });
  }

  /** Reads an open document again with the given encoding, or with detection for `undefined`. */
  async reopenWithEncoding(canonicalKey: string, encoding: string | undefined): Promise<void> {
    const tab = this.state.tabStrip
      .tabs()
      .find((candidate) => candidate.location.canonicalKey === canonicalKey);
    if (!tab) return;
    const document = await this.dependencies.documentFiles.open(tab.location.displayPath, encoding);
    if (encoding === undefined) this.chosenEncodings.delete(canonicalKey);
    else this.chosenEncodings.set(canonicalKey, encoding);
    this.openedDocuments.set(canonicalKey, document);
    this.replaceState({ ...this.state });
  }

  /** An open document as last read or saved, including documents that have no file yet. */
  openedDocument(canonicalKey: string): OpenedDocument | undefined {
    return this.openedDocuments.get(canonicalKey) ?? this.untitledDocuments.get(canonicalKey);
  }

  updateTabs(change: (tabStrip: TabStrip) => TabStrip): void {
    const tabStrip = change(this.state.tabStrip);
    for (const canonicalKey of this.openedDocuments.keys()) {
      if (!tabStrip.isOpen(canonicalKey)) this.openedDocuments.delete(canonicalKey);
    }
    this.replaceState({ ...this.state, tabStrip });
  }

  /** After a note was renamed or moved, its tabs, child notes' tabs and recent files point at the new place. */
  followMovedNote(move: MovedNote): void {
    let { tabStrip, recentFiles } = this.state;
    for (const tab of tabStrip.tabs()) {
      const moved = locationAfterNoteMove(tab.location, move);
      if (!moved) continue;
      tabStrip = tabStrip.replace(tab.location.canonicalKey, moved);
      const document = this.openedDocuments.get(tab.location.canonicalKey);
      this.openedDocuments.delete(tab.location.canonicalKey);
      if (document) this.openedDocuments.set(moved.canonicalKey, { ...document, location: moved });
    }
    for (const recentFile of recentFiles.entries()) {
      const moved = locationAfterNoteMove(recentFile.location, move);
      if (moved) recentFiles = recentFiles.relocate(recentFile.location.canonicalKey, moved);
    }
    this.replaceState({ ...this.state, tabStrip, recentFiles });
  }

  updateRecentFiles(change: (recentFiles: RecentFilesList) => RecentFilesList): void {
    this.replaceState({ ...this.state, recentFiles: change(this.state.recentFiles) });
  }

  updateFavourites(change: (favourites: FavouritesList) => FavouritesList): void {
    this.replaceState({ ...this.state, favourites: change(this.state.favourites) });
  }

  updateExplorerFolders(change: (explorerFolders: ExplorerFolders) => ExplorerFolders): void {
    this.replaceState({ ...this.state, explorerFolders: change(this.state.explorerFolders) });
  }

  checkPathStatuses(locations: readonly DocumentLocation[]): Promise<ReadonlyMap<string, PathStatus>> {
    return this.dependencies.documentFiles.checkPathStatuses(locations);
  }

  /** Changes the settings the window shows; a field the workspace overrides changes its override. */
  updateViewSettings(change: (viewSettings: ViewSettings) => ViewSettings): void {
    const { appSettings, overrides } = changeShownSettings(
      this.state.viewSettings,
      this.state.workspaceOverrides ?? {},
      change,
    );
    this.replaceState({ ...this.state, viewSettings: appSettings, workspaceOverrides: overrides });
  }

  /** Gives the shown workspace its own value for a field, or lets it follow the app setting again. */
  setWorkspaceOverride(field: WorkspaceOverrideField, isOverridden: boolean): void {
    if (!this.workspaces()) return;
    const overrides = setOverride(this.state.viewSettings, this.state.workspaceOverrides ?? {}, {
      field,
      isOverridden,
    });
    this.replaceState({ ...this.state, workspaceOverrides: overrides });
  }

  updateWorkspaceKinds(change: (workspaceKinds: WorkspaceKindsState) => WorkspaceKindsState): void {
    this.replaceState({ ...this.state, workspaceKinds: change(this.state.workspaceKinds) });
  }

  updateShortcutOverrides(change: (shortcutOverrides: ShortcutOverrides) => ShortcutOverrides): void {
    this.replaceState({ ...this.state, shortcutOverrides: change(this.state.shortcutOverrides) });
  }

  updateWordGoals(change: (wordGoals: WordGoals) => WordGoals): void {
    this.replaceState({ ...this.state, wordGoals: change(this.state.wordGoals) });
  }

  updateInjectionIgnoreList(change: (ignoreList: InjectionIgnoreList) => InjectionIgnoreList): void {
    const changed = change(this.state.injectionIgnoreList);
    if (changed !== this.state.injectionIgnoreList)
      this.replaceState({ ...this.state, injectionIgnoreList: changed });
  }

  updateSnippetLibrary(change: (snippetLibrary: SnippetLibrary) => SnippetLibrary): void {
    this.replaceState({ ...this.state, snippetLibrary: change(this.state.snippetLibrary) });
  }

  subscribe(listener: ViewerStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private saveSourceFor(location: DocumentLocation, editedText: string | undefined): SaveSource {
    const untitled = this.untitledDocuments.get(location.canonicalKey);
    if (untitled)
      return { kind: 'text', text: editedText ?? untitled.text, fileName: untitled.location.fileName };
    if (editedText === undefined) return { kind: 'copy', path: location.displayPath };
    const document = this.openedDocuments.get(location.canonicalKey);
    const text = document
      ? withDocumentLineBreaks(editedText, document.lineEnding, document.text)
      : editedText;
    return { kind: 'text', text, fileName: location.fileName };
  }

  private alreadyOpenDocument(path: string): OpenedDocument | undefined {
    const pathKey = path.toLowerCase();
    const tab = this.state.tabStrip
      .tabs()
      .find(
        (candidate) => candidate.location.displayPath === path || candidate.location.canonicalKey === pathKey,
      );
    return tab ? this.openedDocuments.get(tab.location.canonicalKey) : undefined;
  }

  private replaceState(state: ViewerState): void {
    this.state = state;
    const shown = this.currentState();
    for (const listener of this.listeners) listener(shown);
  }
}
