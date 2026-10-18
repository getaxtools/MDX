import type { AppStatePort, DocumentFilePort, OpenedDocument } from '@mdx/platform';
import { FavouritesList } from '../favourites/FavouritesList';
import { RecentFilesList } from '../recent-files/RecentFilesList';
import { TabStrip } from '../tabs/TabStrip';
import { restoreAppState, toPersistedAppState } from './persistedAppState';

export interface ViewerSessionDependencies {
  readonly documentFiles: DocumentFilePort;
  readonly appState: AppStatePort;
  readonly now: () => number;
}

export interface ViewerState {
  readonly tabStrip: TabStrip;
  readonly recentFiles: RecentFilesList;
  readonly favourites: FavouritesList;
}

type ViewerStateListener = (state: ViewerState) => void;

export class ViewerSession {
  private state: ViewerState = {
    tabStrip: TabStrip.empty(),
    recentFiles: RecentFilesList.empty(),
    favourites: FavouritesList.empty(),
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
    });
    return { wasReset: restored.wasReset };
  }

  async save(): Promise<void> {
    const { tabStrip, recentFiles, favourites } = this.state;
    await this.dependencies.appState.save(toPersistedAppState(tabStrip, recentFiles, favourites));
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

  subscribe(listener: ViewerStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private replaceState(state: ViewerState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
