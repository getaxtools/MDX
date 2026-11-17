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
  type InjectionFinding,
  InjectionIgnoreList,
  type WorkspaceKindId,
  type WorkspaceRegistry,
  parseFavouritesFile,
  toFavouritesFile,
  notesLocationOf,
  notesSettingsOf,
  isInsideFolder,
  type FrontMatterEdit,
  type EditingModeSetting,
  DEFAULT_SPEC_SEARCH_FILTER,
  type SpecSearchFilter,
} from '@mdx/core';
import type { WikiLinkSuggester } from '@mdx/editor';
import type { MessageKey, Translator } from '@mdx/i18n';
import {
  DocumentOpenError,
  hasFile,
  isUntitledLocation,
  type AppMenuPort,
  type AppWindowsPort,
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
  type NoteTransferPort,
  type NotesIndexPort,
  type SpecProjectPort,
  type NotesFolderInspection,
  type NotesLocationPort,
  type NotesMovePort,
} from '@mdx/platform';
import type { MarkdownRenderer, OutlineEntry, RenderOptions, ResourceUrlResolver } from '@mdx/renderer';
import { applyWorkspaceKindCommand, type WorkspaceKindCommand } from '../control-wheel/workspaceKindCommands';
import type { DocumentLink } from '../document-view/DocumentLink';
import {
  PropertyEditing,
  propertiesEditabilityOf,
  type PropertiesEditability,
} from '../document-view/PropertyEditing';
import { DocumentAttachments } from '../editing/DocumentAttachments';
import { AppWindowActions } from './AppWindowActions';
import { DocumentEditing } from '../editing/DocumentEditing';
import type { FindQuery } from '../find/findTextRanges';
import { EditingActions } from '../editing/EditingActions';
import { EditingModeActions, type EditingModeAnnouncement } from '../editing/EditingModeActions';
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
import {
  NotesMoveActions,
  isNotesMoveCommand,
  type NotesMoveCommand,
  type NotesMoveDialog,
} from '../notes-location/NotesMoveActions';
import { notesMoveStatusText } from '../notes-location/notesMoveText';
import type { MoveNotice } from '../notes-location/moveProblemNotice';
import {
  NotesActions,
  isNotesCommand,
  type NotesActionsDependencies,
  type NotesCommand,
  type NotesView,
} from '../notes/NotesActions';
import type { NoteTransferDialog } from '../notes/NoteTransferActions';
import { NotesIndexActions, type NoteBacklinks } from '../notes/NotesIndexActions';
import { SpecViewerActions, type SpecProjectsView } from '../spec-viewer/SpecViewerActions';
import { SpecDocumentRenderings } from '../spec-viewer/SpecDocumentRenderings';
import type { SpecPreview } from '../spec-viewer/specPreview';
import { specPreviewFor, viewLocationFor } from '../spec-viewer/specViewLocations';
import type { OutsideLinkRequest } from '../spec-viewer/outsideLinkRequest';
import {
  isRefusedInReadOnlyWorkspace,
  isSpecViewerCommand,
  type FollowSpecLinkCommand,
  type SpecViewerCommand,
} from '../spec-viewer/specViewerCommands';
import { windowTitleFor } from '../workspaces/windowTitle';
import { recentWorkspaceLinks } from '../workspaces/recentWorkspaceLinks';
import { applySessionCommand } from './applySessionCommand';
import { LiveReload } from './LiveReload';
import { InjectionCheckActions, type InjectionCheckView } from '../prompt-injection/InjectionCheckActions';
import { InjectionChecker } from '../prompt-injection/InjectionChecker';
import {
  isInjectionCheckCommand,
  type InjectionCheckCommand,
} from '../prompt-injection/injectionCheckCommands';
import {
  startModuleWorker,
  type InjectionCheckWorkerStarter,
} from '../prompt-injection/InjectionCheckWorker';
import { commandForMenuItem, type ViewerCommand } from './viewerCommands';

export const STATE_SAVE_DELAY_MS = 500;
const MOVE_NOTICE_ACTION_LABELS: Readonly<Record<NotesMoveCommand['kind'], MessageKey>> = {
  changeNotesLocation: 'notesLocation.move.change',
  startNotesMove: 'notesLocation.move.start',
  resumeNotesMove: 'notesLocation.move.resume',
  stopNotesMove: 'notesLocation.move.stop',
  cancelNotesMove: 'notesLocation.move.cancelMove',
  postponeNotesMove: 'notesLocation.move.later',
  keepOldNotesCopy: 'notesLocation.move.keepOldCopy',
  askToRemoveOldNotesCopy: 'notesLocation.move.removeOldCopy',
  removeOldNotesCopy: 'notesLocation.move.moveToRecycleBin',
  stopNotesMoveAndClose: 'notesLocation.move.stopAndClose',
  keepMovingNotes: 'notesLocation.move.keepMoving',
};
export const MAX_RECENT_MENU_ENTRIES = 10;
/** How long typing pauses before the preview beside the editor shows the new text. */
export const LIVE_PREVIEW_DELAY_MS = 150;
/** How long typing pauses before the outline lists the headings of the edited text. */
export const OUTLINE_REFRESH_DELAY_MS = 300;
const LARGE_DOCUMENT_LIVE_PREVIEW_DELAY_MS = 500;
const LARGE_DOCUMENT_CHARACTERS = 256_000;
const SCROLL_RATIO_PRECISION = 0.001;
const EXPORT_EXTENSIONS: Readonly<Record<ExportFormat, string>> = { html: '.html', plainText: '.txt' };

/** The check waits for the frame that draws the document, and then for the browser to finish it. */
function runAfterNextFrame(run: () => void): void {
  globalThis.requestAnimationFrame(() => globalThis.setTimeout(run, 0));
}

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
  readonly notesMoves?: NotesMovePort;
  readonly noteFiles?: NoteFilesPort;
  /** Imports a vault-style folder into a Notes location and exports notes out of it. */
  readonly noteTransfer?: NoteTransferPort;
  readonly notesIndex?: NotesIndexPort;
  readonly specProjects?: SpecProjectPort;
  /** The other windows of the app; absent where there is only one, such as in the browser. */
  readonly appWindows?: AppWindowsPort;
  /** The clock for daily notes and templates; the real one unless a test sets it. */
  readonly now?: () => Date;
  /** Starts the worker that checks large documents for prompt injection; tests pass a fake. */
  readonly startInjectionCheckWorker?: InjectionCheckWorkerStarter;
  /** Runs work once the shown document has been drawn; the next animation frame unless a test sets it. */
  readonly afterPaint?: (run: () => void) => void;
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
  /** Present for a note of the shown Notes workspace that has front matter. */
  readonly propertiesEditability?: PropertiesEditability;
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
  /** The prompt injection check of the shown document, once one has started. */
  readonly injectionCheck?: InjectionCheckView;
  /** A range of the shown document to outline in the source view, such as a finding. */
  readonly sourceRangeRequest?: SourceRangeRequest;
  /** A finding of the shown document was revealed, so its hidden characters are shown whatever the setting. */
  readonly isRevealingFinding?: boolean;
  /** Goes up each time the shown document should be copied as HTML, from the Edit menu or the palette. */
  readonly copyAsHtmlRequest?: number;
  /** The format the shown document should export to, numbered so the same format can be asked again. */
  readonly exportRequest?: ExportRequest;
  /** Goes up each time the shown document should be printed, once it has finished drawing. */
  readonly printRequest?: number;
  readonly externalLinkRequest?: string;
  /** A link of a Spec viewer workspace that leads outside its folders, opened only once the user agrees. */
  readonly outsideLinkRequest?: OutsideLinkRequest;
  /** A heading to show once the document a link opened is shown. */
  readonly linkedHeadingRequest?: LinkedHeadingRequest;
  readonly isSourceView?: boolean;
  readonly unsavedChanges?: UnsavedChangesRequest;
  readonly pathStatuses: ReadonlyMap<string, PathStatus>;
  /** How often each shown folder changed on disk, so its listing reloads when the count goes up. */
  readonly folderRevisions: ReadonlyMap<string, number>;
  readonly isActiveDocumentEditing?: boolean;
  /** Rich text or Source for the edited document: the setting, or Source for a document too large for Rich text. */
  readonly editingMode?: EditingModeSetting;
  readonly editingModeAnnouncement?: EditingModeAnnouncement;
  /** Open documents whose edited text is not saved yet. */
  readonly unsavedDocumentKeys: ReadonlySet<string>;
  /** The note whose property is being written, whose fields wait without asking for a save. */
  readonly propertySavingKey?: string;
  readonly editorRequest?: EditorRequest;
  /** Absent while the earlier state file stands in for the workspace store. */
  readonly workspaces?: WorkspacesView;
  /** The folder of the shown Notes workspace while it cannot be found. */
  readonly missingNotesLocation?: string;
  /** The note tree, shown in place of Folders in a Notes workspace whose folder is there. */
  readonly notes?: NotesView;
  /** The spec projects, shown in place of Folders in a Spec viewer workspace. */
  readonly specProjects?: SpecProjectsView;
  /** The "Spec after this change" previews open in tabs, by tab key. */
  readonly specPreviews?: ReadonlyMap<string, SpecPreview>;
  /** The step of a move of the notes folder that waits for the user. */
  readonly notesMoveDialog?: NotesMoveDialog;
  /** The status bar's word on a move of the notes folder, which keeps the notes read-only. */
  readonly notesMoveStatus?: string;
  /** The active document is in a notes folder being moved, so the editor refuses typing. */
  readonly isActiveDocumentReadOnly?: boolean;
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

/** Numbered, so the same range can be asked for again. */
export interface SourceRangeRequest {
  readonly canonicalKey: string;
  readonly from: number;
  readonly to: number;
  /** Zero-based. */
  readonly line: number;
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
  | NoteTransferDialog
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
  private renderedSpecRendering: object | undefined;
  private readonly specDocumentRenderings: SpecDocumentRenderings;
  private renderedText: string | undefined;
  private hasRenderedSourceLines = false;
  private pendingLivePreview: ReturnType<typeof setTimeout> | undefined;
  private pendingOutlineRefresh: ReturnType<typeof setTimeout> | undefined;
  private activeDocument: RenderedActiveDocument | undefined;
  private openDialog: ViewerDialog | undefined;
  private readonly workspaceActions: WorkspaceActions;
  private readonly workspaceFileActions: WorkspaceFileActions | undefined;
  private readonly notesLocationActions: NotesLocationActions | undefined;
  private readonly notesMoveActions: NotesMoveActions | undefined;
  private readonly notesActions: NotesActions | undefined;
  private readonly notesIndexActions: NotesIndexActions | undefined;
  private readonly specViewerActions: SpecViewerActions | undefined;
  private shownSpecFoldersKey: string | undefined;
  private readonly specPreviews = new Map<string, SpecPreview>();
  private pendingWorkspaceFile: PendingWorkspaceFile | undefined;
  private noticeActions: readonly NoticeAction[] = [];
  private findRequest = 0;
  private findQuery: FindQuery | undefined;
  private folderSearchFocusRequest = 0;
  private folderSearchQuery: string | undefined;
  private copyAsHtmlRequest = 0;
  private exportRequest: ExportRequest | undefined;
  private printRequest = 0;
  private externalLinkRequest: string | undefined;
  private outsideLinkRequest: OutsideLinkRequest | undefined;
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
  private readonly propertyEditing: PropertyEditing;
  private readonly editing = new DocumentEditing();
  private readonly editingActions: EditingActions;
  private readonly editingModes: EditingModeActions;
  private readonly navigation: DocumentNavigation;
  private readonly documentAttachments: DocumentAttachments | undefined;
  private readonly injectionChecks: InjectionCheckActions;
  private sourceRangeRequest: SourceRangeRequest | undefined;
  private revealedFindingKey: string | undefined;
  private readonly appWindowActions: AppWindowActions | undefined;

  constructor(private readonly dependencies: ViewerControllerDependencies) {
    this.snapshot = {
      viewer: dependencies.session.currentState(),
      pathStatuses: this.pathStatuses,
      folderRevisions: new Map(),
      unsavedDocumentKeys: new Set(),
    };
    this.saving = this.createDocumentSaving();
    this.editingActions = this.createEditingActions();
    this.propertyEditing = this.createPropertyEditing();
    this.editingModes = this.createEditingModes();
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
    this.appWindowActions = this.createAppWindowActions();
    this.workspaceFileActions = this.createWorkspaceFileActions();
    this.notesLocationActions = this.createNotesLocationActions();
    this.notesMoveActions = this.createNotesMoveActions();
    this.notesActions = this.createNotesActions();
    this.notesIndexActions = this.createNotesIndexActions();
    this.specDocumentRenderings = this.createSpecDocumentRenderings();
    this.specViewerActions = this.createSpecViewerActions();
    this.injectionChecks = this.createInjectionCheckActions();
  }

  private createEditingActions(): EditingActions {
    return new EditingActions(this.dependencies.session, this.editing, {
      onChange: () => {
        this.publish(this.composeSnapshot(this.snapshot.notice));
        void this.refreshActiveDocument();
      },
      onConflict: (location) => this.showChangedOnDiskNotice(location, 'editing.conflict.message'),
    });
  }

  private createEditingModes(): EditingModeActions {
    return new EditingModeActions(this.dependencies.session, {
      activeEditedLocation: () => this.editedLocation(),
      showNotice: (key, values) => this.showNotice(key, values),
      onChange: () => this.publish(this.composeSnapshot(this.snapshot.notice)),
    });
  }

  private createInjectionCheckActions(): InjectionCheckActions {
    const {
      session,
      startInjectionCheckWorker = startModuleWorker,
      afterPaint = runAfterNextFrame,
    } = this.dependencies;
    return new InjectionCheckActions({
      session,
      checker: new InjectionChecker(startInjectionCheckWorker),
      afterPaint,
      now: () => (this.dependencies.now?.() ?? new Date()).getTime(),
      onChange: () => this.publish(this.composeSnapshot(this.snapshot.notice)),
    });
  }

  private createSpecDocumentRenderings(): SpecDocumentRenderings {
    const { translator, renderer } = this.dependencies;
    return new SpecDocumentRenderings({
      translator,
      readText: (rootPath, relativePath) =>
        this.specViewerActions?.readProjectText(rootPath, relativePath) ?? Promise.resolve(undefined),
      outlineOf: (text) => renderer.outlineOf(text),
    });
  }

  private createSpecViewerActions(): SpecViewerActions | undefined {
    const { specProjects } = this.dependencies;
    if (!specProjects) return undefined;
    return new SpecViewerActions({
      specProjects,
      onChange: () => this.publish(this.composeSnapshot(this.snapshot.notice)),
    });
  }

  private createPropertyEditing(): PropertyEditing {
    return new PropertyEditing({
      session: this.dependencies.session,
      editing: this.editing,
      saving: this.saving,
      editingActions: this.editingActions,
      isNote: (location) => this.notesActions?.isNote(location) ?? false,
    });
  }

  private async runInjectionCheckCommand(command: InjectionCheckCommand): Promise<void> {
    if (command.kind === 'checkForPromptInjection') {
      if (!this.activeDocument) return;
      this.dependencies.session.updateViewSettings((viewSettings) =>
        showSidebarView(viewSettings, 'promptInjection'),
      );
      await this.injectionChecks.checkShownDocument();
    } else if (command.kind === 'revealInjectionFinding') this.revealInjectionFinding(command.finding);
    else if (command.kind === 'ignoreInjectionFinding')
      this.injectionChecks.ignore(command.finding, command.scope);
    else if (command.kind === 'showInjectionFindingAgain') this.injectionChecks.showAgain(command.finding);
    else {
      this.dependencies.session.updateInjectionIgnoreList(() => InjectionIgnoreList.empty());
      this.showNotice('promptInjection.settings.ignoredReset');
    }
  }

  /** The editor selects the finding; otherwise the source view opens with the finding outlined. */
  private revealInjectionFinding(finding: InjectionFinding): void {
    const place = this.injectionChecks.placeOf(finding);
    if (!place) return;
    this.revealedFindingKey = place.documentKey;
    if (this.editingActions.isActiveDocumentEditing()) {
      this.editingActions.revealRange(place.range);
      return;
    }
    this.isSourceView = true;
    this.sourceRangeRequest = {
      canonicalKey: place.documentKey,
      from: place.from,
      to: place.to,
      line: place.range.from.line,
      number: (this.sourceRangeRequest?.number ?? 0) + 1,
    };
    this.publish(this.composeSnapshot(this.snapshot.notice));
    this.showViewStateInMenu();
  }

  /** In a Spec viewer workspace, what a document's cross-links need is read before it renders. */
  private specPreparationFor(document: OpenedDocument | undefined): Promise<void> | undefined {
    const view = this.specViewerActions?.view();
    if (!document || !this.isSpecViewerShown()) return undefined;
    if (!this.specDocumentRenderings.needsPreparing(document.location, view)) return undefined;
    return this.specDocumentRenderings.prepare(document.location, view);
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
      ...this.noteTransferPart(),
      now: this.dependencies.now ?? (() => new Date()),
      openDocument: (path) => this.openDocument(path),
      onChange: () => this.publish(this.composeSnapshot(this.snapshot.notice)),
    });
  }

  private noteTransferPart(): Pick<
    NotesActionsDependencies,
    'noteTransfer' | 'showTransferDialog' | 'closeTransferDialog' | 'showNoteAs'
  > {
    const { noteTransfer } = this.dependencies;
    return {
      ...(noteTransfer ? { noteTransfer } : {}),
      showTransferDialog: (dialog) => {
        this.openDialog = dialog;
        this.publish(this.composeSnapshot(this.snapshot.notice));
      },
      closeTransferDialog: () => {
        if (this.openDialog === 'noteImport' || this.openDialog === 'noteExport') this.openDialog = undefined;
        this.publish(this.composeSnapshot(this.snapshot.notice));
      },
      // The app's own HTML export and printing work on the shown document, so the note is shown first.
      showNoteAs: async (note, output) => {
        await this.openDocument(note.displayPath);
        await this.refreshActiveDocument();
        await this.execute(
          output === 'html' ? { kind: 'exportDocument', format: 'html' } : { kind: 'print' },
        );
      },
    };
  }

  /** The shown document has finished drawing after a print request, so the window is printed now. */
  printShownDocument(): void {
    if (this.activeDocument) this.dependencies.printer?.printActiveDocument();
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

  private createNotesMoveActions(): NotesMoveActions | undefined {
    const { session, notesMoves, translator } = this.dependencies;
    if (!notesMoves) return undefined;
    return new NotesMoveActions({
      session,
      notesMoves,
      locale: translator.locale,
      pickFolder: () => this.pickNotesFolder(),
      showNotice: (notice, actions) => this.showMoveNotice(notice, actions),
      hasUnsavedDocumentsIn: (folder) => this.hasUnsavedDocumentsIn(folder),
      onChange: () => this.publish(this.composeSnapshot(this.snapshot.notice)),
      onSwitched: async () => {
        await this.notesLocationActions?.check();
        await this.showNotesIndex();
        this.refreshPathStatuses({ isForced: true });
      },
    });
  }

  private hasUnsavedDocumentsIn(folder: string): boolean {
    return [...this.editing.unsavedKeys()].some((key) => isInsideFolder(key, folder));
  }

  /** Files of a notes folder are being copied, so closing the window asks first. */
  isCopyingNotes(): boolean {
    return this.notesMoveActions?.isCopying() ?? false;
  }

  /** Whether the window may close now; while notes are copied the user is asked first. */
  confirmClosingDuringNotesMove(): Promise<boolean> {
    return this.notesMoveActions?.confirmClosing() ?? Promise.resolve(true);
  }

  private showMoveNotice(notice: MoveNotice, commands: readonly NotesMoveCommand[] = []): void {
    const { translator } = this.dependencies;
    const actions = commands.map((command) => ({
      label: translator.translate(MOVE_NOTICE_ACTION_LABELS[command.kind]),
      command,
    }));
    this.showNotice(notice.key, notice.values, actions);
  }

  /** Whether a document lies in a notes folder being moved, which nothing may change until it ends. */
  private isInMovingNotes(canonicalKey: string): boolean {
    return this.notesMoveActions?.isReadOnly(canonicalKey) ?? false;
  }

  private refuseWhileNotesMove(): boolean {
    const shown = this.dependencies.session.shownWorkspace();
    const location = shown ? notesLocationOf(shown) : undefined;
    if (!location || !this.isInMovingNotes(location.canonicalKey)) return false;
    this.showNotice('notesLocation.move.readOnly');
    return true;
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

  private async runSpecViewerCommand(command: SpecViewerCommand): Promise<void> {
    const { session, renderer, translator } = this.dependencies;
    if (command.kind === 'refreshSpecProjects') {
      await this.specViewerActions?.refresh();
      return;
    }
    if (command.kind === 'followSpecLink') {
      await this.followSpecLink(command);
      return;
    }
    if (command.kind === 'openSpecFinding') {
      await this.openDocumentAtLine(command.documentPath, command.line);
      return;
    }
    if (command.kind !== 'openSpecPreview') {
      const location = viewLocationFor(this.specViewerActions?.view(), command, translator);
      if (location) session.openView(location);
      return;
    }
    const actions = this.specViewerActions;
    const opened = actions ? await specPreviewFor(command, { actions, renderer, translator }) : undefined;
    if (!opened) return;
    this.specPreviews.set(opened.location.canonicalKey, opened.preview);
    session.openView(opened.location);
  }

  /** Follows a linked folder only after the user agrees in a system dialog that names its real target. */
  private async followSpecLink(command: FollowSpecLinkCommand): Promise<void> {
    const actions = this.specViewerActions;
    const scanned = actions?.view()?.roots?.find((root) => root.root.canonicalKey === command.rootKey);
    if (!actions || !scanned) return;
    try {
      await actions.followLink(scanned.root.displayPath, command.linkPath);
    } catch (error) {
      this.showOpenFailure(error, command.linkPath);
    }
  }

  /** Opens a document at the heading that holds a line, as the viewer shows headings, not lines. */
  private async openDocumentAtLine(documentPath: string, line: number | undefined): Promise<void> {
    await this.openDocuments([documentPath]);
    const outline = this.activeDocument?.outline ?? [];
    const heading = line === undefined ? undefined : outline.filter((entry) => entry.line <= line - 1).at(-1);
    if (heading) this.revealLinkedHeading(`#${heading.id}`);
  }

  /** Documents are never changed from a Spec viewer workspace, so its files stay as agents wrote them. */
  private isSpecViewerShown(): boolean {
    return this.dependencies.session.shownWorkspace()?.kindId === 'specViewer';
  }

  /** A Spec viewer workspace's folders are scanned again only when the workspace or its folders change. */
  private showSpecProjects(): void {
    const actions = this.specViewerActions;
    if (!actions) return;
    const { session } = this.dependencies;
    const shown = session.shownWorkspace();
    const folderPaths = session
      .currentState()
      .explorerFolders.folders()
      .map((folder) => folder.displayPath);
    const key = shown?.kindId === 'specViewer' ? JSON.stringify([shown.id, folderPaths]) : undefined;
    if (key === this.shownSpecFoldersKey) return;
    this.shownSpecFoldersKey = key;
    if (key === undefined) actions.hide();
    else void actions.show(folderPaths);
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
      focusWindowShowing: this.dependencies.appWindows
        ? (workspaceId) =>
            this.dependencies.appWindows?.focusWindowShowing(workspaceId) ?? Promise.resolve(false)
        : undefined,
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
    this.showSpecProjects();
  }

  private createDocumentAttachments(): DocumentAttachments | undefined {
    const { attachments, session, translator } = this.dependencies;
    if (!attachments) return undefined;
    return new DocumentAttachments(session, attachments, {
      isEditing: () => this.editingActions.isActiveDocumentEditing(),
      insertLinks: (links, place) => this.editingActions.insertPictureLinks(links, place),
      notify: (key, values) => this.showNotice(key, values),
      askToSaveFirst: () =>
        this.showNotice('attachments.saveFirst', undefined, [
          { label: translator.translate('menu.file.saveAs'), command: { kind: 'saveDocumentAs' } },
        ]),
    });
  }

  /** Saves a picture pasted into the editor; undefined when it cannot be added. */
  pastePicture(bytes: Uint8Array): Promise<string | undefined> {
    const active = this.dependencies.session.currentState().tabStrip.activeTab()?.location;
    if (active && this.isInMovingNotes(active.canonicalKey)) {
      this.showNotice('notesLocation.move.readOnly');
      return Promise.resolve(undefined);
    }
    return this.documentAttachments?.pastePicture(bytes) ?? Promise.resolve(undefined);
  }

  /** The Image button: chosen picture files are copied next to the active document and linked at the caret. */
  addPictureFiles(): Promise<void> {
    const filterName = this.dependencies.translator.translate('attachments.pictureFilter');
    return this.documentAttachments?.addPictureFiles(filterName) ?? Promise.resolve();
  }

  async start(): Promise<void> {
    const { session, requests, appWindows } = this.dependencies;
    const restoreOutcome = await session.restore(await appWindows?.startupWorkspaceId());
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
    if (this.specViewerActions) this.stopActions.push(this.specViewerActions.start());
    if (this.documentAttachments) this.stopActions.push(this.documentAttachments.start());
    if (this.notesMoveActions) this.stopActions.push(this.notesMoveActions.start());
    await this.openDocuments(await requests.takeStartupDocuments());
    await this.refreshActiveDocument();
    await this.notesLocationActions?.check();
    await this.showNotesIndex();
    this.showSpecProjects();
    await this.notesMoveActions?.offerUnfinishedMoves();
    await this.offerWorkspaceFiles();
    if (this.appWindowActions) this.stopActions.push(await this.appWindowActions.start());
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
    this.injectionChecks.stop();
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
    if (!location || !hasFile(location)) return;
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

  /** Sanitized HTML for a block of an open document, its pictures and links resolved as its preview resolves them. */
  renderDocumentBlock(canonicalKey: string, markdown: string): string {
    const document = this.dependencies.session.openedDocument(canonicalKey);
    if (!document) return this.renderPreview(markdown);
    return this.dependencies.renderer.render(markdown, {
      resolveResourceUrl: this.resourceResolverFor(document.location),
      ...this.notesRenderingFor(document.location),
    }).html;
  }

  private resourceResolverFor(location: DocumentLocation): ResourceUrlResolver {
    const { resources } = this.dependencies;
    return (source) =>
      isUntitledLocation(location) ? undefined : resources?.imageUrl(location.displayPath, source);
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
    if (!activeLocation || !hasFile(activeLocation)) return;
    if (link.kind === 'unresolvedNote') {
      this.notesActions?.offerNoteFor(link.href, activeLocation);
      return;
    }
    if (!links || (await this.asksBeforeLeavingGrantedFolders(activeLocation.displayPath, link.href))) {
      return;
    }
    await this.openDocumentLink(activeLocation.displayPath, link.href);
  }

  async answerOutsideLink(shouldOpen: boolean): Promise<void> {
    const request = this.outsideLinkRequest;
    this.outsideLinkRequest = undefined;
    this.publish(this.composeSnapshot(this.snapshot.notice));
    if (shouldOpen && request) {
      await this.openDocumentLink(request.documentPath, request.href, request.targetPath);
    }
  }

  private async openDocumentLink(documentPath: string, href: string, expectedTarget?: string): Promise<void> {
    const { links } = this.dependencies;
    if (!links) return;
    try {
      await this.openDocuments([await links.resolveDocumentLink(documentPath, href, expectedTarget)]);
      this.revealLinkedHeading(href);
    } catch (error) {
      this.showOpenFailure(error, href);
    }
  }

  /**
   * A Spec viewer workspace reads only granted folders unless the user agrees to follow a link out of them;
   * the app resolves the link, through any folder links, and names the document it really leads to.
   */
  private async asksBeforeLeavingGrantedFolders(documentPath: string, href: string): Promise<boolean> {
    const { links } = this.dependencies;
    if (!links || !this.isSpecViewerShown()) return false;
    const inspected = await links.inspectDocumentLink(documentPath, href).catch(() => undefined);
    if (!inspected || inspected.isGranted) return false;
    this.outsideLinkRequest = { documentPath, href, targetPath: inspected.path };
    this.publish(this.composeSnapshot(this.snapshot.notice));
    return true;
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

  private specRenderingFor(location: DocumentLocation): Pick<RenderOptions, 'specStructure'> {
    if (!this.isSpecViewerShown()) return {};
    const specStructure = this.specDocumentRenderings.renderingFor(location);
    return specStructure ? { specStructure } : {};
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
    if (this.isSpecViewerShown() && isRefusedInReadOnlyWorkspace(command)) {
      this.showNotice('specViewer.readOnly');
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
    if (isNotesMoveCommand(command)) return this.runNotesMoveCommand(command);
    if (isNotesCommand(command)) return this.runNotesCommand(command);
    if (isSpecViewerCommand(command)) return this.runSpecViewerCommand(command);
    if (isWorkspaceFileCommand(command)) return this.runWorkspaceFileCommand(command);
    if (isWorkspaceCommand(command)) return this.workspaceActions.run(command);
    if (isInjectionCheckCommand(command)) return this.runInjectionCheckCommand(command);
    return undefined;
  }

  /** Change Location starts from Settings, which closes so the folder picker and the plan can show. */
  private async runNotesMoveCommand(command: NotesMoveCommand): Promise<void> {
    if (command.kind === 'changeNotesLocation') this.openDialog = undefined;
    await this.notesMoveActions?.run(command);
  }

  private async runNotesCommand(command: NotesCommand): Promise<void> {
    if (this.refuseWhileNotesMove()) return;
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
    refreshFolders: () => {
      this.folderRefresh.refreshShownFolders();
      void this.specViewerActions?.refresh();
    },
    toggleEditing: () => {
      this.editingActions.toggleActiveDocument();
      const location = this.editedLocation();
      if (location) this.editingModes.explainSourceFor(location);
    },
    toggleEditingMode: () => this.editingModes.toggleMode(),
    setEditingMode: ({ editingMode }) => this.editingModes.changeMode(editingMode),
    togglePreviewBesideEditor: () => this.togglePreviewBesideEditor(),
    newDocument: () => this.openNewDocument(),
    goBack: () => this.navigation.goBack(),
    goForward: () => this.navigation.goForward(),
    copyPath: ({ path }) => this.copyPath(path),
    revealInFileManager: ({ path }) => this.revealInFileManager(path),
    toggleFullScreen: () => this.dependencies.desktopShell?.toggleFullScreen(),
    openNewWindow: () => this.openNewWindow(),
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
    editProperty: ({ canonicalKey, edit }) => this.editProperty(canonicalKey, edit),
    editPropertiesInNote: () => this.editingActions.editActiveDocumentFromStart(),
    reloadFromDisk: ({ canonicalKey }) => this.editingActions.reloadFromDisk(canonicalKey),
    overwriteChangesOnDisk: ({ canonicalKey }) => this.saving.overwriteChangesOnDisk(canonicalKey),
    print: () => {
      if (!this.activeDocument) return;
      if (this.editingActions.isActiveDocumentEditing()) {
        this.dependencies.printer?.printActiveDocument();
        return;
      }
      this.printRequest += 1;
      this.publish(this.composeSnapshot(this.snapshot.notice));
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
    const {
      theme,
      readingWidth,
      typography,
      editingMode,
      isStatusBarVisible,
      isPreviewBesideEditor,
      isShowingHiddenCharacters,
    } = viewSettings;
    const state = {
      theme,
      readingWidth,
      typography,
      editingMode,
      isSidebarVisible: isSidebarViewShown(viewSettings, 'explorer'),
      isOutlineVisible: isSidebarViewShown(viewSettings, 'outline'),
      isStatusBarVisible,
      isSourceView: this.isSourceView,
      isPreviewBesideEditor,
      isShowingHiddenCharacters,
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
      (location) => hasFile(location),
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
  searchFolders(
    query: string,
    options: TextSearchOptions,
    specFilter: SpecSearchFilter = DEFAULT_SPEC_SEARCH_FILTER,
  ): Promise<FolderSearchResults> {
    if (this.notesIndexActions?.isShown()) return this.notesIndexActions.search(query);
    if (this.specViewerActions && this.isSpecViewerShown()) {
      return this.specViewerActions.searchDocuments(query, options, specFilter);
    }
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
    if (this.isInMovingNotes(canonicalKey)) return;
    this.editingActions.updateText(canonicalKey, text);
    this.injectionChecks.textEdited(canonicalKey, text);
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
    if (!location || !hasFile(location)) return;
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
    await this.dependencies.notesMoves?.clearMoves();
    this.notesMoveActions?.forgetMoves();
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
    if (!activeTab || !hasFile(activeTab.location)) return;
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
    this.showSpecProjects();
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
    this.injectionChecks.viewChanged();
    this.appWindowActions?.reportState();
    void this.refreshActiveDocument();
  }

  private createAppWindowActions(): AppWindowActions | undefined {
    const { appWindows, session } = this.dependencies;
    if (!appWindows) return undefined;
    return new AppWindowActions({
      appWindows,
      session,
      showWorkspace: (workspaceId) =>
        this.workspaceActions.switchTo(workspaceId, { mayFocusOtherWindow: false }),
      showNotice: (key) => this.showNotice(key),
      saveNow: () => this.saveNow(),
    });
  }

  private async openNewWindow(): Promise<void> {
    await this.appWindowActions?.openNewWindow();
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
    const specPreparation = this.specPreparationFor(document);
    if (specPreparation) await specPreparation;
    const text = document ? this.textShownFor(document) : undefined;
    const shouldMarkSourceLines = this.isPreviewBesideEditor();
    const noteList = this.notesActions?.noteListVersion();
    const specRendering = this.specDocumentRenderings.version();
    if (!this.isRenderUpToDate({ document, text, shouldMarkSourceLines, noteList, specRendering })) {
      this.renderedSpecRendering = specRendering;
      this.renderedNoteList = noteList;
      this.renderedDocument = document;
      this.renderedText = text;
      this.hasRenderedSourceLines = shouldMarkSourceLines;
      this.activeDocument = this.renderedActiveDocument(document, text, shouldMarkSourceLines);
      this.publish(this.composeSnapshot(this.snapshot.notice));
    }
    this.injectionChecks.documentShown(document, text);
  }

  private renderedActiveDocument(
    document: OpenedDocument | undefined,
    text: string | undefined,
    shouldMarkSourceLines: boolean,
  ): RenderedActiveDocument | undefined {
    return document && text !== undefined ? this.render(document, text, shouldMarkSourceLines) : undefined;
  }

  private isRenderUpToDate(next: {
    readonly document: OpenedDocument | undefined;
    readonly text: string | undefined;
    readonly shouldMarkSourceLines: boolean;
    readonly noteList: object | undefined;
    readonly specRendering: object | undefined;
  }): boolean {
    return (
      next.document === this.renderedDocument &&
      next.text === this.renderedText &&
      next.shouldMarkSourceLines === this.hasRenderedSourceLines &&
      next.noteList === this.renderedNoteList &&
      next.specRendering === this.renderedSpecRendering
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
    const isUntitled = isUntitledLocation(document.location);
    const { html, outline, frontMatter } = this.dependencies.renderer.render(text, {
      resolveResourceUrl: this.resourceResolverFor(document.location),
      includeSourceLines: shouldMarkSourceLines,
      ...this.notesRenderingFor(document.location),
      ...this.specRenderingFor(document.location),
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
      ...this.propertiesEditabilityPart(document.location, text, frontMatter),
    };
  }

  private propertiesEditabilityPart(
    location: DocumentLocation,
    text: string,
    frontMatter: string | undefined,
  ): Pick<RenderedActiveDocument, 'propertiesEditability'> {
    if (frontMatter === undefined || isUntitledLocation(location) || !this.notesActions?.isNote(location)) {
      return {};
    }
    return { propertiesEditability: propertiesEditabilityOf(text, frontMatter) };
  }

  private propertySavingPart(): Pick<ViewerSnapshot, 'propertySavingKey'> {
    const propertySavingKey = this.propertyEditing.noteBeingSaved();
    return propertySavingKey === undefined ? {} : { propertySavingKey };
  }

  private async editProperty(canonicalKey: string, edit: FrontMatterEdit): Promise<void> {
    if (this.isInMovingNotes(canonicalKey)) {
      this.showNotice('notesLocation.move.readOnly');
      return;
    }
    const outcome = await this.propertyEditing.editProperty(canonicalKey, edit);
    this.publish(this.composeSnapshot(this.snapshot.notice));
    const fileName = this.dependencies.session.openedDocument(canonicalKey)?.location.fileName ?? '';
    if (outcome === 'refusedUnsavedChanges') {
      this.showNotice('document.properties.refused.unsavedChanges', { name: fileName });
    } else if (outcome === 'refusedCannotEdit') {
      this.showNotice('document.properties.refused.cannotEdit', { name: fileName });
    }
  }

  private composeSnapshot(notice: string | undefined): ViewerSnapshot {
    return {
      viewer: this.dependencies.session.currentState(),
      pathStatuses: this.pathStatuses,
      folderRevisions: this.folderRefresh.revisionsByFolder(),
      unsavedDocumentKeys: this.editing.unsavedKeys(),
      ...this.propertySavingPart(),
      ...(this.editingActions.isActiveDocumentEditing() ? { isActiveDocumentEditing: true } : {}),
      ...this.editingModePart(),
      ...this.editorRequestPart(),
      ...(this.activeDocument ? { activeDocument: this.activeDocument } : {}),
      ...(notice === undefined ? {} : { notice }),
      ...(notice !== undefined && this.noticeActions.length > 0 ? { noticeActions: this.noticeActions } : {}),
      ...(this.openDialog === undefined ? {} : { openDialog: this.openDialog }),
      ...this.documentRequestsPart(),
      ...this.linkRequestsPart(),
      ...(this.linkedHeadingRequest ? { linkedHeadingRequest: this.linkedHeadingRequest } : {}),
      ...(this.isSourceView ? { isSourceView: true } : {}),
      ...this.unsavedChangesPart(),
      ...this.workspacesPart(),
      ...this.notesPart(),
      ...this.specProjectsPart(),
      ...this.injectionCheckPart(),
      ...this.notesMovePart(),
    };
  }

  private notesMovePart(): Pick<
    ViewerSnapshot,
    'notesMoveDialog' | 'notesMoveStatus' | 'isActiveDocumentReadOnly'
  > {
    const actions = this.notesMoveActions;
    if (!actions) return {};
    const dialog = actions.dialogShown();
    const status = actions.statusShown();
    const activeKey = this.dependencies.session.currentState().tabStrip.activeTab()?.location.canonicalKey;
    return {
      ...(dialog ? { notesMoveDialog: dialog } : {}),
      ...(status ? { notesMoveStatus: notesMoveStatusText(status, this.dependencies.translator) } : {}),
      ...(activeKey !== undefined && this.isInMovingNotes(activeKey)
        ? { isActiveDocumentReadOnly: true }
        : {}),
    };
  }

  /** The check and an outlined range belong to the shown document only. */
  private injectionCheckPart(): Pick<
    ViewerSnapshot,
    'injectionCheck' | 'sourceRangeRequest' | 'isRevealingFinding'
  > {
    const shownKey = this.activeDocument?.canonicalKey;
    const injectionCheck = this.injectionChecks.view();
    const sourceRangeRequest = this.sourceRangeRequest;
    return {
      ...(shownKey !== undefined && this.revealedFindingKey === shownKey ? { isRevealingFinding: true } : {}),
      ...(injectionCheck && injectionCheck.documentKey === shownKey ? { injectionCheck } : {}),
      ...(sourceRangeRequest && sourceRangeRequest.canonicalKey === shownKey ? { sourceRangeRequest } : {}),
    };
  }

  private editingModePart(): Pick<ViewerSnapshot, 'editingMode' | 'editingModeAnnouncement'> {
    const location = this.editedLocation();
    const announcement = this.editingModes.announcement();
    return {
      ...(location ? { editingMode: this.editingModes.modeFor(location.canonicalKey) } : {}),
      ...(announcement ? { editingModeAnnouncement: announcement } : {}),
    };
  }

  /** The active document while it is open in the editor. */
  private editedLocation(): DocumentLocation | undefined {
    if (!this.editingActions.isActiveDocumentEditing()) return undefined;
    return this.dependencies.session.currentState().tabStrip.activeTab()?.location;
  }

  private specProjectsPart(): Pick<ViewerSnapshot, 'specProjects' | 'specPreviews'> {
    const specProjects = this.specViewerActions?.view();
    const previews = this.specPreviews.size > 0 ? { specPreviews: this.specPreviews } : {};
    return specProjects ? { specProjects, ...previews } : previews;
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

  private linkRequestsPart(): Pick<ViewerSnapshot, 'externalLinkRequest' | 'outsideLinkRequest'> {
    return {
      ...(this.externalLinkRequest === undefined ? {} : { externalLinkRequest: this.externalLinkRequest }),
      ...(this.outsideLinkRequest ? { outsideLinkRequest: this.outsideLinkRequest } : {}),
    };
  }

  private documentRequestsPart(): Pick<
    ViewerSnapshot,
    | 'findRequest'
    | 'findQuery'
    | 'copyAsHtmlRequest'
    | 'exportRequest'
    | 'printRequest'
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
      ...(this.printRequest > 0 ? { printRequest: this.printRequest } : {}),
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
