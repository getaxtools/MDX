import { invoke } from '@tauri-apps/api/core';
import type { OpenedDocument, PathStatus } from '@mdx/platform';

export const tauriCommands = {
  openDocument: (path: string) => invoke<OpenedDocument>('open_document', { path }),
  pickDocuments: () => invoke<string[]>('pick_documents'),
  checkPathStatuses: (paths: readonly string[]) => invoke<PathStatus[]>('check_path_statuses', { paths }),
  takeStartupDocuments: () => invoke<string[]>('take_startup_documents'),
  loadAppState: () => invoke<string | null>('load_app_state'),
  saveAppState: (stateJson: string) => invoke<null>('save_app_state', { stateJson }),
};

export const OPEN_DOCUMENTS_EVENT = 'open-documents';
