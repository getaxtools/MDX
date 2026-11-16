import {
  measureDocument,
  availableSnippets,
  clearWordGoal,
  setWordGoal,
  type WordGoals,
  isSidebarViewShown,
  showSidebarView,
  type DocumentStatistics,
  type Favourite,
  type RecentFile,
  type RestoreOutcome,
  type ViewerSession,
  type ViewerState,
  type WorkspaceKindId,
  type WorkspaceRegistry,
  parseFavouritesFile,
  toFavouritesFile,
  notesLocationOf,
  notesSettingsOf,
} from '@mdx/core';
import type { WikiLinkSuggester } from '@mdx/editor';
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
  type AttachmentPort,
  type FolderSearchResults,
  type TextSearchOptions,
  type LineEnding,
  type OpenedDocument,
  type PathStatus,
  type RecentWorkspaceMenuEntry,
  type WorkspaceFilePort,
  type NoteFilesPort,
  type NotesIndexPort,
  type NotesFolderInspection,
  type NotesLocationPort,
} from '@mdx/platform';
import type { MarkdownRenderer, OutlineEntry, RenderOptions } from '@mdx/renderer';
import { applyWorkspaceKindCommand, type WorkspaceKindCommand } from '../control-wheel/workspaceKindCommands';
import type { DocumentLink } from '../document-view/DocumentLink';
import { DocumentAttachments } from '../editing/DocumentAttachments';
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
import { shortcutLabelFor } from '../shortcuts/commandShortcuts';
import { effectiveCommandShortcuts } from '../shortcuts/effectiveCommandShortcuts';
import { REBINDABLE_COMMANDS } from '../shortcuts/rebindableCommands';
import { isTabCommand } from '../tabs/tabCommands';
import {
  WorkspaceActions,
  type NewWorkspaceFromFile,
  type NotesSetup,
  type WorkspaceDialog,
} from '../workspaces/WorkspaceActions';
import {
  isWorkspaceCommand,
  isWorkspaceFileCommand,
  workspaceNameOf,
  type WorkspaceFileCommand,
} from '../workspaces/workspaceCommands';
import { WorkspaceFileActions, type PendingWorkspaceFile } from '../workspaces/WorkspaceFileActions';
import { NotesLocationActions, isNotesLocationCommand } from '../notes-location/NotesLocationActions';
import { NotesActions, isNotesCommand, type NotesCommand, type NotesView } from '../notes/NotesActions';
import { NotesIndexActions, type NoteBacklinks } from '../notes/NotesIndexActions';
import { windowTitleFor } from '../workspaces/windowTitle';
import { recentWorkspaceLinks } from '../workspaces/recentWorkspaceLinks';
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
  readonly attachments?: AttachmentPort;
  readonly workspaceFiles?: WorkspaceFilePort;
  readonly notesLocations?: NotesLocationPort;
  readonly noteFiles?: NoteFilesPort;
  readonly notesIndex?: NotesIndexPort;
  /** The clock for daily notes and templates; the real one unless a test sets it. */
  readonly now?: () => Date;
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
  /** What the search box holds when it next gets the focus, such as `tag:work` for a chosen tag. */
  readonly folderSearchQuery?: string;
  /** The notes linking to the shown note, in a Notes workspace. */
  readonly noteBacklinks?: NoteBacklinks;
  /** Goes up each time the shown document should be copied as HTML, from the Edit menu or the palette. */
  readonly copyAsHtmlRequest?: number;
  /** The format the shown document should export to, numbered so the same format can be asked again. */
  readonly exportRequest?: ExportRequest;
  readonly externalLinkRequest?: string;
  /** A heading to show once the document a link opened is shown. */
  readonly linkedHeadingRequest?: LinkedHeadingRequest;
  readonly isSourceView?: boolean;
  readonly unsavedChanges?: UnsavedChangesRequest;
  readonly pathStatuses: ReadonlyMap<string, PathStatus>;
  /** How often each shown folder changed on disk, so its listing reloads when the count goes up. */
  readonly folderRevisions: ReadonlyMap<string, number>;
  readonly isActiveDocumentEditing?: boolean;
  /** Open documents whose edited text is not saved yet. */
  readonly unsavedDocumentKeys: ReadonlySet<string>;
  readonly editorRequest?: EditorRequest;
  /** Absent while the earlier state file stands in for the workspace store. */
  readonly workspaces?: WorkspacesView;
  /** The folder of the shown Notes workspace while it cannot be found. */
  readonly missingNotesLocation?: string;
  /** The note tree, shown in place of Folders in a Notes workspace whose folder is there. */
  readonly notes?: NotesView;
}

export interface WorkspacesView {
  readonly registry: WorkspaceRegistry;
  readonly shownWorkspaceId: string;
  /** The kind the New Workspace dialog starts on. */
  readonly kindForNewWorkspace?: WorkspaceKindId;
  /** A workspace file New Workspace finishes; its kind cannot be changed. */
  readonly newWorkspaceFromFile?: NewWorkspaceFromFile;
  /** A workspace file waiting for the user to confirm it. */
  readonly pendingFile?: PendingWorkspaceFile;
  /** Loaded when New Workspace opens, to suggest and check a Notes folder. */
  readonly notesSetup?: NotesSetup;
}

/** A button in the notice bar that runs a command, such as Locate for a file that has moved. */
export interface LinkedHeadingRequest {
  readonly canonicalKey: string;
  /** The part of the link after #, as written. */
  readonly fragment: string;
  readonly number: number;
}

export interface NoticeAction {
  readonly label: string;
  readonly command: ViewerCommand;
}

export interface ExportRequest {
  readonly format: ExportFormat;
  readonly number: number;
}

export type ViewerDialog =
  | 'about'
  | 'keyboardShortcuts'
  | 'pasteTable'
  | 'commandPalette'
  | 'settings'
  | 'clearAllData'
  | 'controlWheel'
  | 'workspaceKindSettings'
  | 'wordGoal'
  | 'noteTrash'
  | 'noteFromTemplate'
  | 'noteLinkUpdates'
  | WorkspaceDialog;

const DIALOGS_BY_COMMAND: Partial<Record<ViewerCommand['kind'], ViewerDialog>> = {
  showAbout: 'about',
  showKeyboardShortcuts: 'keyboardShortcuts',
  showPasteTable: 'pasteTable',
  showCommandPalette: 'commandPalette',
  showSettings: 'settings',
  showWordGoal: 'wordGoal',
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
  private renderedNoteList: object | undefined;
  private renderedText: string | undefined;
  private hasRenderedSourceLines = false;
  private pendingLivePreview: ReturnType<typeof setTimeout> | undefined;
  private pendingOutlineRefresh: ReturnType<typeof setTimeout> | undefined;
  private activeDocument: RenderedActiveDocument | undefined;
  private openDialog: ViewerDialog | undefined;
  private readonly workspaceActions: WorkspaceActions;
  private readonly workspaceFileActions: WorkspaceFileActions | undefined;
  private readonly notesLocationActions: NotesLocationActions | undefined;
  private readonly notesActions: NotesActions | undefined;
  private readonly notesIndexActions: NotesIndexActions | undefined;
  private pendingWorkspaceFile: PendingWorkspaceFile | undefined;
  private noticeActions: readonly NoticeAction[] = [];
  private findRequest = 0;
  private findQuery: FindQuery | undefined;
  private folderSearchFocusRequest = 0;
  private folderSearchQuery: string | undefined;
  private copyAsHtmlRequest = 0;
  private exportRequest: ExportRequest | undefined;
  private externalLinkRequest: string | undefined;
  private linkedHeadingRequest: LinkedHeadingRequest | undefined;
  private isSourceView = false;
  private shownMenuViewState = '';
  private shownWindowTitle = '';
  private shownMenuShortcuts = '';
  private shownRecentFiles: ViewerState['recentFiles'] | undefined;
  private shownRecentWorkspaces = '';
  private pathStatuses: ReadonlyMap<string, PathStatus> = new Map();
  private checkedLocationKeys = '';
  private readonly liveReload: LiveReload | undefined;
  private readonly folderRefresh: FolderRefresh;
  private readonly explorerFolderActions: ExplorerFolderActions;
  private readonly saving: DocumentSaving;
  private readonly editing = new DocumentEditing();
  private readonly editingActions: EditingActions;
  private readonly navigation: DocumentNavigation;
  private readonly documentAttachments: DocumentAttachments | undefined;

  constructor(private readonly dependencies: ViewerControllerDependencies) {
    this.snapshot = {
      viewer: dependencies.session.currentState(),
      pathStatuses: this.pathStatuses,
      folderRevisions: new Map(),
      unsavedDocumentKeys: new Set(),
    };
    this.saving = this.createDocumentSaving();
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
    this.folderRefresh = new FolderRefresh(dependencies.folderWatcher, () => {
      this.notesActions?.forgetNoteList();
      this.publish(this.composeSnapshot(this.snapshot.notice));
    });
    this.documentAttachments = this.createDocumentAttachments();
    this.workspaceActions = this.createWorkspaceActions();
    this.workspaceFileActions = this.createWorkspaceFileActions();
    this.notesLocationActions = this.createNotesLocationActions();
    this.notesActions = this.createNotesActions();
    this.notesIndexActions = this.createNotesIndexActions();
  }

  private createNotesActions(): NotesActions | undefined {
    const { session, noteFiles } = this.dependencies;
    if (!noteFiles) return undefined;
    return new NotesActions({
      session,
      noteFiles,
      ...(this.dependencies.notesIndex ? { notesIndex: this.dependencies.notesIndex } : {}),
      translator: this.dependencies.translator,
      unsavedKeys: () => this.editing.unsavedKeys(),
      isIndexComplete: () => this.notesIndexActions?.isIndexComplete() ?? false,
      openForEditing: async (path) => {
        await this.openDocument(path);
        this.editingActions.startEditingActiveDocument();
      },
      showNotice: (key, values, actions) => this.showNotice(key, values, actions),
      showTrashDialog: () => {
        this.openDialog = 'noteTrash';
        this.publish(this.composeSnapshot(this.snapshot.notice));
      },
      showTemplateDialog: () => {
        this.openDialog = 'noteFromTemplate';
        this.publish(this.composeSnapshot(this.snapshot.notice));
      },
      showLinkUpdatesDialog: () => {
        this.openDialog = 'noteLinkUpdates';
        this.publish(this.composeSnapshot(this.snapshot.notice));
      },
      closeLinkUpdatesDialog: () => {
        if (this.openDialog !== 'noteLinkUpdates') return;
        this.openDialog = undefined;
        this.publish(this.composeSnapshot(this.snapshot.notice));
      },
      now: this.dependencies.now ?? (() => new Date()),
      openDocument: (path) => this.openDocument(path),
      onChange: () => this.publish(this.composeSnapshot(this.snapshot.notice)),
    });
  }

  /** The notes and folders directly inside a folder of the shown Notes workspace. */
  listNoteFolder(folderPath: string): Promise<FolderListing> {
    return this.notesActions?.listFolder(folderPath) ?? Promise.resolve({ folders: [], documents: [] });
  }

  private createNotesLocationActions(): NotesLocationActions | undefined {
    const { session, notesLocations } = this.dependencies;
    if (!notesLocations) return undefined;
    return new NotesLocationActions({
      session,
      notesLocations,
      pickFolder: () => this.pickNotesFolder(),
      showNotice: (key, values) => this.showNotice(key, values),
      onChange: () => {
        this.publish(this.composeSnapshot(this.snapshot.notice));
        void this.showNotesIndex();
      },
    });
  }

  private createNotesIndexActions(): NotesIndexActions | undefined {
    const { notesIndex } = this.dependencies;
    if (!notesIndex) return undefined;
    return new NotesIndexActions({
      notesIndex,
      onChange: () => this.publish(this.composeSnapshot(this.snapshot.notice)),
      onNotesChanged: () => {
        this.notesActions?.forgetNoteList();
        void this.refreshActiveDocument();
      },
    });
  }

  /** Suggests notes after `[[` while a note of the shown Notes workspace is edited. */
  wikiLinkSuggesterFor(document: DocumentLocation): WikiLinkSuggester | undefined {
    return this.notesIndexActions?.linkSuggesterFor(document, () => this.notesActions?.noteEntries());
  }

  /** The window got the focus: a Notes folder that reports no changes is checked again now. */
  windowFocused(): Promise<void> {
    return this.notesIndexActions?.windowFocused() ?? Promise.resolve();
  }

  /** The index follows the shown workspace: a Notes workspace whose folder is there, or none. */
  private async showNotesIndex(): Promise<void> {
    const shown = this.dependencies.session.shownWorkspace();
    const isMissing = this.notesLocationActions?.missingLocation() !== undefined;
    const location = shown && !isMissing ? notesLocationOf(shown) : undefined;
    await this.notesIndexActions?.show(location, notesSettingsOf(shown).excludedPaths);
  }

  private createDocumentSaving(): DocumentSaving {
    const { session, translator } = this.dependencies;
    return new DocumentSaving(session, this.editing, {
      onChange: () => this.publish(this.composeSnapshot(this.snapshot.notice)),
      onSaveFailed: (fileName) => this.showNotice('errors.document.saveFailed', { path: fileName }),
      onChangedOnDisk: (location) => this.showChangedOnDiskNotice(location, 'errors.document.changedOnDisk'),
      onCannotSaveInPlace: (location, failure) =>
        this.showNotice(`errors.document.${failure}`, { path: location.fileName }, [
          { label: translator.translate('menu.file.saveAs'), command: { kind: 'saveDocumentAs' } },
        ]),
    });
  }

  private createWorkspaceFileActions(): WorkspaceFileActions | undefined {
    const { session, translator, workspaceFiles } = this.dependencies;
    if (!workspaceFiles) return undefined;
    return new WorkspaceFileActions({
      session,
      translator,
      workspaceFiles,
      showConfirmation: (pending) => {
        this.pendingWorkspaceFile = pending;
        this.openDialog = pending ? 'openWorkspaceFile' : undefined;
        this.publish(this.composeSnapshot(this.snapshot.notice));
      },
      showNotice: (key, values) => this.showNotice(key, values),
      switchTo: (workspaceId) => this.workspaceActions.switchTo(workspaceId),
      createAndShow: async (request, lists) => {
        await this.workspaceActions.createAndShow(request, lists);
      },
      chooseNotesFolder: (request, workspace) =>
        this.workspaceActions.chooseFolderForWorkspaceFile({ request, workspace }),
    });
  }

  private createWorkspaceActions(): WorkspaceActions {
    const { session, translator } = this.dependencies;
    return new WorkspaceActions({
      session,
      translator,
      confirmLeavingDocuments: () => this.saving.confirmClosingWindow(),
      showDialog: (dialog) => {
        this.openDialog = dialog;
        this.publish(this.composeSnapshot(this.snapshot.notice));
      },
      showNotice: (key, values) => this.showNotice(key, values),
      showSwitchedWorkspace: () => this.showSwitchedWorkspace(),
      addFolder: () => this.explorerFolderActions.openFolder(),
      notesLocations: this.dependencies.notesLocations,
    });
  }

  /** Edits were saved or discarded before the switch, so the new workspace starts with none. */
  private async runWorkspaceFileCommand(command: WorkspaceFileCommand): Promise<void> {
    const actions = this.workspaceFileActions;
    if (!actions) return;
    if (command.kind === 'exportWorkspace') await actions.export();
    else if (command.kind === 'openWorkspaceFile') await actions.open();
    else if (command.kind === 'confirmOpenWorkspaceFile') await actions.confirm();
    else actions.cancel();
  }

  /** Workspace files opened from Windows while the app runs, and the one it was started with. */
  private async offerWorkspaceFiles(): Promise<void> {
    const { workspaceFiles } = this.dependencies;
    const actions = this.workspaceFileActions;
    if (!workspaceFiles || !actions) return;
    this.stopActions.push(workspaceFiles.onWorkspaceFileOpened((contents) => void actions.offer(contents)));
    const startupFile = await workspaceFiles.takeStartupWorkspaceFile();
    if (startupFile) await actions.offer(startupFile);
  }

  private async showSwitchedWorkspace(): Promise<void> {
    this.editing.keepOnly(new Set());
    this.navigation.forgetHistory();
    this.navigation.recordActiveDocument();
    this.refreshPathStatuses();
    await this.refreshActiveDocument();
    await this.notesLocationActions?.check();
    await this.showNotesIndex();
  }

  private createDocumentAttachments(): DocumentAttachments | undefined {
    const { attachments, session, translator } = this.dependencies;
    if (!attachments) return undefined;
    return new DocumentAttachments(session, attachments, {
      isEditing: () => this.editingActions.isActiveDocumentEditing(),
      insertLinks: (links, point) => this.editingActions.insertPictureLinks(links, point),
      notify: (key, values) => this.showNotice(key, values),
      askToSaveFirst: () =>
        this.showNotice('attachments.saveFirst', undefined, [
          { label: translator.translate('menu.file.saveAs'), command: { kind: 'saveDocumentAs' } },
        ]),
    });
  }

  /** Saves a picture pasted into the editor; undefined when it cannot be added. */
  pastePicture(bytes: Uint8Array): Promise<string | undefined> {
    return this.documentAttachments?.pastePicture(bytes) ?? Promise.resolve(undefined);
  }

  async start(): Promise<void> {
    const { session, requests } = this.dependencies;
    const restoreOutcome = await session.restore();
    this.navigation.recordActiveDocument();
    this.publish(this.composeSnapshot(undefined));
    this.reportRestoreOutcome(restoreOutcome);
    this.stopActions.push(session.subscribe(() => this.handleSessionChange()));
    this.stopActions.push(requests.onDocumentsRequested((paths) => void this.openDocuments(paths)));
    this.listenToMenu();
    this.refreshPathStatuses();
    if (this.liveReload) this.stopActions.push(this.liveReload.start());
    this.stopActions.push(this.folderRefresh.start());
    if (this.notesIndexActions) this.stopActions.push(this.notesIndexActions.start());
    if (this.documentAttachments) this.stopActions.push(this.documentAttachments.start());
    await this.openDocuments(await requests.takeStartupDocuments());
    await this.refreshActiveDocument();
    await this.notesLocationActions?.check();
    await this.showNotesIndex();
    await this.offerWorkspaceFiles();
  }

  private reportRestoreOutcome({
    wasReset,
    newerSavedState,
    hasEarlierVersionChanges,
  }: RestoreOutcome): void {
    if (newerSavedState?.appVersion !== undefined)
      this.showNotice('errors.appState.newerVersion', { version: newerSavedState.appVersion });
    else if (newerSavedState) this.showNotice('errors.appState.newerVersionUnnamed');
    else if (wasReset) this.showNotice('errors.appState.reset');
    else if (hasEarlierVersionChanges) this.showNotice('workspaces.earlierVersionChanges');
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
    if (!activeLocation || isUntitledLocation(activeLocation)) return;
    if (link.kind === 'unresolvedNote') {
      this.notesActions?.offerNoteFor(link.href, activeLocation);
      return;
    }
    if (!links) return;
    try {
      await this.openDocuments([await links.resolveDocumentLink(activeLocation.displayPath, link.href)]);
      this.revealLinkedHeading(link.href);
    } catch (error) {
      this.showOpenFailure(error, link.href);
    }
  }

  /** A link such as `plan.md#next-steps` opens the document at that heading. */
  private revealLinkedHeading(href: string): void {
    const fragment = href.split('#')[1];
    const opened = this.dependencies.session.currentState().tabStrip.activeTab()?.location;
    if (!fragment || !opened) return;
    this.linkedHeadingRequest = {
      canonicalKey: opened.canonicalKey,
      fragment,
      number: (this.linkedHeadingRequest?.number ?? 0) + 1,
    };
    this.publish(this.composeSnapshot(this.snapshot.notice));
  }

  private notesRenderingFor(location: DocumentLocation): Pick<RenderOptions, 'notes'> {
    const notes = this.notesActions?.renderingFor(location);
    return notes ? { notes } : {};
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
    this.workspaceActions.forgetWorkspaceFile();
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
    const featureRun = this.runFeatureCommand(command);
    if (featureRun) {
      await featureRun;
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

  /**
   * Starts a command one feature's actions run; undefined when it belongs to none of them. Other
   * commands must start without waiting, so a save takes the text as it was when Save was chosen.
   */
  private runFeatureCommand(command: ViewerCommand): Promise<void> | undefined {
    if (isNotesLocationCommand(command)) return this.notesLocationActions?.run(command) ?? Promise.resolve();
    if (isNotesCommand(command)) return this.runNotesCommand(command);
    if (isWorkspaceFileCommand(command)) return this.runWorkspaceFileCommand(command);
    if (isWorkspaceCommand(command)) return this.workspaceActions.run(command);
    return undefined;
  }

  private async runNotesCommand(command: NotesCommand): Promise<void> {
    await this.notesActions?.run(command);
    if (command.kind === 'updateNotesSettings') await this.showNotesIndex();
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
    toggleControlWheel: () => this.toggleControlWheel(),
    setWordGoal: ({ goal }) => this.changeWordGoal((goals, key) => setWordGoal(goals, key, goal)),
    clearWordGoal: () => this.changeWordGoal(clearWordGoal),
    insertSnippet: ({ snippetId }) => {
      const snippet = availableSnippets(this.dependencies.session.currentState().snippetLibrary).find(
        (candidate) => candidate.id === snippetId,
      );
      if (snippet) this.editingActions.insertSnippet(snippet.body);
    },
    showWorkspaceKindSettings: () => {
      this.openDialog = 'workspaceKindSettings';
      this.publish(this.composeSnapshot(this.snapshot.notice));
    },
    switchWorkspaceKind: (command) => this.runWorkspaceKindCommand(command),
    setWorkspaceKindEnabled: (command) => this.runWorkspaceKindCommand(command),
    runEditorCommand: ({ command }) => {
      this.editingActions.runEditorCommand(command);
    },
    revertDocument: () => this.editingActions.revertActiveDocument(),
    changeOutlineSection: ({ line, action }) => {
      const refusal = this.editingActions.changeOutlineSection(line, action);
      if (refusal) this.showNotice(`outline.section.refused.${refusal}`);
    },
    reloadActiveDocument: () => this.reloadActiveDocument(),
    reloadFromDisk: ({ canonicalKey }) => this.editingActions.reloadFromDisk(canonicalKey),
    overwriteChangesOnDisk: ({ canonicalKey }) => this.saving.overwriteChangesOnDisk(canonicalKey),
    print: () => {
      if (this.activeDocument) this.dependencies.printer?.printActiveDocument();
    },
    showFolderSearch: () => {
      this.folderSearchQuery = undefined;
      this.dependencies.session.updateViewSettings((viewSettings) => showSidebarView(viewSettings, 'search'));
      this.folderSearchFocusRequest += 1;
      this.publish(this.composeSnapshot(this.snapshot.notice));
    },
    showNotesWithTag: ({ tag }) => {
      this.folderSearchQuery = `tag:${tag}`;
      this.dependencies.session.updateViewSettings((viewSettings) => showSidebarView(viewSettings, 'search'));
      this.folderSearchFocusRequest += 1;
      this.publish(this.composeSnapshot(this.snapshot.notice));
    },
    openBacklink: async ({ path, noteName }) => {
      const displayPath = this.notesIndexActions?.displayPathOf(path);
      if (displayPath === undefined) return;
      await this.openSearchMatch(displayPath, { text: noteName, isCaseSensitive: false, isWholeWord: false });
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
    this.showShortcutsInMenu();
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

  /** The menu shows the keys of commands the user can change; an empty text shows none. */
  private showShortcutsInMenu(): void {
    const { menu, session, translator } = this.dependencies;
    if (!menu) return;
    const shortcuts = effectiveCommandShortcuts(session.currentState().shortcutOverrides);
    const shortcutTexts = Object.fromEntries(
      REBINDABLE_COMMANDS.map(({ id, command }) => [
        id,
        shortcutLabelFor(command, translator, shortcuts) ?? '',
      ]),
    );
    const shortcutsKey = JSON.stringify(shortcutTexts);
    if (shortcutsKey === this.shownMenuShortcuts) return;
    this.shownMenuShortcuts = shortcutsKey;
    void menu.showShortcuts(shortcutTexts);
  }

  private showRecentFilesInMenu(): void {
    const { menu, session } = this.dependencies;
    const { recentFiles } = session.currentState();
    const workspaces = this.recentWorkspacesForMenu();
    const workspacesKey = JSON.stringify(workspaces);
    if (!menu || (recentFiles === this.shownRecentFiles && workspacesKey === this.shownRecentWorkspaces))
      return;
    this.shownRecentFiles = recentFiles;
    this.shownRecentWorkspaces = workspacesKey;
    const displayPaths = recentFiles.entries().map((recentFile) => recentFile.location.displayPath);
    void menu.showRecentFiles(displayPaths.slice(0, MAX_RECENT_MENU_ENTRIES), workspaces);
  }

  /** The other workspaces of enabled kinds, most recently used first. */
  private recentWorkspacesForMenu(): RecentWorkspaceMenuEntry[] {
    const { session, translator } = this.dependencies;
    const view = this.workspacesPart().workspaces;
    if (!view) return [];
    return recentWorkspaceLinks(view, session.currentState().workspaceKinds, translator)
      .slice(0, MAX_RECENT_MENU_ENTRIES)
      .map(({ id, name }) => ({ id, name }));
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
    if (this.notesIndexActions?.isShown()) return this.notesIndexActions.search(query);
    return this.explorerFolderActions.searchDocuments(query, options);
  }

  hasSearchableFolders(): boolean {
    return this.notesIndexActions?.isShown() === true || this.explorerFolderActions.hasSearchedFolders();
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

  /** Without the preview beside it the edited text is not rendered; its headings and counts are read again. */
  private scheduleOutlineRefresh(canonicalKey: string, text: string): void {
    clearTimeout(this.pendingOutlineRefresh);
    this.pendingOutlineRefresh = setTimeout(() => {
      const shown = this.activeDocument;
      if (shown?.canonicalKey !== canonicalKey) return;
      this.activeDocument = {
        ...shown,
        outline: this.dependencies.renderer.outlineOf(text),
        statistics: measureDocument(text, this.dependencies.translator.locale),
      };
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

  /** Goals belong to the active document; the dialog closes once the goal is set or cleared. */
  private changeWordGoal(change: (goals: WordGoals, canonicalKey: string) => WordGoals): void {
    const { session } = this.dependencies;
    const key = session.currentState().tabStrip.activeTab()?.location.canonicalKey;
    if (key === undefined) return;
    session.updateWordGoals((goals) => change(goals, key));
    if (this.openDialog === 'wordGoal') this.openDialog = undefined;
    this.publish(this.composeSnapshot(this.snapshot.notice));
  }

  private toggleControlWheel(): void {
    const isWheelOpen = this.openDialog === 'controlWheel' || this.openDialog === 'workspaceKindSettings';
    this.openDialog = isWheelOpen ? undefined : 'controlWheel';
    this.publish(this.composeSnapshot(this.snapshot.notice));
  }

  private async runWorkspaceKindCommand(command: WorkspaceKindCommand): Promise<void> {
    const { session, translator } = this.dependencies;
    const kindWorkspace =
      command.kind === 'switchWorkspaceKind'
        ? session.workspaces()?.lastShownOfKind(command.kindId)
        : undefined;
    if (kindWorkspace && kindWorkspace.id !== session.shownWorkspace()?.id) {
      await this.workspaceActions.run({ kind: 'switchWorkspace', workspaceId: kindWorkspace.id });
      return;
    }
    const current = session.currentState().workspaceKinds;
    const { state, notice } = applyWorkspaceKindCommand(current, command, translator);
    if (state !== current) session.updateWorkspaceKinds(() => state);
    if (notice) this.showNotice(notice.key, notice.values);
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
    await this.dependencies.session.clearStoredData();
    await this.notesIndexActions?.clearAll();
    await this.saveNow();
    await this.showNotesIndex();
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
    this.showShortcutsInMenu();
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
    void this.notesIndexActions?.showBacklinksOf(document?.location);
    if (document) await this.notesActions?.prepareRendering(document.location);
    const text = document ? this.textShownFor(document) : undefined;
    const shouldMarkSourceLines = this.isPreviewBesideEditor();
    const noteList = this.notesActions?.noteListVersion();
    if (this.isRenderUpToDate({ document, text, shouldMarkSourceLines, noteList })) return;
    this.renderedNoteList = noteList;
    this.renderedDocument = document;
    this.renderedText = text;
    this.hasRenderedSourceLines = shouldMarkSourceLines;
    this.activeDocument =
      document && text !== undefined ? this.render(document, text, shouldMarkSourceLines) : undefined;
    this.publish(this.composeSnapshot(this.snapshot.notice));
  }

  private isRenderUpToDate(next: {
    readonly document: OpenedDocument | undefined;
    readonly text: string | undefined;
    readonly shouldMarkSourceLines: boolean;
    readonly noteList: object | undefined;
  }): boolean {
    return (
      next.document === this.renderedDocument &&
      next.text === this.renderedText &&
      next.shouldMarkSourceLines === this.hasRenderedSourceLines &&
      next.noteList === this.renderedNoteList
    );
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
      ...this.notesRenderingFor(document.location),
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
      ...(this.linkedHeadingRequest ? { linkedHeadingRequest: this.linkedHeadingRequest } : {}),
      ...(this.isSourceView ? { isSourceView: true } : {}),
      ...this.unsavedChangesPart(),
      ...this.workspacesPart(),
      ...this.notesPart(),
    };
  }

  /** Either the missing folder's path or, while the folder is there, its note tree. */
  private notesPart(): Pick<ViewerSnapshot, 'missingNotesLocation' | 'notes' | 'noteBacklinks'> {
    const missingNotesLocation = this.notesLocationActions?.missingLocation();
    if (missingNotesLocation !== undefined) return { missingNotesLocation };
    const notes = this.notesActions?.view();
    if (!notes) return {};
    return { notes: { ...notes, ...this.notesIndexPart() }, ...this.noteBacklinksPart() };
  }

  private notesIndexPart(): Pick<NotesView, 'indexStatus' | 'tags'> {
    const indexStatus = this.notesIndexActions?.status();
    const tags = this.notesIndexActions?.tags();
    return { ...(indexStatus ? { indexStatus } : {}), ...(tags ? { tags } : {}) };
  }

  /** Only the shown note's backlinks; while another note loads, none. */
  private noteBacklinksPart(): Pick<ViewerSnapshot, 'noteBacklinks'> {
    const backlinks = this.notesIndexActions?.backlinks();
    const isForShownNote = backlinks?.canonicalKey === this.activeDocument?.canonicalKey;
    return backlinks && isForShownNote ? { noteBacklinks: backlinks } : {};
  }

  private notesSetupPart(): Pick<WorkspacesView, 'notesSetup'> {
    const notesSetup = this.workspaceActions.notesSetup();
    return notesSetup ? { notesSetup } : {};
  }

  /** What a folder for a new Notes workspace holds; without a Notes port nothing is there to look at. */
  inspectNotesFolder(path: string): Promise<NotesFolderInspection> {
    return this.dependencies.notesLocations?.inspectFolder(path) ?? Promise.resolve('empty');
  }

  /** The folder picker for a Notes folder; the picked folder becomes readable, as any opened folder. */
  async pickNotesFolder(): Promise<string | undefined> {
    const picked = await this.dependencies.folders?.pickFolder();
    return picked?.displayPath;
  }

  private workspacesPart(): Pick<ViewerSnapshot, 'workspaces'> {
    const { session } = this.dependencies;
    const registry = session.workspaces();
    const shownWorkspaceId = session.shownWorkspace()?.id;
    if (!registry || shownWorkspaceId === undefined) return {};
    const kindForNewWorkspace = this.workspaceActions.kindForNewWorkspace();
    const newWorkspaceFromFile = this.workspaceActions.newWorkspaceFromFile();
    return {
      workspaces: {
        registry,
        shownWorkspaceId,
        ...(kindForNewWorkspace ? { kindForNewWorkspace } : {}),
        ...(newWorkspaceFromFile ? { newWorkspaceFromFile } : {}),
        ...(this.pendingWorkspaceFile ? { pendingFile: this.pendingWorkspaceFile } : {}),
        ...this.notesSetupPart(),
      },
    };
  }

  private documentRequestsPart(): Pick<
    ViewerSnapshot,
    | 'findRequest'
    | 'findQuery'
    | 'copyAsHtmlRequest'
    | 'exportRequest'
    | 'folderSearchFocusRequest'
    | 'folderSearchQuery'
  > {
    return {
      ...(this.findRequest > 0 ? { findRequest: this.findRequest } : {}),
      ...(this.findQuery ? { findQuery: this.findQuery } : {}),
      ...(this.folderSearchFocusRequest > 0
        ? { folderSearchFocusRequest: this.folderSearchFocusRequest }
        : {}),
      ...(this.folderSearchQuery === undefined ? {} : { folderSearchQuery: this.folderSearchQuery }),
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
    this.showWindowTitle(snapshot);
  }

  private showWindowTitle({ activeDocument }: ViewerSnapshot): void {
    const { session, translator, desktopShell } = this.dependencies;
    const shown = session.shownWorkspace();
    const title = windowTitleFor(
      {
        documentName: activeDocument?.fileName,
        workspaceName: shown ? workspaceNameOf(shown, translator) : undefined,
      },
      translator,
    );
    if (title === this.shownWindowTitle) return;
    this.shownWindowTitle = title;
    void desktopShell?.setWindowTitle(title);
  }
}
