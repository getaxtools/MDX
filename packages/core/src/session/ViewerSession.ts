import {
  untitledLocation,
  type AppStatePort,
  type DocumentFilePort,
  type DocumentLocation,
  type OpenedDocument,
  type PathStatus,
  type SaveSource,
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
  private readonly untitledDocuments = new Map<string, OpenedDocument>();
  /** Encodings the user chose with Reopen with Encoding, kept for live reload. */
  private readonly chosenEncodings = new Map<string, string>();
  private untitledCount = 0;
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

  /** Saves an open document where the user chooses and shows the saved file in its tab. */
  async saveDocumentAs(canonicalKey: string): Promise<DocumentLocation | undefined> {
    const tab = this.state.tabStrip
      .tabs()
      .find((candidate) => candidate.location.canonicalKey === canonicalKey);
    if (!tab) return undefined;
    const untitled = this.untitledDocuments.get(canonicalKey);
    const source: SaveSource = untitled
      ? { kind: 'text', text: untitled.text, fileName: untitled.location.fileName }
      : { kind: 'copy', path: tab.location.displayPath };
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

  async loadActiveDocument(): Promise<OpenedDocument | undefined> {
    const activeTab = this.state.tabStrip.activeTab();
    if (!activeTab) return undefined;
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
      .filter((tab) => displayPaths.includes(tab.location.displayPath));
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
