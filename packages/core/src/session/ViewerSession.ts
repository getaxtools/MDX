import {
  DocumentOpenError,
  untitledLocation,
  type AppStatePort,
  type DocumentFilePort,
  type DocumentLocation,
  type OpenedDocument,
  type PathStatus,
  type SaveSource,
} from '@mdx/platform';
import { withDocumentLineBreaks } from '../documents/lineEndings';
import { ExplorerFolders } from '../explorer/ExplorerFolders';
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

const EMPTY_STATE: ViewerState = {
  tabStrip: TabStrip.empty(),
  recentFiles: RecentFilesList.empty(),
  favourites: FavouritesList.empty(),
  explorerFolders: ExplorerFolders.empty(),
  viewSettings: DEFAULT_VIEW_SETTINGS,
};

export class ViewerSession {
  private state: ViewerState = EMPTY_STATE;
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
      explorerFolders: restored.explorerFolders,
      viewSettings: restored.viewSettings,
    });
    return { wasReset: restored.wasReset };
  }

  /** Forgets every tab, recent file, favourite, opened folder and view setting, as on a first start. */
  clearAllData(): void {
    this.openedDocuments.clear();
    this.untitledDocuments.clear();
    this.chosenEncodings.clear();
    this.untitledCount = 0;
    this.replaceState(EMPTY_STATE);
  }

  async save(): Promise<void> {
    await this.dependencies.appState.save(toPersistedAppState(this.state));
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

  updateViewSettings(change: (viewSettings: ViewSettings) => ViewSettings): void {
    this.replaceState({ ...this.state, viewSettings: change(this.state.viewSettings) });
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
    for (const listener of this.listeners) listener(state);
  }
}
