import {
  measureDocument,
  isSidebarViewShown,
  showSidebarView,
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
  type DesktopShellPort,
  type DocumentExportPort,
  type ExportFormat,
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
  type FolderSearchResults,
  type TextSearchOptions,
  type LineEnding,
  type OpenedDocument,
  type PathStatus,
} from '@mdx/platform';
import type { MarkdownRenderer, OutlineEntry } from '@mdx/renderer';
import type { DocumentLink } from '../document-view/DocumentLink';
import { DocumentEditing } from '../editing/DocumentEditing';
import type { FindQuery } from '../find/findTextRanges';
import { EditingActions } from '../editing/EditingActions';
import type { EditorRequest } from '../editing/editingCommands';
import { ExplorerFolderActions } from '../explorer/ExplorerFolderActions';
import { FolderRefresh } from '../folder-tree/FolderRefresh';
import { DocumentNavigation } from '../navigation/DocumentNavigation';
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
/** How long typing pauses before the preview beside the editor shows the new text. */
export const LIVE_PREVIEW_DELAY_MS = 150;
/** How long typing pauses before the outline lists the headings of the edited text. */
export const OUTLINE_REFRESH_DELAY_MS = 300;
const LARGE_DOCUMENT_LIVE_PREVIEW_DELAY_MS = 500;
const LARGE_DOCUMENT_CHARACTERS = 256_000;
const SCROLL_RATIO_PRECISION = 0.001;
const EXPORT_EXTENSIONS: Readonly<Record<ExportFormat, string>> = { html: '.html', plainText: '.txt' };

/** `Guide.md` exports as `Guide.html` or `Guide.txt`. */
function exportFileNameFor(fileName: string, format: ExportFormat): string {
  const baseName = fileName.replace(/\.[^.]+$/, '') || fileName;
  return `${baseName}${EXPORT_EXTENSIONS[format]}`;
}

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
  readonly desktopShell?: DesktopShellPort;
  readonly documentExport?: DocumentExportPort;
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
  /** What the find bar searches for when it opens, such as the query of a Find in Folders match. */
  readonly findQuery?: FindQuery;
  /** Goes up each time the Find in Folders box should get the keyboard focus. */
  readonly folderSearchFocusRequest?: number;
  /** Goes up each time the shown document should be copied as HTML, from the Edit menu or the palette. */
  readonly copyAsHtmlRequest?: number;
  /** The format the shown document should export to, numbered so the same format can be asked again. */
  readonly exportRequest?: ExportRequest;
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

export interface ExportRequest {
  readonly format: ExportFormat;
  readonly number: number;
}

export type ViewerDialog =
  'about' | 'keyboardShortcuts' | 'pasteTable' | 'commandPalette' | 'settings' | 'clearAllData';

const DIALOGS_BY_COMMAND: Partial<Record<ViewerCommand['kind'], ViewerDialog>> = {
  showAbout: 'about',
  showKeyboardShortcuts: 'keyboardShortcuts',
  showPasteTable: 'pasteTable',
  showCommandPalette: 'commandPalette',
  showSettings: 'settings',
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
  private hasRenderedSourceLines = false;
  private pendingLivePreview: ReturnType<typeof setTimeout> | undefined;
  private pendingOutlineRefresh: ReturnType<typeof setTimeout> | undefined;
  private activeDocument: RenderedActiveDocument | undefined;
  private openDialog: ViewerDialog | undefined;
  private noticeActions: readonly NoticeAction[] = [];
  private findRequest = 0;
  private findQuery: FindQuery | undefined;
  private folderSearchFocusRequest = 0;
  private copyAsHtmlRequest = 0;
  private exportRequest: ExportRequest | undefined;
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
  private readonly navigation: DocumentNavigation;

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
    this.navigation = new DocumentNavigation(dependencies.session, (path) => this.openDocument(path));
    this.folderRefresh = new FolderRefresh(dependencies.folderWatcher, () =>
      this.publish(this.composeSnapshot(this.snapshot.notice)),
    );
  }

  async start(): Promise<void> {
    const { session, requests } = this.dependencies;
    const { wasReset } = await session.restore();
    this.navigation.recordActiveDocument();
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
    clearTimeout(this.pendingLivePreview);
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
    this.findQuery = undefined;
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
    if (command.kind === 'setLanguage') {
      this.changeLanguage(command.language);
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
    togglePreviewBesideEditor: () => this.togglePreviewBesideEditor(),
    newDocument: () => this.openNewDocument(),
    goBack: () => this.navigation.goBack(),
    goForward: () => this.navigation.goForward(),
    copyPath: ({ path }) => this.copyPath(path),
    revealInFileManager: ({ path }) => this.revealInFileManager(path),
    toggleFullScreen: () => this.dependencies.desktopShell?.toggleFullScreen(),
    runEditorCommand: ({ command }) => {
      this.editingActions.runEditorCommand(command);
    },
    revertDocument: () => this.editingActions.revertActiveDocument(),
    reloadActiveDocument: () => this.reloadActiveDocument(),
    reloadFromDisk: ({ canonicalKey }) => this.editingActions.reloadFromDisk(canonicalKey),
    overwriteChangesOnDisk: ({ canonicalKey }) => this.saving.overwriteChangesOnDisk(canonicalKey),
    print: () => {
      if (this.activeDocument) this.dependencies.printer?.printActiveDocument();
    },
    showFolderSearch: () => {
      this.dependencies.session.updateViewSettings((viewSettings) => showSidebarView(viewSettings, 'search'));
      this.folderSearchFocusRequest += 1;
      this.publish(this.composeSnapshot(this.snapshot.notice));
    },
    openSearchMatch: ({ path, query, options }) => this.openSearchMatch(path, { text: query, ...options }),
    showFind: () => {
      if (this.editingActions.runEditorCommand('find')) return;
      this.findRequest += 1;
      this.publish(this.composeSnapshot(this.snapshot.notice));
    },
    copyAsHtml: () => {
      if (!this.activeDocument) return;
      this.copyAsHtmlRequest += 1;
      this.publish(this.composeSnapshot(this.snapshot.notice));
    },
    copyHtml: ({ html }) => this.copyHtml(html),
    exportDocument: ({ format }) => {
      if (!this.activeDocument) return;
      this.exportRequest = { format, number: (this.exportRequest?.number ?? 0) + 1 };
      this.publish(this.composeSnapshot(this.snapshot.notice));
    },
    saveExport: ({ format, contents }) => this.saveExport(format, contents),
    confirmClearAllData: () => this.confirmClearAllData(),
    clearAllData: () => this.clearAllData(),
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
    const { viewSettings } = session.currentState();
    const { theme, readingWidth, typography, isStatusBarVisible, isPreviewBesideEditor } = viewSettings;
    const state = {
      theme,
      readingWidth,
      typography,
      isSidebarVisible: isSidebarViewShown(viewSettings, 'explorer'),
      isOutlineVisible: isSidebarViewShown(viewSettings, 'outline'),
      isStatusBarVisible,
      isSourceView: this.isSourceView,
      isPreviewBesideEditor,
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

  /** Finds text in the opened and favourite folders, for the Search view. */
  searchFolders(query: string, options: TextSearchOptions): Promise<FolderSearchResults> {
    return this.explorerFolderActions.searchDocuments(query, options);
  }

  hasSearchableFolders(): boolean {
    return this.explorerFolderActions.hasSearchedFolders();
  }

  /** Opens a document found by Find in Folders with the find bar showing the same matches. */
  private async openSearchMatch(path: string, query: FindQuery): Promise<void> {
    await this.openDocument(path);
    if (this.editingActions.isActiveDocumentEditing()) return;
    this.findQuery = query;
    this.findRequest += 1;
    this.publish(this.composeSnapshot(this.snapshot.notice));
  }

  /** Documents to offer in quick open: open, recent and favourite ones first, then those in folders. */
  quickOpenDocuments(): Promise<DocumentLocation[]> {
    return this.explorerFolderActions.quickOpenDocuments();
  }

  /** Records the source editor's text for a document; the window shows when it has unsaved changes. */
  updateEditedText(canonicalKey: string, text: string): void {
    this.editingActions.updateText(canonicalKey, text);
    if (this.isPreviewBesideEditor()) this.scheduleLivePreview(text.length);
    else this.scheduleOutlineRefresh(canonicalKey, text);
  }

  /** Without the preview beside it the edited text is not rendered, so only its headings are read again. */
  private scheduleOutlineRefresh(canonicalKey: string, text: string): void {
    clearTimeout(this.pendingOutlineRefresh);
    this.pendingOutlineRefresh = setTimeout(() => {
      const shown = this.activeDocument;
      if (shown?.canonicalKey !== canonicalKey) return;
      this.activeDocument = { ...shown, outline: this.dependencies.renderer.outlineOf(text) };
      this.publish(this.composeSnapshot(this.snapshot.notice));
    }, OUTLINE_REFRESH_DELAY_MS);
  }

  private scheduleLivePreview(textLength: number): void {
    clearTimeout(this.pendingLivePreview);
    const delayMs =
      textLength > LARGE_DOCUMENT_CHARACTERS ? LARGE_DOCUMENT_LIVE_PREVIEW_DELAY_MS : LIVE_PREVIEW_DELAY_MS;
    this.pendingLivePreview = setTimeout(() => void this.refreshActiveDocument(), delayMs);
  }

  private isPreviewBesideEditor(): boolean {
    return (
      this.dependencies.session.currentState().viewSettings.isPreviewBesideEditor &&
      this.editingActions.isActiveDocumentEditing()
    );
  }

  /** Shows or hides the preview beside the editor; showing it opens the editor if it is not open yet. */
  private togglePreviewBesideEditor(): void {
    const { session } = this.dependencies;
    const isShown = !session.currentState().viewSettings.isPreviewBesideEditor;
    session.updateViewSettings((viewSettings) => ({ ...viewSettings, isPreviewBesideEditor: isShown }));
    if (isShown) this.editingActions.startEditingActiveDocument();
  }

  /** Reads the active document from disk again; unsaved edits are dropped only once the user agrees. */
  private async reloadActiveDocument(): Promise<void> {
    const { session, translator } = this.dependencies;
    const location = session.currentState().tabStrip.activeTab()?.location;
    if (!location || isUntitledLocation(location)) return;
    const { canonicalKey } = location;
    if (!this.editing.hasUnsavedChanges(canonicalKey)) {
      await this.editingActions.reloadFromDisk(canonicalKey);
      return;
    }
    this.showNotice('editing.reloadLosesChanges', { path: location.fileName }, [
      {
        label: translator.translate('editing.conflict.reload'),
        command: { kind: 'reloadFromDisk', canonicalKey },
      },
      { label: translator.translate('editing.conflict.keepMine'), command: { kind: 'keepEditedText' } },
    ]);
  }

  private async copyPath(path: string): Promise<void> {
    try {
      await this.dependencies.desktopShell?.writeClipboardText(path);
    } catch {
      this.showNotice('errors.paths.copyFailed');
    }
  }

  /** The translator is made once at startup, so a new language shows after the next start. */
  private changeLanguage(language: string): void {
    const { session } = this.dependencies;
    if (session.currentState().viewSettings.language === language) return;
    session.updateViewSettings((viewSettings) => ({ ...viewSettings, language }));
    this.showNotice('settings.language.restartNeeded');
  }

  private confirmClearAllData(): void {
    if (this.editing.unsavedKeys().size > 0) {
      this.openDialog = undefined;
      this.showNotice('privacy.clearAllData.unsavedChanges');
      return;
    }
    this.openDialog = 'clearAllData';
    this.publish(this.composeSnapshot(this.snapshot.notice));
  }

  private async clearAllData(): Promise<void> {
    if (this.editing.unsavedKeys().size > 0) return;
    this.openDialog = undefined;
    this.editing.keepOnly(new Set());
    this.dependencies.session.clearAllData();
    this.navigation.forgetHistory();
    this.navigation.recordActiveDocument();
    await this.saveNow();
    this.showNotice('privacy.clearAllData.done');
  }

  private async saveExport(format: ExportFormat, contents: string): Promise<void> {
    const { documentExport } = this.dependencies;
    const document = this.activeDocument;
    if (!documentExport || !document) return;
    const fileName = exportFileNameFor(document.fileName, format);
    try {
      const savedPath = await documentExport.exportDocument(contents, fileName, format);
      if (savedPath) this.showNotice('export.done', { path: savedPath });
    } catch {
      this.showNotice('export.failed', { fileName: document.fileName });
    }
  }

  private async copyHtml(html: string): Promise<void> {
    try {
      await this.dependencies.desktopShell?.writeClipboardHtml(html);
    } catch {
      this.showNotice('errors.document.copyHtmlFailed');
    }
  }

  private async revealInFileManager(path: string): Promise<void> {
    try {
      await this.dependencies.desktopShell?.revealInFileManager(path);
    } catch {
      this.showNotice('errors.paths.revealFailed', { path });
    }
  }

  /** Opens an empty Untitled document in the editor, ready to type. */
  private openNewDocument(): void {
    this.openAsNewDocument('');
    this.editingActions.startEditingActiveDocument();
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
    this.navigation.recordActiveDocument();
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
    const shouldMarkSourceLines = this.isPreviewBesideEditor();
    if (
      document === this.renderedDocument &&
      text === this.renderedText &&
      shouldMarkSourceLines === this.hasRenderedSourceLines
    ) {
      return;
    }
    this.renderedDocument = document;
    this.renderedText = text;
    this.hasRenderedSourceLines = shouldMarkSourceLines;
    this.activeDocument =
      document && text !== undefined ? this.render(document, text, shouldMarkSourceLines) : undefined;
    this.publish(this.composeSnapshot(this.snapshot.notice));
  }

  /** While the document is edited without a preview beside it, its last rendered text is enough. */
  private textShownFor(document: OpenedDocument): string {
    const { canonicalKey } = document.location;
    if (
      this.editing.isEditing(canonicalKey) &&
      !this.isPreviewBesideEditor() &&
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

  private render(
    document: OpenedDocument,
    text: string,
    shouldMarkSourceLines: boolean,
  ): RenderedActiveDocument {
    const { resources } = this.dependencies;
    const isUntitled = isUntitledLocation(document.location);
    const { html, outline, frontMatter } = this.dependencies.renderer.render(text, {
      resolveResourceUrl: (source) =>
        isUntitled ? undefined : resources?.imageUrl(document.location.displayPath, source),
      includeSourceLines: shouldMarkSourceLines,
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
      ...this.documentRequestsPart(),
      ...(this.externalLinkRequest === undefined ? {} : { externalLinkRequest: this.externalLinkRequest }),
      ...(this.isSourceView ? { isSourceView: true } : {}),
      ...this.unsavedChangesPart(),
    };
  }

  private documentRequestsPart(): Pick<
    ViewerSnapshot,
    'findRequest' | 'findQuery' | 'copyAsHtmlRequest' | 'exportRequest' | 'folderSearchFocusRequest'
  > {
    return {
      ...(this.findRequest > 0 ? { findRequest: this.findRequest } : {}),
      ...(this.findQuery ? { findQuery: this.findQuery } : {}),
      ...(this.folderSearchFocusRequest > 0
        ? { folderSearchFocusRequest: this.folderSearchFocusRequest }
        : {}),
      ...(this.copyAsHtmlRequest > 0 ? { copyAsHtmlRequest: this.copyAsHtmlRequest } : {}),
      ...(this.exportRequest ? { exportRequest: this.exportRequest } : {}),
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
