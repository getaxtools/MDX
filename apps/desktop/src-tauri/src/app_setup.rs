use std::path::PathBuf;
use std::sync::Arc;

use tauri::{App, AppHandle, Emitter, Manager};

use crate::attachments::DroppedImages;
use crate::documents::DocumentAccessList;
use crate::live_reload::{
    DOCUMENTS_CHANGED_EVENT, DocumentWatcher, FOLDERS_CHANGED_EVENT, FolderWatcher,
};
use crate::notes_index::NotesIndexes;
use crate::open_requests::{
    MAIN_WINDOW_LABEL, StartupDocuments, StartupWorkspaceFile, grant_documents,
    markdown_paths_from_arguments, workspace_file_from_arguments,
};
use crate::storage::{AppStateStore, PendingWorkspaceExport, WorkspaceDatabase};

const DATA_FOLDER_OVERRIDE_VARIABLE: &str = "MDX_DATA_DIR";
const NOTES_INDEX_FOLDER_NAME: &str = "notes-index";

pub fn initialize(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let data_folder = data_folder(app)?;
    let store = AppStateStore::new(&data_folder);
    let access = Arc::new(DocumentAccessList::default());

    let arguments: Vec<String> = std::env::args().collect();
    let working_folder = std::env::current_dir().unwrap_or_default();
    let startup_paths = markdown_paths_from_arguments(&arguments, &working_folder);
    let startup_documents = StartupDocuments::new(grant_documents(&startup_paths, &access));
    let startup_workspace_file =
        StartupWorkspaceFile::new(workspace_file_from_arguments(&arguments, &working_folder));

    app.manage(store);
    app.manage(WorkspaceDatabase::new(&data_folder));
    app.manage(PendingWorkspaceExport::default());
    app.manage(access);
    app.manage(startup_documents);
    app.manage(startup_workspace_file);
    app.manage(Arc::new(DroppedImages::default()));
    app.manage(start_document_watcher(app.handle().clone()));
    app.manage(start_folder_watcher(app.handle().clone()));
    app.manage(Arc::new(NotesIndexes::new(notes_index_folder(app)?)));
    Ok(())
}

fn start_document_watcher(app: AppHandle) -> DocumentWatcher {
    DocumentWatcher::start(move |display_paths| {
        if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
            let _ = window.emit(DOCUMENTS_CHANGED_EVENT, display_paths);
        }
    })
}

fn start_folder_watcher(app: AppHandle) -> FolderWatcher {
    FolderWatcher::start(move |folder_paths| {
        if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
            let _ = window.emit(FOLDERS_CHANGED_EVENT, folder_paths);
        }
    })
}

/// Notes indexes are rebuilt from the notes, so they stay on this computer instead of roaming.
fn notes_index_folder(app: &App) -> Result<PathBuf, tauri::Error> {
    if cfg!(debug_assertions)
        && let Some(override_folder) = std::env::var_os(DATA_FOLDER_OVERRIDE_VARIABLE)
    {
        return Ok(PathBuf::from(override_folder).join(NOTES_INDEX_FOLDER_NAME));
    }
    Ok(app
        .path()
        .local_data_dir()?
        .join("getaxtools")
        .join("MDX")
        .join(NOTES_INDEX_FOLDER_NAME))
}

fn data_folder(app: &App) -> Result<PathBuf, tauri::Error> {
    if cfg!(debug_assertions)
        && let Some(override_folder) = std::env::var_os(DATA_FOLDER_OVERRIDE_VARIABLE)
    {
        return Ok(PathBuf::from(override_folder));
    }
    Ok(app.path().data_dir()?.join("getaxtools").join("MDX"))
}
