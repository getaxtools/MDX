import { invoke } from '@tauri-apps/api/core';
import type {
  AppliedLinkUpdates,
  AttachmentTarget,
  ExportFolderChoice,
  NotesExportOutcome,
  NotesExportRequest,
  NotesImportReport,
  NotesImportRequest,
  WindowStateReport,
  Backlink,
  DocumentLocation,
  EditedDocumentSave,
  ExportFormat,
  FolderListing,
  FolderSearchResults,
  KnownFolders,
  LinkUpdatePlan,
  LinkUpdatesToApply,
  LocationAvailability,
  NotesFolderInspection,
  KeptFiles,
  NotesMovePlan,
  NotesMoveRequest,
  OldCopyRemoval,
  OldNotesCopy,
  UnfinishedNotesMove,
  NoteCreation,
  NoteDeletion,
  NoteInFolder,
  NoteMove,
  NoteMoveInLocation,
  NoteRename,
  NoteRestore,
  NoteSearchResults,
  NoteHeading,
  NoteSuggestion,
  NoteTrashEntry,
  PreparedNotesLocation,
  OpenedDocument,
  PathStatus,
  RecentWorkspaceMenuEntry,
  SaveSource,
  StoredWorkspace,
  ShownNotesIndex,
  SpecProjectManifest,
  InspectedLink,
  JumpListAnswer,
  JumpListWorkspace,
  WatchedSpecProject,
  ProjectDocuments,
  TagCount,
  TextSearchOptions,
  ViewMenuState,
  WorkspaceFileContents,
} from '@mdx/platform';
import type { AppInfo } from '@mdx/ui';

/** The import with every list, session and value already turned into JSON text. */
export interface LegacyStateImportRequest {
  readonly workspace: StoredWorkspace;
  readonly lists: Readonly<Record<string, string>>;
  readonly windowId: string;
  readonly windowSession: string;
  readonly appValues: Readonly<Record<string, string>>;
}

/** A workspace row as the database keeps it: kind data is JSON text. */
export type StoredWorkspaceRow = Omit<StoredWorkspace, 'kindData'> & { readonly kindData?: string | null };

/** Lists and the window session arrive as JSON text, which the desktop port parses. */
export interface StoredWorkspaceReply {
  readonly lists: Readonly<Record<string, string>>;
  readonly windowSession: string | null;
}

/** A chosen picture as the backend reports it, its failure as an error code. */
export type ChosenPictureReply =
  | { readonly kind: 'saved'; readonly relativePath: string }
  | { readonly kind: 'failed'; readonly fileName: string; readonly reason: { readonly code: string } };

interface AttachmentRequest {
  readonly documentPath: string;
  readonly attachmentFolder: string;
  readonly notesFolder?: string;
  readonly suggestedName: string;
  readonly source:
    | { readonly kind: 'droppedFile'; readonly path: string }
    | { readonly kind: 'pastedBytes'; readonly bytes: readonly number[] };
}

export const tauriCommands = {
  openDocument: (path: string, encoding?: string) =>
    invoke<OpenedDocument>('open_document', { path, encoding: encoding ?? null }),
  saveDocumentAs: (source: SaveSource) => invoke<string | null>('save_document_as', { source }),
  saveDocument: (document: EditedDocumentSave) => invoke<number>('save_document', { document }),
  pickDocuments: () => invoke<string[]>('pick_documents'),
  checkPathStatuses: (paths: readonly string[]) => invoke<PathStatus[]>('check_path_statuses', { paths }),
  takeStartupDocuments: () => invoke<string[]>('take_startup_documents'),
  loadAppState: () => invoke<string | null>('load_app_state'),
  saveAppState: (stateJson: string) => invoke<null>('save_app_state', { stateJson }),
  removeAppStateBackups: () => invoke<null>('remove_app_state_backups'),
  grantAppStateAccess: () => invoke<null>('grant_app_state_access'),
  importLegacyState: (legacyState: LegacyStateImportRequest) =>
    invoke<null>('import_legacy_state', { legacyState }),
  clearWorkspaces: () => invoke<null>('clear_workspaces'),
  pickWorkspaceExportPlace: (suggestedFileName: string) =>
    invoke<{ folder: string } | null>('pick_workspace_export_place', { suggestedFileName }),
  writeWorkspaceExport: (contents: string) => invoke<string>('write_workspace_export', { contents }),
  openWorkspaceFile: () => invoke<WorkspaceFileContents | null>('open_workspace_file'),
  takeStartupWorkspaceFile: () => invoke<WorkspaceFileContents | null>('take_startup_workspace_file'),
  grantWorkspaceAccess: (workspaceId: string) => invoke<null>('grant_workspace_access', { workspaceId }),
  loadWorkspaceRegistry: () => invoke<StoredWorkspaceRow[]>('load_workspace_registry'),
  loadWorkspace: (workspaceId: string) =>
    invoke<StoredWorkspaceReply | null>('load_workspace', { workspaceId }),
  saveWorkspace: (workspace: StoredWorkspaceRow) => invoke<null>('save_workspace', { workspace }),
  knownFolders: () => invoke<KnownFolders>('known_folders'),
  inspectNotesFolder: (path: string) => invoke<NotesFolderInspection>('inspect_notes_folder', { path }),
  prepareNotesLocation: (path: string, locationId: string) =>
    invoke<PreparedNotesLocation>('prepare_notes_location', { path, locationId }),
  checkNotesLocation: (path: string, locationId: string) =>
    invoke<LocationAvailability>('check_notes_location', { path, locationId }),
  locateNotesLocation: (path: string, locationId: string) =>
    invoke<DocumentLocation | null>('locate_notes_location', { path, locationId }),
  planNotesMove: (request: NotesMoveRequest) => invoke<NotesMovePlan>('plan_notes_move', { request }),
  runNotesMove: (locationId: string) => invoke<null>('run_notes_move', { locationId }),
  stopNotesMove: () => invoke<null>('stop_notes_move'),
  cancelNotesMove: (locationId: string) => invoke<KeptFiles>('cancel_notes_move', { locationId }),
  switchNotesMove: (locationId: string) => invoke<DocumentLocation>('switch_notes_move', { locationId }),
  finishNotesMoveSwitch: (locationId: string) =>
    invoke<OldNotesCopy>('finish_notes_move_switch', { locationId }),
  unfinishedNotesMoves: () => invoke<UnfinishedNotesMove[]>('unfinished_notes_moves'),
  keepOldNotesCopy: (locationId: string) => invoke<null>('keep_old_notes_copy', { locationId }),
  removeOldNotesCopy: (locationId: string) => invoke<OldCopyRemoval>('remove_old_notes_copy', { locationId }),
  clearNotesMoves: () => invoke<number>('clear_notes_moves'),
  createNote: (creation: NoteCreation) => invoke<DocumentLocation>('create_note', { ...creation }),
  createNoteInFolder: ({ location, folder, name, text }: NoteInFolder) =>
    invoke<DocumentLocation>('create_note_in_folder', { location, note: { folder, name, text } }),
  renameNote: (rename: NoteRename) => invoke<DocumentLocation>('rename_note', { ...rename }),
  moveNote: (move: NoteMove) => invoke<DocumentLocation>('move_note', { ...move }),
  deleteNote: (deletion: NoteDeletion) => invoke<NoteTrashEntry>('delete_note', { ...deletion }),
  listNoteTrash: (location: string) => invoke<NoteTrashEntry[]>('list_note_trash', { location }),
  restoreNote: (restore: NoteRestore) => invoke<DocumentLocation>('restore_note', { ...restore }),
  emptyNoteTrash: (location: string) => invoke<number>('empty_note_trash', { location }),
  applyNoteLinkUpdates: ({ location, updates }: LinkUpdatesToApply) =>
    invoke<AppliedLinkUpdates>('apply_note_link_updates', { location, updates }),
  pickNotesImportFolder: () => invoke<string | null>('pick_notes_import_folder'),
  importNotesFolder: (request: NotesImportRequest & { readonly knownCodeLanguages: readonly string[] }) =>
    invoke<NotesImportReport>('import_notes_folder', { request }),
  cancelNotesImport: () => invoke<null>('cancel_notes_import'),
  pickNotesExportFolder: (location: string) =>
    invoke<ExportFolderChoice>('pick_notes_export_folder', { location }),
  exportNotesToFolder: (request: NotesExportRequest) =>
    invoke<NotesExportOutcome>('export_notes_to_folder', { request }),
  showNotesIndex: (location: ShownNotesIndex) => invoke<null>('show_notes_index', { location }),
  hideNotesIndex: () => invoke<null>('hide_notes_index'),
  clearNotesIndexes: () => invoke<number>('clear_notes_indexes'),
  refreshNotesIndex: (locationId: string) => invoke<null>('refresh_notes_index', { locationId }),
  noteBacklinks: (locationId: string, notePath: string) =>
    invoke<Backlink[]>('note_backlinks', { locationId, notePath }),
  noteTags: (locationId: string) => invoke<TagCount[]>('note_tags', { locationId }),
  noteHeadings: (locationId: string, target: string, fromNote: string) =>
    invoke<NoteHeading[]>('note_headings', { locationId, target, fromNote }),
  noteSuggestions: (locationId: string, typed: string, fromNote: string) =>
    invoke<NoteSuggestion[]>('note_suggestions', { locationId, typed, fromNote }),
  planNoteLinkUpdates: (locationId: string, moved: NoteMoveInLocation) =>
    invoke<LinkUpdatePlan>('plan_note_link_updates', { locationId, moved }),
  searchNotes: (locationId: string, query: string) =>
    invoke<NoteSearchResults>('search_notes', { locationId, query }),
  scanSpecProject: (root: string, additionalLocations: readonly string[]) =>
    invoke<SpecProjectManifest>('scan_spec_project', { root, additionalLocations }),
  readSpecProjectFile: (root: string, relativePath: string) =>
    invoke<OpenedDocument>('read_spec_project_file', { root, relativePath }),
  followSpecProjectLink: (root: string, linkPath: string) =>
    invoke<boolean>('follow_spec_project_link', { link: { root, linkPath } }),
  searchSpecProjectDocuments: (documents: ProjectDocuments, query: string, options: TextSearchOptions) =>
    invoke<FolderSearchResults>('search_spec_project_documents', { documents, query, options }),
  deleteWorkspace: (workspaceId: string) => invoke<null>('delete_workspace', { workspaceId }),
  saveWorkspaceList: (workspaceId: string, listName: string, valueJson: string) =>
    invoke<null>('save_workspace_list', { workspaceId, listName, valueJson }),
  saveWindowSession: (workspaceId: string, sessionJson: string) =>
    invoke<null>('save_window_session', { workspaceId, sessionJson }),
  loadAppValues: () => invoke<Record<string, string>>('load_app_values'),
  saveAppValue: (key: string, valueJson: string) => invoke<null>('save_app_value', { key, valueJson }),
  getAppInfo: () => invoke<AppInfo>('get_app_info'),
  windowStartupWorkspace: () => invoke<string | null>('window_startup_workspace'),
  takeStartupWorkspaceNotice: () => invoke<boolean>('take_startup_workspace_notice'),
  openNewWindow: () => invoke<null>('open_new_window'),
  closeCancelled: () => invoke<null>('close_cancelled'),
  reportWindowState: (state: WindowStateReport) => invoke<null>('report_window_state', { state }),
  focusWindowShowing: (workspaceId: string) => invoke<boolean>('focus_window_showing', { workspaceId }),
  updateViewMenu: (state: ViewMenuState) => invoke<null>('update_view_menu', { state }),
  updateRecentMenu: (displayPaths: readonly string[], workspaces: readonly RecentWorkspaceMenuEntry[]) =>
    invoke<null>('update_recent_menu', { displayPaths, workspaces }),
  updateMenuLanguage: (labels: Readonly<Record<string, string>>) =>
    invoke<null>('update_menu_language', { labels }),
  updateMenuShortcuts: (shortcuts: Readonly<Record<string, string>>) =>
    invoke<null>('update_menu_shortcuts', { shortcuts }),
  saveAttachment: (request: AttachmentRequest) =>
    invoke<{ relativePath: string }>('save_attachment', { request }),
  addPictureFiles: (request: AttachmentTarget & { readonly filterName: string }) =>
    invoke<ChosenPictureReply[]>('add_picture_files', { request }),
  watchDocuments: (paths: readonly string[]) => invoke<null>('watch_documents', { paths }),
  watchFolders: (paths: readonly string[]) => invoke<null>('watch_folders', { paths }),
  showJumpListWorkspaces: (category: string, workspaces: readonly JumpListWorkspace[]) =>
    invoke<JumpListAnswer>('show_jump_list_workspaces', { category, workspaces }),
  watchSpecProjects: (projects: readonly WatchedSpecProject[], additionalLocations: readonly string[]) =>
    invoke<null>('watch_spec_projects', { projects, additionalLocations }),
  resolveDocumentLink: (document: string, href: string, expectedTarget?: string) =>
    invoke<string>('resolve_document_link', { document, href, expectedTarget }),
  inspectDocumentLink: (document: string, href: string) =>
    invoke<InspectedLink>('inspect_document_link', { document, href }),
  openExternalLink: (url: string) => invoke<null>('open_external_link', { url }),
  revealInFileManager: (path: string) => invoke<null>('reveal_in_file_manager', { path }),
  readClipboardText: () => invoke<string>('read_clipboard_text'),
  toggleFullScreen: () => invoke<null>('toggle_full_screen'),
  setWindowTitle: (title: string) => invoke<null>('set_window_title', { title }),
  pickFolder: () => invoke<DocumentLocation | null>('pick_folder'),
  listFolderContents: (folder: string) => invoke<FolderListing>('list_folder_contents', { folder }),
  findFolderDocuments: (folders: readonly string[]) =>
    invoke<DocumentLocation[]>('find_folder_documents', { folders }),
  searchFolderDocuments: (folders: readonly string[], query: string, options: TextSearchOptions) =>
    invoke<FolderSearchResults>('search_folder_documents', { folders, query, options }),
  exportFavourites: (contents: string, suggestedFileName: string) =>
    invoke<string | null>('export_favourites', { contents, suggestedFileName }),
  importFavourites: () => invoke<string | null>('import_favourites'),
  exportDocument: (contents: string, suggestedFileName: string, format: ExportFormat) =>
    invoke<string | null>('export_document', { contents, suggestedFileName, format }),
};

export const OPEN_DOCUMENTS_EVENT = 'open-documents';
export const OPEN_WORKSPACE_FILE_EVENT = 'open-workspace-file';
export const IMAGES_DROPPED_EVENT = 'images-dropped';
export const MENU_COMMAND_EVENT = 'menu-command';
export const DOCUMENTS_CHANGED_EVENT = 'documents-changed';
export const FOLDERS_CHANGED_EVENT = 'folders-changed';
export const SPEC_PROJECTS_CHANGED_EVENT = 'spec-projects-changed';
export const NOTES_INDEX_STATUS_EVENT = 'notes-index-status';
export const NOTES_IMPORT_PROGRESS_EVENT = 'notes-import-progress';
export const NOTES_INDEX_CHANGES_EVENT = 'notes-index-changes';
export const NOTES_MOVE_PROGRESS_EVENT = 'notes-move-progress';
export const WORKSPACE_LIST_CHANGED_EVENT = 'workspace-list-changed';
export const SHOW_WORKSPACE_EVENT = 'show-workspace';
export const WORKSPACE_NOT_FOUND_EVENT = 'workspace-not-found';
export const WORKSPACE_DELETED_EVENT = 'workspace-deleted';
