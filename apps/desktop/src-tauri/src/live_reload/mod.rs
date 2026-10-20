mod debounced_watcher;
mod document_watcher;
mod folder_watcher;
mod watched_documents;
mod watched_folders;

use std::sync::{Mutex, MutexGuard, PoisonError};

pub use document_watcher::{DOCUMENTS_CHANGED_EVENT, DocumentWatcher};
pub use folder_watcher::{FOLDERS_CHANGED_EVENT, FolderWatcher};
pub use watched_folders::WatchedFolder;

fn lock<Value>(mutex: &Mutex<Value>) -> MutexGuard<'_, Value> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}
