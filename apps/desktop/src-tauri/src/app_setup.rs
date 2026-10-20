use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{App, AppHandle, Emitter, Manager};

use crate::documents::DocumentAccessList;
use crate::live_reload::{
    DOCUMENTS_CHANGED_EVENT, DocumentWatcher, FOLDERS_CHANGED_EVENT, FolderWatcher,
};
use crate::open_requests::{
    MAIN_WINDOW_LABEL, StartupDocuments, grant_documents, markdown_paths_from_arguments,
};
use crate::storage::{AppStateStore, saved_document_paths};

const DATA_FOLDER_OVERRIDE_VARIABLE: &str = "MDX_DATA_DIR";

pub fn initialize(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let store = AppStateStore::new(&data_folder(app)?);
    let access = Arc::new(DocumentAccessList::default());
    grant_saved_documents(&store, &access);

    let arguments: Vec<String> = std::env::args().collect();
    let working_folder = std::env::current_dir().unwrap_or_default();
    let startup_paths = markdown_paths_from_arguments(&arguments, &working_folder);
    let startup_documents = StartupDocuments::new(grant_documents(&startup_paths, &access));

    app.manage(store);
    app.manage(access);
    app.manage(startup_documents);
    app.manage(start_document_watcher(app.handle().clone()));
    app.manage(start_folder_watcher(app.handle().clone()));
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

fn data_folder(app: &App) -> Result<PathBuf, tauri::Error> {
    if cfg!(debug_assertions)
        && let Some(override_folder) = std::env::var_os(DATA_FOLDER_OVERRIDE_VARIABLE)
    {
        return Ok(PathBuf::from(override_folder));
    }
    Ok(app.path().data_dir()?.join("getaxtools").join("MDX"))
}

fn grant_saved_documents(store: &AppStateStore, access: &DocumentAccessList) {
    let Ok(Some(saved)) = store.load() else {
        return;
    };
    let paths = saved_document_paths(&saved);
    grant_documents(&paths.documents, access);
    for folder in &paths.folders {
        let _ = access.grant_folder(Path::new(folder));
    }
}
