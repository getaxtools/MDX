import { invoke } from '@tauri-apps/api/core';
import type {
  DocumentLocation,
  FolderListing,
  OpenedDocument,
  PathStatus,
  SaveSource,
  ViewMenuState,
} from '@mdx/platform';
import type { AppInfo } from '@mdx/ui';

export const tauriCommands = {
  openDocument: (path: string, encoding?: string) =>
    invoke<OpenedDocument>('open_document', { path, encoding: encoding ?? null }),
  saveDocumentAs: (source: SaveSource) => invoke<string | null>('save_document_as', { source }),
  pickDocuments: () => invoke<string[]>('pick_documents'),
  checkPathStatuses: (paths: readonly string[]) => invoke<PathStatus[]>('check_path_statuses', { paths }),
  takeStartupDocuments: () => invoke<string[]>('take_startup_documents'),
  loadAppState: () => invoke<string | null>('load_app_state'),
  saveAppState: (stateJson: string) => invoke<null>('save_app_state', { stateJson }),
  getAppInfo: () => invoke<AppInfo>('get_app_info'),
  updateViewMenu: (state: ViewMenuState) => invoke<null>('update_view_menu', { state }),
  updateRecentMenu: (displayPaths: readonly string[]) => invoke<null>('update_recent_menu', { displayPaths }),
  watchDocuments: (paths: readonly string[]) => invoke<null>('watch_documents', { paths }),
  watchFolders: (paths: readonly string[]) => invoke<null>('watch_folders', { paths }),
  resolveDocumentLink: (document: string, href: string) =>
    invoke<string>('resolve_document_link', { document, href }),
  openExternalLink: (url: string) => invoke<null>('open_external_link', { url }),
  pickFolder: () => invoke<DocumentLocation | null>('pick_folder'),
  listFolderContents: (folder: string) => invoke<FolderListing>('list_folder_contents', { folder }),
  exportFavourites: (contents: string, suggestedFileName: string) =>
    invoke<string | null>('export_favourites', { contents, suggestedFileName }),
  importFavourites: () => invoke<string | null>('import_favourites'),
};

export const OPEN_DOCUMENTS_EVENT = 'open-documents';
export const MENU_COMMAND_EVENT = 'menu-command';
export const DOCUMENTS_CHANGED_EVENT = 'documents-changed';
export const FOLDERS_CHANGED_EVENT = 'folders-changed';
