import { invoke } from '@tauri-apps/api/core';
import type {
  DocumentLocation,
  EditedDocumentSave,
  ExportFormat,
  FolderListing,
  FolderSearchResults,
  OpenedDocument,
  PathStatus,
  SaveSource,
  StoredWorkspace,
  TextSearchOptions,
  ViewMenuState,
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

/** Lists and the window session arrive as JSON text, which the desktop port parses. */
export interface StoredWorkspaceReply {
  readonly lists: Readonly<Record<string, string>>;
  readonly windowSession: string | null;
}

interface AttachmentRequest {
  readonly documentPath: string;
  readonly attachmentFolder: string;
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
  grantWorkspaceAccess: (workspaceId: string, windowId: string) =>
    invoke<null>('grant_workspace_access', { workspaceId, windowId }),
  loadWorkspaceRegistry: () => invoke<StoredWorkspace[]>('load_workspace_registry'),
  loadWorkspace: (workspaceId: string, windowId: string) =>
    invoke<StoredWorkspaceReply | null>('load_workspace', { workspaceId, windowId }),
  saveWorkspace: (workspace: StoredWorkspace) => invoke<null>('save_workspace', { workspace }),
  deleteWorkspace: (workspaceId: string) => invoke<null>('delete_workspace', { workspaceId }),
  saveWorkspaceList: (workspaceId: string, listName: string, valueJson: string) =>
    invoke<null>('save_workspace_list', { workspaceId, listName, valueJson }),
  saveWindowSession: (windowId: string, workspaceId: string, sessionJson: string) =>
    invoke<null>('save_window_session', { windowId, workspaceId, sessionJson }),
  loadAppValues: () => invoke<Record<string, string>>('load_app_values'),
  saveAppValue: (key: string, valueJson: string) => invoke<null>('save_app_value', { key, valueJson }),
  getAppInfo: () => invoke<AppInfo>('get_app_info'),
  updateViewMenu: (state: ViewMenuState) => invoke<null>('update_view_menu', { state }),
  updateRecentMenu: (displayPaths: readonly string[]) => invoke<null>('update_recent_menu', { displayPaths }),
  updateMenuLanguage: (labels: Readonly<Record<string, string>>) =>
    invoke<null>('update_menu_language', { labels }),
  updateMenuShortcuts: (shortcuts: Readonly<Record<string, string>>) =>
    invoke<null>('update_menu_shortcuts', { shortcuts }),
  saveAttachment: (request: AttachmentRequest) =>
    invoke<{ relativePath: string }>('save_attachment', { request }),
  watchDocuments: (paths: readonly string[]) => invoke<null>('watch_documents', { paths }),
  watchFolders: (paths: readonly string[]) => invoke<null>('watch_folders', { paths }),
  resolveDocumentLink: (document: string, href: string) =>
    invoke<string>('resolve_document_link', { document, href }),
  openExternalLink: (url: string) => invoke<null>('open_external_link', { url }),
  revealInFileManager: (path: string) => invoke<null>('reveal_in_file_manager', { path }),
  toggleFullScreen: () => invoke<null>('toggle_full_screen'),
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
export const IMAGES_DROPPED_EVENT = 'images-dropped';
export const MENU_COMMAND_EVENT = 'menu-command';
export const DOCUMENTS_CHANGED_EVENT = 'documents-changed';
export const FOLDERS_CHANGED_EVENT = 'folders-changed';
