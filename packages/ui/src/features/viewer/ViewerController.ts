import {
  measureDocument,
  type DocumentStatistics,
  type Favourite,
  type RecentFile,
  type ViewerSession,
  type ViewerState,
  parseFavouritesFile,
  toFavouritesFile,
} from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import {
  DocumentOpenError,
  isUntitledLocation,
  type AppMenuPort,
  type DocumentLinksPort,
  type FavouritesFilePort,
  type FolderListing,
  type FolderPort,
  type FolderWatcherPort,
  type DocumentPrinterPort,
  type DocumentResourcesPort,
  type DocumentWatcherPort,
  type DocumentLocation,
  type DocumentRequestsPort,
  type LineEnding,
  type OpenedDocument,
  type PathStatus,
} from '@mdx/platform';
import type { MarkdownRenderer, OutlineEntry } from '@mdx/renderer';
import type { DocumentLink } from '../document-view/DocumentLink';
import { DocumentEditing } from '../editing/DocumentEditing';
import { EditingActions } from '../editing/EditingActions';
import type { EditorRequest } from '../editing/editingCommands';
import { ExplorerFolderActions } from '../explorer/ExplorerFolderActions';
import { FolderRefresh } from '../folder-tree/FolderRefresh';
import {
  DocumentSaving,
  type UnsavedChangesChoice,
  type UnsavedChangesRequest,
} from '../saving/DocumentSaving';
import { isTabCommand } from '../tabs/tabCommands';
import { applySessionCommand } from './applySessionCommand';
import { LiveReload } from './LiveReload';
import { commandForMenuItem, type ViewerCommand } from './viewerCommands';

export const STATE_SAVE_DELAY_MS = 500;
export const MAX_RECENT_MENU_ENTRIES = 10;
const SCROLL_RATIO_PRECISION = 0.001;

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
  readonly folderWatcher?: FolderWatcherPort;
  readonly favouritesFile?: FavouritesFilePort;
}

export interface RenderedActiveDocument {
  readonly canonicalKey: string;
  readonly displayPath: string;
  readonly fileName: string;
  readonly isUntitled: boolean;
  readonly html: string;
  readonly outline: readonly OutlineEntry[];
  readonly statistics: DocumentStatistics;
  readonly encoding: string;
  readonly lineEnding: LineEnding;
  readonly scrollRatio: number;
  readonly frontMatter?: string;
  /** The text shown, which is the edited text while the document has unsaved changes. */
  readonly source: string;
}

export interface ViewerSnapshot {
  readonly viewer: ViewerState;
  readonly activeDocument?: RenderedActiveDocument;
  readonly notice?: string;
  readonly noticeActions?: readonly NoticeAction[];
  readonly openDialog?: ViewerDialog;
  readonly findRequest?: number;
  readonly externalLinkRequest?: string;
  readonly isSourceView?: boolean;
  readonly unsavedChanges?: UnsavedChangesRequest;
  readonly pathStatuses: ReadonlyMap<string, PathStatus>;
  /** How often each shown folder changed on disk, so its listing reloads when the count goes up. */
  readonly folderRevisions: ReadonlyMap<string, number>;
  readonly isActiveDocumentEditing?: boolean;
  /** Open documents whose edited text is not saved yet. */
  readonly unsavedDocumentKeys: ReadonlySet<string>;
  readonly editorRequest?: EditorRequest;
}

/** A button in the notice bar that runs a command, such as Locate for a file that has moved. */
export interface NoticeAction {
  readonly label: string;
  readonly command: ViewerCommand;
}

export type ViewerDialog = 'about' | 'keyboardShortcuts' | 'pasteTable' | 'commandPalette';

const DIALOGS_BY_COMMAND: Partial<Record<ViewerCommand['kind'], ViewerDialog>> = {
  showAbout: 'about',
  showKeyboardShortcuts: 'keyboardShortcuts',
  showPasteTable: 'pasteTable',
  showCommandPalette: 'commandPalette',
};

type SnapshotListener = (snapshot: ViewerSnapshot) => void;

type CommandHandlers = {
  readonly [Kind in ViewerCommand['kind']]?: (
    command: Extract<ViewerCommand, { kind: Kind }>,
  ) => Promise<void> | void;
};

export class ViewerController {
  private snapshot: ViewerSnapshot;
  private readonly listeners = new Set<SnapshotListener>();
  private readonly stopActions: (() => void)[] = [];
  private pendingSave: ReturnType<typeof setTimeout> | undefined;
  private renderedDocument: OpenedDocument | undefined;
  private renderedText: string | undefined;
  private activeDocument: RenderedActiveDocument | undefined;
  private openDialog: ViewerDialog | undefined;
  private noticeActions: readonly NoticeAction[] = [];
  private findRequest = 0;
  private externalLinkRequest: string | undefined;
  private isSourceView = false;
  private shownMenuViewState = '';
  private shownRecentFiles: ViewerState['recentFiles'] | undefined;
  private pathStatuses: ReadonlyMap<string, PathStatus> = new Map();
  private checkedLocationKeys = '';
  private readonly liveReload: LiveReload | undefined;
  private readonly folderRefresh: FolderRefresh;
  private readonly explorerFolderActions: ExplorerFolderActions;
  private readonly saving: DocumentSaving;
  private readonly editing = new DocumentEditing();
  private readonly editingActions: EditingActions;

  constructor(private readonly dependencies: ViewerControllerDependencies) {
    this.snapshot = {
      viewer: dependencies.session.currentState(),
      pathStatuses: this.pathStatuses,
      folderRevisions: new Map(),
      unsavedDocumentKeys: new Set(),
    };
    this.saving = new DocumentSaving(dependencies.session, this.editing, {
      onChange: () => this.publish(this.composeSnapshot(this.snapshot.notice)),
      onSaveFailed: (fileName) => this.showNotice('errors.document.saveFailed', { path: fileName }),
      onChangedOnDisk: (location) => this.showChangedOnDiskNotice(location, 'errors.document.changedOnDisk'),
      onCannotSaveInPlace: (location, failure) =>
        this.showNotice(`errors.document.${failure}`, { path: location.fileName }, [
          {
            label: dependencies.translator.translate('menu.file.saveAs'),
            command: { kind: 'saveDocumentAs' },
          },
        ]),
    });
    this.editingActions = new EditingActions(dependencies.session, this.editing, {
      onChange: () => {
        this.publish(this.composeSnapshot(this.snapshot.notice));
        void this.refreshActiveDocument();
      },
      onConflict: (location) => this.showChangedOnDiskNotice(location, 'editing.conflict.message'),
    });
    this.liveReload = dependencies.watcher
      ? new LiveReload(dependencies.watcher, dependencies.session, (changedKeys) => {
          this.refreshPathStatuses({ isForced: true });
          this.editingActions.handleReloadedDocuments(changedKeys);
        })
      : undefined;
    this.explorerFolderActions = new ExplorerFolderActions(dependencies.session, dependencies.folders);
    this.folderRefresh = new FolderRefresh(dependencies.folderWatcher, () =>
      this.publish(this.composeSnapshot(this.snapshot.notice)),
    );
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
    this.stopActions.push(this.folderRefresh.start());
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
    const { canonicalKey, displayPath } = recentFile.location;
    try {
      await this.dependencies.session.openDocument(displayPath);
    } catch (error) {
      this.showOpenFailure(error, displayPath, this.recoveryActionsFor(error, canonicalKey));
    }
  }

  /** Runs a notice button's command and hides the notice. */
  runNoticeAction(action: NoticeAction): Promise<void> {
    this.dismissNotice();
    return this.execute(action.command);
  }

  private recoveryActionsFor(error: unknown, canonicalKey: string): NoticeAction[] {
    const hasMoved =
      error instanceof DocumentOpenError && (error.failure === 'notFound' || error.failure === 'unreachable');
    if (!hasMoved) return [];
    const { translator } = this.dependencies;
    return [
      {
        label: translator.translate('recentFiles.locate'),
        command: { kind: 'locateRecentFile', canonicalKey },
      },
      {
        label: translator.translate('recentFiles.remove'),
        command: { kind: 'removeRecentFile', canonicalKey },
      },
    ];
  }

  private async reopenActiveDocumentWithEncoding(encoding: string | undefined): Promise<void> {
    const { session } = this.dependencies;
    const location = session.currentState().tabStrip.activeTab()?.location;
    if (!location || isUntitledLocation(location)) return;
    try {
      await session.reopenWithEncoding(location.canonicalKey, encoding);
    } catch {
      this.showNotice('errors.document.reopenFailed', { path: location.displayPath });
    }
  }

  private async locateRecentFile(canonicalKey: string): Promise<void> {
    const { requests, session } = this.dependencies;
    const [path] = await requests.pickDocuments();
    if (path === undefined) return;
    let located: OpenedDocument;
    try {
      located = await session.openDocument(path);
    } catch (error) {
      this.showOpenFailure(error, path);
      return;
    }
    session.updateTabs((tabStrip) => tabStrip.replace(canonicalKey, located.location));
    session.updateRecentFiles((recentFiles) => recentFiles.relocate(canonicalKey, located.location));
    session.updateFavourites((favourites) => favourites.relocate(canonicalKey, located.location));
  }

  activateTab(canonicalKey: string): void {
    this.dependencies.session.updateTabs((tabStrip) => tabStrip.activate(canonicalKey));
  }

  closeTab(canonicalKey: string): void {
    this.saving.runTabCommand({ kind: 'closeTab', canonicalKey });
  }

  /** Opens converted Markdown, such as a pasted table, as a new document that is not saved yet. */
  openAsNewDocument(markdown: string): void {
    const { session, translator } = this.dependencies;
    this.openDialog = undefined;
    session.openUntitledDocument(markdown, (number) =>
      translator.translate('document.untitledName', { number }),
    );
  }

  /** Sanitized HTML for Markdown that is not a document yet, such as a converted table. */
  renderPreview(markdown: string): string {
    return this.dependencies.renderer.render(markdown, { resolveResourceUrl: () => undefined }).html;
  }

  hasUnsavedDocuments(): boolean {
    return this.saving.hasUnsavedDocuments();
  }

  /** Asks about new documents before the window closes; true when it may close. */
  confirmClosingWindow(): Promise<boolean> {
    return this.saving.confirmClosingWindow();
  }

  answerUnsavedChanges(choice: UnsavedChangesChoice): Promise<void> {
    return this.saving.answer(choice);
  }

  async openLink(link: DocumentLink): Promise<void> {
    if (link.kind === 'external') {
      this.externalLinkRequest = link.href;
      this.publish(this.composeSnapshot(this.snapshot.notice));
      return;
    }
    const { links, session } = this.dependencies;
    const activeLocation = session.currentState().tabStrip.activeTab()?.location;
    if (!links || !activeLocation || isUntitledLocation(activeLocation)) return;
    const documentPath = activeLocation.displayPath;
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
    if (isTabCommand(command)) {
      this.saving.runTabCommand(command);
      return;
    }
    if (applySessionCommand(this.dependencies.session, command)) return;
    const dialog = DIALOGS_BY_COMMAND[command.kind];
    if (dialog) {
      this.openDialog = dialog;
      this.publish(this.composeSnapshot(this.snapshot.notice));
      return;
    }
    const handler = this.commandHandlers[command.kind] as ((command: ViewerCommand) => unknown) | undefined;
    await handler?.(command);
  }

  private readonly commandHandlers: CommandHandlers = {
    openDocuments: async () => this.openDocuments(await this.dependencies.requests.pickDocuments()),
    openFolder: () => this.explorerFolderActions.openFolder(),
    addFolderFavourite: () => this.explorerFolderActions.addFolderFavourite(),
    addExplorerFolderToFavourites: ({ canonicalKey }) =>
      this.explorerFolderActions.addExplorerFolderToFavourites(canonicalKey),
    locateRecentFile: ({ canonicalKey }) => this.locateRecentFile(canonicalKey),
    reopenWithEncoding: ({ encoding }) => this.reopenActiveDocumentWithEncoding(encoding),
    saveDocument: () => this.saving.saveActive(),
    saveDocumentAs: () => this.saving.saveActiveAs(),
    saveAllDocuments: () => this.saving.saveAll(),
    toggleFavourite: () => this.toggleActiveFavourite(),
    exportFavourites: () => this.exportFavourites(),
    importFavourites: () => this.importFavourites(),
    refreshFolders: () => this.folderRefresh.refreshShownFolders(),
    toggleEditing: () => this.editingActions.toggleActiveDocument(),
    runEditorCommand: ({ command }) => {
      this.editingActions.runEditorCommand(command);
    },
    revertDocument: () => this.editingActions.revertActiveDocument(),
    reloadFromDisk: ({ canonicalKey }) => this.editingActions.reloadFromDisk(canonicalKey),
    overwriteChangesOnDisk: ({ canonicalKey }) => this.saving.overwriteChangesOnDisk(canonicalKey),
    print: () => {
      if (this.activeDocument) this.dependencies.printer?.printActiveDocument();
    },
    showFind: () => {
      if (this.editingActions.runEditorCommand('find')) return;
      this.findRequest += 1;
      this.publish(this.composeSnapshot(this.snapshot.notice));
    },
    toggleSourceView: () => {
      this.isSourceView = !this.isSourceView;
      this.publish(this.composeSnapshot(this.snapshot.notice));
      this.showViewStateInMenu();
    },
    openRecentFileAt: (command) => {
      const recentFile = this.dependencies.session.currentState().recentFiles.entries()[command.index];
      return recentFile ? this.openRecentFile(recentFile) : undefined;
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
    this.showRecentFilesInMenu();
  }

  private showViewStateInMenu(): void {
    const { menu, session } = this.dependencies;
    if (!menu) return;
    const { theme, readingWidth, isSidebarVisible, isOutlineVisible, isStatusBarVisible } =
      session.currentState().viewSettings;
    const state = {
      theme,
      readingWidth,
      isSidebarVisible,
      isOutlineVisible,
      isStatusBarVisible,
      isSourceView: this.isSourceView,
    };
    const stateKey = JSON.stringify(state);
    if (stateKey === this.shownMenuViewState) return;
    this.shownMenuViewState = stateKey;
    void menu.showViewState(state);
  }

  private showRecentFilesInMenu(): void {
    const { menu, session } = this.dependencies;
    const { recentFiles } = session.currentState();
    if (!menu || recentFiles === this.shownRecentFiles) return;
    this.shownRecentFiles = recentFiles;
    const displayPaths = recentFiles.entries().map((recentFile) => recentFile.location.displayPath);
    void menu.showRecentFiles(displayPaths.slice(0, MAX_RECENT_MENU_ENTRIES));
  }

  private refreshPathStatuses({ isForced = false } = {}): void {
    const { session } = this.dependencies;
    const { tabStrip, favourites, recentFiles, explorerFolders } = session.currentState();
    const entries = [...tabStrip.tabs(), ...favourites.favourites(), ...recentFiles.entries()];
    const locations = [...entries.map((entry) => entry.location), ...explorerFolders.folders()].filter(
      (location) => !isUntitledLocation(location),
    );
    const locationKeys = JSON.stringify(locations.map((location) => location.canonicalKey));
    if (!isForced && locationKeys === this.checkedLocationKeys) return;
    this.checkedLocationKeys = locationKeys;
    void session.checkPathStatuses(locations).then((statuses) => {
      this.pathStatuses = statuses;
      this.publish(this.composeSnapshot(this.snapshot.notice));
    });
  }

  /** The subfolders and Markdown documents in a folder; empty when the folder cannot be read. */
  listFolderContents(folderPath: string): Promise<FolderListing> {
    return this.explorerFolderActions.listFolderContents(folderPath);
  }

  /** Documents to offer in quick open: open, recent and favourite ones first, then those in folders. */
  quickOpenDocuments(): Promise<DocumentLocation[]> {
    return this.explorerFolderActions.quickOpenDocuments();
  }

  /** Records the source editor's text for a document; the window shows when it has unsaved changes. */
  updateEditedText(canonicalKey: string, text: string): void {
    this.editingActions.updateText(canonicalKey, text);
  }

  /** Keeps a folder's listing current while it is shown; call the returned function when it is hidden. */
  showFolder(folderPath: string): () => void {
    return this.folderRefresh.showFolder(folderPath);
  }

  private async exportFavourites(): Promise<void> {
    const { favouritesFile, session, translator } = this.dependencies;
    if (!favouritesFile) return;
    try {
      const savedPath = await favouritesFile.exportFavourites(
        toFavouritesFile(session.currentState().favourites),
        translator.translate('favourites.file.defaultName'),
      );
      if (savedPath !== undefined) this.showNotice('favourites.file.exported', { path: savedPath });
    } catch {
      this.showNotice('errors.favourites.exportFailed');
    }
  }

  private async importFavourites(): Promise<void> {
    const { favouritesFile, session } = this.dependencies;
    if (!favouritesFile) return;
    let text: string | undefined;
    try {
      text = await favouritesFile.importFavourites();
    } catch {
      this.showNotice('errors.favourites.importFailed');
      return;
    }
    if (text === undefined) return;
    const imported = parseFavouritesFile(text);
    if (!imported) {
      this.showNotice('errors.favourites.notAFavouritesFile');
      return;
    }
    const before = session.currentState().favourites.favourites().length;
    session.updateFavourites((favourites) => favourites.merge(imported));
    const added = session.currentState().favourites.favourites().length - before;
    this.showNotice('favourites.file.imported', { count: added });
  }

  private toggleActiveFavourite(): void {
    const activeTab = this.dependencies.session.currentState().tabStrip.activeTab();
    if (!activeTab || isUntitledLocation(activeTab.location)) return;
    this.dependencies.session.updateFavourites((favourites) => favourites.toggle(activeTab.location, 'file'));
  }

  showNotice(
    key: MessageKey,
    values?: Readonly<Record<string, string | number>>,
    actions: readonly NoticeAction[] = [],
  ): void {
    this.noticeActions = actions;
    this.publish(this.composeSnapshot(this.dependencies.translator.translate(key, values)));
  }

  dismissNotice(): void {
    this.noticeActions = [];
    this.publish(this.composeSnapshot(undefined));
  }

  private async openDocument(path: string): Promise<void> {
    try {
      await this.dependencies.session.openDocument(path);
    } catch (error) {
      this.showOpenFailure(error, path);
    }
  }

  private showOpenFailure(error: unknown, path: string, actions: readonly NoticeAction[] = []): void {
    const key = error instanceof DocumentOpenError ? error.messageKey : 'errors.document.unreadable';
    this.showNotice(key, { path }, actions);
  }

  private handleSessionChange(): void {
    this.publish(this.composeSnapshot(this.snapshot.notice));
    this.showViewStateInMenu();
    this.showRecentFilesInMenu();
    this.refreshPathStatuses();
    this.liveReload?.watchOpenTabs();
    this.editing.keepOnly(
      new Set(
        this.dependencies.session
          .currentState()
          .tabStrip.tabs()
          .map((tab) => tab.location.canonicalKey),
      ),
    );
    this.scheduleSave();
    void this.refreshActiveDocument();
  }

  private scheduleSave(): void {
    clearTimeout(this.pendingSave);
    this.pendingSave = setTimeout(() => void this.dependencies.session.save(), STATE_SAVE_DELAY_MS);
  }

  /** Renders the active document again when it or its edited text changed. */
  private async refreshActiveDocument(): Promise<void> {
    const document = await this.loadActiveDocument();
    const text = document ? this.textShownFor(document) : undefined;
    if (document === this.renderedDocument && text === this.renderedText) return;
    this.renderedDocument = document;
    this.renderedText = text;
    this.activeDocument = document && text !== undefined ? this.render(document, text) : undefined;
    this.publish(this.composeSnapshot(this.snapshot.notice));
  }

  /** While the document is being edited the preview is hidden, so its last edited text is enough. */
  private textShownFor(document: OpenedDocument): string {
    const { canonicalKey } = document.location;
    if (
      this.editing.isEditing(canonicalKey) &&
      this.renderedDocument === document &&
      this.renderedText !== undefined
    ) {
      return this.renderedText;
    }
    return this.editing.editedTextOf(canonicalKey) ?? document.text;
  }

  private showChangedOnDiskNotice(
    location: DocumentLocation,
    messageKey: 'errors.document.changedOnDisk' | 'editing.conflict.message',
  ): void {
    const { translator } = this.dependencies;
    const { canonicalKey } = location;
    const keepLabel =
      messageKey === 'editing.conflict.message' ? 'editing.conflict.keepMine' : 'editing.conflict.overwrite';
    const keepCommand: ViewerCommand =
      messageKey === 'editing.conflict.message'
        ? { kind: 'keepEditedText' }
        : { kind: 'overwriteChangesOnDisk', canonicalKey };
    this.showNotice(messageKey, { path: location.fileName }, [
      { label: translator.translate(keepLabel), command: keepCommand },
      {
        label: translator.translate('editing.conflict.reload'),
        command: { kind: 'reloadFromDisk', canonicalKey },
      },
    ]);
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

  private render(document: OpenedDocument, text: string): RenderedActiveDocument {
    const { resources } = this.dependencies;
    const isUntitled = isUntitledLocation(document.location);
    const { html, outline, frontMatter } = this.dependencies.renderer.render(text, {
      resolveResourceUrl: (source) =>
        isUntitled ? undefined : resources?.imageUrl(document.location.displayPath, source),
    });
    return {
      canonicalKey: document.location.canonicalKey,
      displayPath: document.location.displayPath,
      fileName: document.location.fileName,
      isUntitled,
      html,
      outline,
      statistics: measureDocument(text, this.dependencies.translator.locale),
      encoding: document.encoding,
      lineEnding: document.lineEnding,
      source: text,
      scrollRatio: this.dependencies.session.currentState().tabStrip.activeTab()?.scrollRatio ?? 0,
      ...(frontMatter === undefined ? {} : { frontMatter }),
    };
  }

  private composeSnapshot(notice: string | undefined): ViewerSnapshot {
    return {
      viewer: this.dependencies.session.currentState(),
      pathStatuses: this.pathStatuses,
      folderRevisions: this.folderRefresh.revisionsByFolder(),
      unsavedDocumentKeys: this.editing.unsavedKeys(),
      ...(this.editingActions.isActiveDocumentEditing() ? { isActiveDocumentEditing: true } : {}),
      ...this.editorRequestPart(),
      ...(this.activeDocument ? { activeDocument: this.activeDocument } : {}),
      ...(notice === undefined ? {} : { notice }),
      ...(notice !== undefined && this.noticeActions.length > 0 ? { noticeActions: this.noticeActions } : {}),
      ...(this.openDialog === undefined ? {} : { openDialog: this.openDialog }),
      ...(this.findRequest > 0 ? { findRequest: this.findRequest } : {}),
      ...(this.externalLinkRequest === undefined ? {} : { externalLinkRequest: this.externalLinkRequest }),
      ...(this.isSourceView ? { isSourceView: true } : {}),
      ...this.unsavedChangesPart(),
    };
  }

  private editorRequestPart(): Pick<ViewerSnapshot, 'editorRequest'> {
    const editorRequest = this.editingActions.editorRequest();
    return editorRequest ? { editorRequest } : {};
  }

  private unsavedChangesPart(): Pick<ViewerSnapshot, 'unsavedChanges'> {
    const unsavedChanges = this.saving.unsavedChangesRequest();
    return unsavedChanges ? { unsavedChanges } : {};
  }

  private publish(snapshot: ViewerSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
