use std::sync::{Arc, Mutex};

use notify::EventKind;
use notify::event::ModifyKind;

use super::debounced_watcher::DebouncedWatcher;
use super::lock;
use super::watched_folders::{WatchedFolder, WatchedFolders};

pub const FOLDERS_CHANGED_EVENT: &str = "folders-changed";

/// Reports expanded folders whose listing changed because entries were added, renamed or removed.
pub struct FolderWatcher {
    watched: Arc<Mutex<WatchedFolders>>,
    changes: DebouncedWatcher,
}

impl FolderWatcher {
    pub fn start(on_changes: impl Fn(Vec<String>) + Send + 'static) -> Self {
        let watched = Arc::new(Mutex::new(WatchedFolders::default()));
        let delivery_watched = Arc::clone(&watched);
        let changes = DebouncedWatcher::start(is_listing_change, move |changed_paths| {
            let folders = lock(&delivery_watched).changed_folders(&changed_paths);
            if !folders.is_empty() {
                on_changes(folders);
            }
        });
        Self { watched, changes }
    }

    pub fn watch(&self, folders: Vec<WatchedFolder>) {
        let watched = WatchedFolders::new(folders);
        let paths = watched.paths().clone();
        *lock(&self.watched) = watched;
        self.changes.watch_folders(&paths);
    }
}

/// Saving a document's contents leaves its folder listing unchanged, so only names count.
fn is_listing_change(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Any
            | EventKind::Create(_)
            | EventKind::Remove(_)
            | EventKind::Modify(ModifyKind::Name(_))
    )
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
    use std::time::Duration;

    use super::*;

    const WAIT_FOR_CHANGE: Duration = Duration::from_secs(5);
    const WAIT_FOR_SILENCE: Duration = Duration::from_secs(1);

    fn watch(folder: &Path) -> (FolderWatcher, Receiver<Vec<String>>, String) {
        let (sender, changes) = mpsc::channel();
        let watcher = FolderWatcher::start(move |folders| {
            let _ = sender.send(folders);
        });
        let path: PathBuf = dunce::canonicalize(folder).unwrap();
        let requested_path = path.to_string_lossy().into_owned();
        watcher.watch(vec![WatchedFolder {
            path,
            requested_path: requested_path.clone(),
        }]);
        (watcher, changes, requested_path)
    }

    #[test]
    fn reports_the_folder_when_a_document_is_added() {
        let folder = tempfile::tempdir().unwrap();
        let (_watcher, changes, folder_path) = watch(folder.path());

        fs::write(folder.path().join("new.md"), "# New").unwrap();

        assert_eq!(changes.recv_timeout(WAIT_FOR_CHANGE), Ok(vec![folder_path]));
    }

    #[test]
    fn reports_the_folder_when_a_document_is_renamed() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("old.md"), "# Old").unwrap();
        let (_watcher, changes, folder_path) = watch(folder.path());

        fs::rename(
            folder.path().join("old.md"),
            folder.path().join("renamed.md"),
        )
        .unwrap();

        assert_eq!(changes.recv_timeout(WAIT_FOR_CHANGE), Ok(vec![folder_path]));
    }

    #[test]
    fn stays_quiet_when_only_a_document_is_saved() {
        let folder = tempfile::tempdir().unwrap();
        let document = folder.path().join("notes.md");
        fs::write(&document, "# Notes").unwrap();
        let (_watcher, changes, _) = watch(folder.path());

        fs::write(&document, "# Changed notes").unwrap();

        assert_eq!(
            changes.recv_timeout(WAIT_FOR_SILENCE),
            Err(RecvTimeoutError::Timeout)
        );
    }

    #[test]
    fn stops_reporting_a_folder_that_is_no_longer_watched() {
        let folder = tempfile::tempdir().unwrap();
        let (watcher, changes, _) = watch(folder.path());
        watcher.watch(Vec::new());

        fs::write(folder.path().join("new.md"), "# New").unwrap();

        assert_eq!(
            changes.recv_timeout(WAIT_FOR_SILENCE),
            Err(RecvTimeoutError::Timeout)
        );
    }
}
