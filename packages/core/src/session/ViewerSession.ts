import type {
  AppStatePort,
  DocumentFilePort,
  DocumentLocation,
  OpenedDocument,
  PathStatus,
} from '@mdx/platform';
import { FavouritesList } from '../favourites/FavouritesList';
import { RecentFilesList } from '../recent-files/RecentFilesList';
import { TabStrip } from '../tabs/TabStrip';
import { DEFAULT_VIEW_SETTINGS, type ViewSettings } from '../view/ViewSettings';
import { restoreAppState, toPersistedAppState, type ViewerState } from './persistedAppState';

export interface ViewerSessionDependencies {
  readonly documentFiles: DocumentFilePort;
  readonly appState: AppStatePort;
  readonly now: () => number;
}

export type { ViewerState } from './persistedAppState';

type ViewerStateListener = (state: ViewerState) => void;

export class ViewerSession {
  private state: ViewerState = {
    tabStrip: TabStrip.empty(),
    recentFiles: RecentFilesList.empty(),
    favourites: FavouritesList.empty(),
    viewSettings: DEFAULT_VIEW_SETTINGS,
  };
  private readonly openedDocuments = new Map<string, OpenedDocument>();
  private readonly listeners = new Set<ViewerStateListener>();

  constructor(private readonly dependencies: ViewerSessionDependencies) {}

  currentState(): ViewerState {
    return this.state;
  }

  async restore(): Promise<{ wasReset: boolean }> {
    const restored = restoreAppState(await this.dependencies.appState.load());
    this.openedDocuments.clear();
    this.replaceState({
      tabStrip: restored.tabStrip,
      recentFiles: restored.recentFiles,
      favourites: restored.favourites,
      viewSettings: restored.viewSettings,
    });
    return { wasReset: restored.wasReset };
  }

  async save(): Promise<void> {
    await this.dependencies.appState.save(toPersistedAppState(this.state));
  }

  async openDocument(path: string): Promise<OpenedDocument> {
    const document = await this.dependencies.documentFiles.open(path);
    this.openedDocuments.set(document.location.canonicalKey, document);
    this.replaceState({
      ...this.state,
      tabStrip: this.state.tabStrip.openOrFocus(document.location),
      recentFiles: this.state.recentFiles.add(document.location, this.dependencies.now()),
    });
    return document;
  }

  async loadActiveDocument(): Promise<OpenedDocument | undefined> {
    const activeTab = this.state.tabStrip.activeTab();
    if (!activeTab) return undefined;
    return (
      this.openedDocuments.get(activeTab.location.canonicalKey) ??
      this.openDocument(activeTab.location.displayPath)
    );
  }

  /** Re-reads open documents that changed on disk, without changing tabs or recent files. */
  async reloadDocuments(displayPaths: readonly string[]): Promise<void> {
    const changedTabs = this.state.tabStrip
      .tabs()
      .filter((tab) => displayPaths.includes(tab.location.displayPath));
    if (changedTabs.length === 0) return;
    for (const { location } of changedTabs) {
      try {
        this.openedDocuments.set(
          location.canonicalKey,
          await this.dependencies.documentFiles.open(location.displayPath),
        );
      } catch {
        this.openedDocuments.delete(location.canonicalKey);
      }
    }
    this.replaceState({ ...this.state });
  }

  openedDocument(canonicalKey: string): OpenedDocument | undefined {
    return this.openedDocuments.get(canonicalKey);
  }

  updateTabs(change: (tabStrip: TabStrip) => TabStrip): void {
    const tabStrip = change(this.state.tabStrip);
    for (const canonicalKey of this.openedDocuments.keys()) {
      if (!tabStrip.isOpen(canonicalKey)) this.openedDocuments.delete(canonicalKey);
    }
    this.replaceState({ ...this.state, tabStrip });
  }

  updateRecentFiles(change: (recentFiles: RecentFilesList) => RecentFilesList): void {
    this.replaceState({ ...this.state, recentFiles: change(this.state.recentFiles) });
  }

  updateFavourites(change: (favourites: FavouritesList) => FavouritesList): void {
    this.replaceState({ ...this.state, favourites: change(this.state.favourites) });
  }

  checkPathStatuses(locations: readonly DocumentLocation[]): Promise<ReadonlyMap<string, PathStatus>> {
    return this.dependencies.documentFiles.checkPathStatuses(locations);
  }

  updateViewSettings(change: (viewSettings: ViewSettings) => ViewSettings): void {
    this.replaceState({ ...this.state, viewSettings: change(this.state.viewSettings) });
  }

  subscribe(listener: ViewerStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private replaceState(state: ViewerState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
