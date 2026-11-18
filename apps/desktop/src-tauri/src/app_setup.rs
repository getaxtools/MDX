use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tauri::{App, AppHandle, Emitter, Manager};

use crate::app_windows::OpenWindows;
use crate::attachments::DroppedImages;
use crate::commands::app_windows::StartupWorkspaceNotice;
use crate::commands::notes_move::NotesMoves;
use crate::commands::notes_transfer::{NotesImports, PendingImportSource};
use crate::commands::protected_notes::ProtectedNotes;
use crate::commands::spec_project_link::LinkQuestions;
use crate::documents::DocumentAccessList;
use crate::live_reload::{
    DOCUMENTS_CHANGED_EVENT, DocumentWatcher, FOLDERS_CHANGED_EVENT, FolderWatcher,
    SPEC_PROJECTS_CHANGED_EVENT, SpecProjectWatcher, WatchedFolder, WatchedSpecTree,
    WindowWatchSets,
};
use crate::notes_index::NotesIndexes;
use crate::open_requests::{
    StartupDocuments, StartupWorkspaceFile, grant_documents, markdown_paths_from_arguments,
    workspace_file_from_arguments,
};
use crate::secrets::device_secret_store;
use crate::storage::{AppStateStore, PendingWorkspaceExport, WorkspaceDatabase};

const DATA_FOLDER_OVERRIDE_VARIABLE: &str = "MDX_DATA_DIR";
const NOTES_INDEX_FOLDER_NAME: &str = "notes-index";
const NOTES_MOVES_FOLDER_NAME: &str = "notes-moves";
/// UI tests slow a move down, so they can try to type while it runs.
#[cfg(debug_assertions)]
const MOVE_PAUSE_OVERRIDE_VARIABLE: &str = "MDX_MOVE_FILE_PAUSE_MS";

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
    app.manage(Arc::new(LinkQuestions::default()));
    app.manage(start_document_watcher(app.handle().clone()));
    app.manage(start_folder_watcher(app.handle().clone()));
    app.manage(start_spec_project_watcher(app.handle().clone()));
    app.manage(Arc::new(NotesIndexes::new(notes_index_folder(app)?)));
    app.manage(notes_moves(
        &data_folder,
        &app.state::<Arc<DocumentAccessList>>(),
    ));
    app.manage(Arc::new(NotesImports::default()));
    app.manage(Arc::new(PendingImportSource::default()));
    app.manage(Arc::new(OpenWindows::default()));
    app.manage(Arc::new(ProtectedNotes::new(device_secret_store())));
    app.manage(StartupWorkspaceNotice::default());
    app.manage(WindowWatchSets::<String>::default());
    app.manage(WindowWatchSets::<WatchedFolder>::default());
    app.manage(WindowWatchSets::<WatchedSpecTree>::default());
    Ok(())
}

fn notes_moves(data_folder: &std::path::Path, access: &DocumentAccessList) -> Arc<NotesMoves> {
    let moves = NotesMoves::new(
        data_folder.join(NOTES_MOVES_FOLDER_NAME),
        pause_after_each_moved_file(),
    );
    moves.keep_unfinished_moves_read_only(access);
    Arc::new(moves)
}

#[cfg(debug_assertions)]
fn pause_after_each_moved_file() -> Duration {
    let pause_ms = std::env::var(MOVE_PAUSE_OVERRIDE_VARIABLE)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    Duration::from_millis(pause_ms)
}

#[cfg(not(debug_assertions))]
const fn pause_after_each_moved_file() -> Duration {
    Duration::ZERO
}

/// Each window hears only of the changed documents it watches.
fn start_document_watcher(app: AppHandle) -> DocumentWatcher {
    DocumentWatcher::start(move |display_paths| {
        let shares = app
            .state::<WindowWatchSets<String>>()
            .share_of(&display_paths, String::as_str);
        for (window_label, changed) in shares {
            let _ = app.emit_to(window_label.as_str(), DOCUMENTS_CHANGED_EVENT, changed);
        }
    })
}

/// Each window hears only of the changed folders it shows expanded.
fn start_folder_watcher(app: AppHandle) -> FolderWatcher {
    FolderWatcher::start(move |folder_paths| {
        let shares = app
            .state::<WindowWatchSets<WatchedFolder>>()
            .share_of(&folder_paths, |folder| folder.requested_path.as_str());
        for (window_label, changed) in shares {
            let _ = app.emit_to(window_label.as_str(), FOLDERS_CHANGED_EVENT, changed);
        }
    })
}

/// Each window hears only of the changed project roots its Spec viewer workspace shows.
fn start_spec_project_watcher(app: AppHandle) -> SpecProjectWatcher {
    SpecProjectWatcher::start(move |root_paths| {
        let shares = app
            .state::<WindowWatchSets<WatchedSpecTree>>()
            .share_of(&root_paths, WatchedSpecTree::root);
        for (window_label, changed) in shares {
            let _ = app.emit_to(window_label.as_str(), SPEC_PROJECTS_CHANGED_EVENT, changed);
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
