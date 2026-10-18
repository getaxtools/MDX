import {
  measureDocument,
  type DocumentStatistics,
  type Favourite,
  type RecentFile,
  type ViewerSession,
  type ViewerState,
} from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import {
  DocumentOpenError,
  type AppMenuPort,
  type DocumentLinksPort,
  type FolderListing,
  type FolderPort,
  type DocumentPrinterPort,
  type DocumentResourcesPort,
  type DocumentWatcherPort,
  type DocumentRequestsPort,
  type LineEnding,
  type OpenedDocument,
  type PathStatus,
} from '@mdx/platform';
import type { MarkdownRenderer, OutlineEntry } from '@mdx/renderer';
import type { DocumentLink } from '../document-view/DocumentLink';
import { applySessionCommand } from './applySessionCommand';
import { LiveReload } from './LiveReload';
import { commandForMenuItem, type ViewerCommand } from './viewerCommands';

export const STATE_SAVE_DELAY_MS = 500;
const SCROLL_RATIO_PRECISION = 0.001;
const EMPTY_FOLDER_LISTING: FolderListing = { folders: [], documents: [] };

export interface ViewerControllerDependencies {
  readonly session: ViewerSession;
  readonly requests: DocumentRequestsPort;
  readonly renderer: MarkdownRenderer;
  readonly translator: Translator;
  readonly menu?: AppMenuPort;
  readonly watcher?: DocumentWatcherPort;
  readonly resources?: DocumentResourcesPort;
  readonly printer?: DocumentPrinterPort;
  readonly links?: DocumentLinksPort;
  readonly folders?: FolderPort;
}

export interface RenderedActiveDocument {
  readonly canonicalKey: string;
  readonly fileName: string;
  readonly html: string;
  readonly outline: readonly OutlineEntry[];
  readonly statistics: DocumentStatistics;
  readonly encoding: string;
  readonly lineEnding: LineEnding;
  readonly scrollRatio: number;
  readonly frontMatter?: string;
  readonly source: string;
}

export interface ViewerSnapshot {
  readonly viewer: ViewerState;
  readonly activeDocument?: RenderedActiveDocument;
  readonly notice?: string;
  readonly openDialog?: ViewerDialog;
  readonly findRequest?: number;
  readonly externalLinkRequest?: string;
  readonly isSourceView?: boolean;
  readonly pathStatuses: ReadonlyMap<string, PathStatus>;
}

export type ViewerDialog = 'about' | 'keyboardShortcuts';

const DIALOGS_BY_COMMAND: Partial<Record<ViewerCommand['kind'], ViewerDialog>> = {
  showAbout: 'about',
  showKeyboardShortcuts: 'keyboardShortcuts',
};

type SnapshotListener = (snapshot: ViewerSnapshot) => void;

export class ViewerController {
  private snapshot: ViewerSnapshot;
  private readonly listeners = new Set<SnapshotListener>();
  private readonly stopActions: (() => void)[] = [];
  private pendingSave: ReturnType<typeof setTimeout> | undefined;
  private renderedDocument: OpenedDocument | undefined;
  private activeDocument: RenderedActiveDocument | undefined;
  private openDialog: ViewerDialog | undefined;
  private findRequest = 0;
  private externalLinkRequest: string | undefined;
  private isSourceView = false;
  private shownViewSettings: ViewerState['viewSettings'] | undefined;
  private pathStatuses: ReadonlyMap<string, PathStatus> = new Map();
  private checkedLocationKeys = '';
  private readonly liveReload: LiveReload | undefined;

  constructor(private readonly dependencies: ViewerControllerDependencies) {
    this.snapshot = { viewer: dependencies.session.currentState(), pathStatuses: this.pathStatuses };
    this.liveReload = dependencies.watcher
      ? new LiveReload(dependencies.watcher, dependencies.session, () =>
          this.refreshPathStatuses({ isForced: true }),
        )
      : undefined;
  }

  async start(): Promise<void> {
    const { session, requests } = this.dependencies;
    const { wasReset } = await session.restore();
    this.publish(this.composeSnapshot(undefined));
    if (wasReset) this.showNotice('errors.appState.reset');
    this.stopActions.push(session.subscribe(() => this.handleSessionChange()));
    this.stopActions.push(requests.onDocumentsRequested((paths) => void this.openDocuments(paths)));
    this.listenToMenu();
    this.refreshPathStatuses();
    if (this.liveReload) this.stopActions.push(this.liveReload.start());
    await this.openDocuments(await requests.takeStartupDocuments());
    await this.refreshActiveDocument();
  }

  stop(): void {
    for (const stopAction of this.stopActions.splice(0)) stopAction();
    clearTimeout(this.pendingSave);
  }

  async saveNow(): Promise<void> {
    clearTimeout(this.pendingSave);
    this.pendingSave = undefined;
    await this.dependencies.session.save();
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async openDocuments(paths: readonly string[]): Promise<void> {
    for (const path of paths) await this.openDocument(path);
  }

  async openFavourite(favourite: Favourite): Promise<void> {
    if (favourite.kind === 'file') await this.openDocument(favourite.location.displayPath);
  }

  async openRecentFile(recentFile: RecentFile): Promise<void> {
    await this.openDocument(recentFile.location.displayPath);
  }

  activateTab(canonicalKey: string): void {
    this.dependencies.session.updateTabs((tabStrip) => tabStrip.activate(canonicalKey));
  }

  closeTab(canonicalKey: string): void {
    this.dependencies.session.updateTabs((tabStrip) => tabStrip.close(canonicalKey));
  }

  async openLink(link: DocumentLink): Promise<void> {
    if (link.kind === 'external') {
      this.externalLinkRequest = link.href;
      this.publish(this.composeSnapshot(this.snapshot.notice));
      return;
    }
    const { links, session } = this.dependencies;
    const documentPath = session.currentState().tabStrip.activeTab()?.location.displayPath;
    if (!links || documentPath === undefined) return;
    try {
      await this.openDocuments([await links.resolveDocumentLink(documentPath, link.href)]);
    } catch (error) {
      this.showOpenFailure(error, link.href);
    }
  }

  answerExternalLink(shouldOpen: boolean): void {
    const url = this.externalLinkRequest;
    this.externalLinkRequest = undefined;
    this.publish(this.composeSnapshot(this.snapshot.notice));
    if (shouldOpen && url !== undefined) void this.dependencies.links?.openExternalLink(url);
  }

  /** Remembers how far the active document is scrolled, so the tab reopens at the same place. */
  rememberScrollPosition(scrollRatio: number): void {
    const activeTab = this.dependencies.session.currentState().tabStrip.activeTab();
    if (!activeTab || Math.abs(activeTab.scrollRatio - scrollRatio) < SCROLL_RATIO_PRECISION) return;
    this.dependencies.session.updateTabs((tabStrip) =>
      tabStrip.updateScrollRatio(activeTab.location.canonicalKey, scrollRatio),
    );
  }

  closeFind(): void {
    this.findRequest = 0;
    this.publish(this.composeSnapshot(this.snapshot.notice));
  }

  closeDialog(): void {
    this.openDialog = undefined;
    this.publish(this.composeSnapshot(this.snapshot.notice));
  }

  async execute(command: ViewerCommand): Promise<void> {
    if (applySessionCommand(this.dependencies.session, command)) return;
    const dialog = DIALOGS_BY_COMMAND[command.kind];
    if (dialog) {
      this.openDialog = dialog;
      this.publish(this.composeSnapshot(this.snapshot.notice));
      return;
    }
    await this.commandHandlers[command.kind]?.();
  }

  private readonly commandHandlers: Partial<Record<ViewerCommand['kind'], () => Promise<void> | void>> = {
    openDocuments: async () => this.openDocuments(await this.dependencies.requests.pickDocuments()),
    openFolder: () => this.addFolderFavourite(),
    toggleFavourite: () => this.toggleActiveFavourite(),
    print: () => {
      if (this.activeDocument) this.dependencies.printer?.printActiveDocument();
    },
    showFind: () => {
      this.findRequest += 1;
      this.publish(this.composeSnapshot(this.snapshot.notice));
    },
    toggleSourceView: () => {
      this.isSourceView = !this.isSourceView;
      this.publish(this.composeSnapshot(this.snapshot.notice));
    },
  };

  private listenToMenu(): void {
    const { menu } = this.dependencies;
    if (!menu) return;
    this.stopActions.push(
      menu.onMenuCommand((menuItemId) => {
        const command = commandForMenuItem(menuItemId);
        if (command) void this.execute(command);
      }),
    );
    this.showViewStateInMenu();
  }

  private showViewStateInMenu(): void {
    const { viewSettings } = this.dependencies.session.currentState();
    if (!this.dependencies.menu || viewSettings === this.shownViewSettings) return;
    this.shownViewSettings = viewSettings;
    const { theme, readingWidth, isSidebarVisible, isOutlineVisible } = viewSettings;
    void this.dependencies.menu.showViewState({ theme, readingWidth, isSidebarVisible, isOutlineVisible });
  }

  private refreshPathStatuses({ isForced = false } = {}): void {
    const { session } = this.dependencies;
    const { tabStrip, favourites, recentFiles } = session.currentState();
    const entries = [...tabStrip.tabs(), ...favourites.favourites(), ...recentFiles.entries()];
    const locations = entries.map((entry) => entry.location);
    const locationKeys = JSON.stringify(locations.map((location) => location.canonicalKey));
    if (!isForced && locationKeys === this.checkedLocationKeys) return;
    this.checkedLocationKeys = locationKeys;
    void session.checkPathStatuses(locations).then((statuses) => {
      this.pathStatuses = statuses;
      this.publish(this.composeSnapshot(this.snapshot.notice));
    });
  }

  /** The subfolders and Markdown documents in a favourite folder; empty when the folder cannot be read. */
  async listFolderContents(folderPath: string): Promise<FolderListing> {
    try {
      return (await this.dependencies.folders?.listFolderContents(folderPath)) ?? EMPTY_FOLDER_LISTING;
    } catch {
      return EMPTY_FOLDER_LISTING;
    }
  }

  private async addFolderFavourite(): Promise<void> {
    const folder = await this.dependencies.folders?.pickFolder();
    if (!folder) return;
    this.dependencies.session.updateFavourites((favourites) =>
      favourites.isFavourite(folder.canonicalKey) ? favourites : favourites.add(folder, 'folder'),
    );
  }

  private toggleActiveFavourite(): void {
    const activeTab = this.dependencies.session.currentState().tabStrip.activeTab();
    if (!activeTab) return;
    this.dependencies.session.updateFavourites((favourites) => favourites.toggle(activeTab.location, 'file'));
  }

  showNotice(key: MessageKey, values?: Readonly<Record<string, string>>): void {
    this.publish(this.composeSnapshot(this.dependencies.translator.translate(key, values)));
  }

  dismissNotice(): void {
    this.publish(this.composeSnapshot(undefined));
  }

  private async openDocument(path: string): Promise<void> {
    try {
      await this.dependencies.session.openDocument(path);
    } catch (error) {
      this.showOpenFailure(error, path);
    }
  }

  private showOpenFailure(error: unknown, path: string): void {
    const key = error instanceof DocumentOpenError ? error.messageKey : 'errors.document.unreadable';
    this.showNotice(key, { path });
  }

  private handleSessionChange(): void {
    this.publish(this.composeSnapshot(this.snapshot.notice));
    this.showViewStateInMenu();
    this.refreshPathStatuses();
    this.liveReload?.watchOpenTabs();
    this.scheduleSave();
    void this.refreshActiveDocument();
  }

  private scheduleSave(): void {
    clearTimeout(this.pendingSave);
    this.pendingSave = setTimeout(() => void this.dependencies.session.save(), STATE_SAVE_DELAY_MS);
  }

  private async refreshActiveDocument(): Promise<void> {
    const document = await this.loadActiveDocument();
    if (document === this.renderedDocument) return;
    this.renderedDocument = document;
    this.activeDocument = document ? this.render(document) : undefined;
    this.publish(this.composeSnapshot(this.snapshot.notice));
  }

  private async loadActiveDocument(): Promise<OpenedDocument | undefined> {
    const activeTab = this.dependencies.session.currentState().tabStrip.activeTab();
    if (!activeTab) return undefined;
    try {
      return await this.dependencies.session.loadActiveDocument();
    } catch (error) {
      this.showOpenFailure(error, activeTab.location.displayPath);
      return undefined;
    }
  }

  private render(document: OpenedDocument): RenderedActiveDocument {
    const { resources } = this.dependencies;
    const { html, outline, frontMatter } = this.dependencies.renderer.render(document.text, {
      resolveResourceUrl: (source) => resources?.imageUrl(document.location.displayPath, source),
    });
    return {
      canonicalKey: document.location.canonicalKey,
      fileName: document.location.fileName,
      html,
      outline,
      statistics: measureDocument(document.text, this.dependencies.translator.locale),
      encoding: document.encoding,
      lineEnding: document.lineEnding,
      source: document.text,
      scrollRatio: this.dependencies.session.currentState().tabStrip.activeTab()?.scrollRatio ?? 0,
      ...(frontMatter === undefined ? {} : { frontMatter }),
    };
  }

  private composeSnapshot(notice: string | undefined): ViewerSnapshot {
    return {
      viewer: this.dependencies.session.currentState(),
      pathStatuses: this.pathStatuses,
      ...(this.activeDocument ? { activeDocument: this.activeDocument } : {}),
      ...(notice === undefined ? {} : { notice }),
      ...(this.openDialog === undefined ? {} : { openDialog: this.openDialog }),
      ...(this.findRequest > 0 ? { findRequest: this.findRequest } : {}),
      ...(this.externalLinkRequest === undefined ? {} : { externalLinkRequest: this.externalLinkRequest }),
      ...(this.isSourceView ? { isSourceView: true } : {}),
    };
  }

  private publish(snapshot: ViewerSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
