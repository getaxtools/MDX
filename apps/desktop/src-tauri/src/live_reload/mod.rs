mod debounced_watcher;
mod document_watcher;
mod folder_watcher;
mod notes_folder_watcher;
mod spec_project_watcher;
mod watched_documents;
mod watched_folders;
mod window_watch_sets;

use std::sync::{Mutex, MutexGuard, PoisonError};

pub use document_watcher::{DOCUMENTS_CHANGED_EVENT, DocumentWatcher};
pub use folder_watcher::{FOLDERS_CHANGED_EVENT, FolderWatcher};
pub use notes_folder_watcher::NotesFolderWatcher;
pub use spec_project_watcher::{SPEC_PROJECTS_CHANGED_EVENT, SpecProjectWatcher};
pub use watched_folders::WatchedFolder;
pub use window_watch_sets::WindowWatchSets;

fn lock<Value>(mutex: &Mutex<Value>) -> MutexGuard<'_, Value> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}
