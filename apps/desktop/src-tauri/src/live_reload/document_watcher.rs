use std::sync::{Arc, Mutex};

use notify::EventKind;

use super::debounced_watcher::DebouncedWatcher;
use super::lock;
use super::watched_documents::WatchedDocuments;

pub const DOCUMENTS_CHANGED_EVENT: &str = "documents-changed";

/// Reports open documents that other programs changed on disk.
pub struct DocumentWatcher {
    watched: Arc<Mutex<WatchedDocuments>>,
    changes: DebouncedWatcher,
}

impl DocumentWatcher {
    pub fn start(on_changes: impl Fn(Vec<String>) + Send + 'static) -> Self {
        let watched = Arc::new(Mutex::new(WatchedDocuments::default()));
        let delivery_watched = Arc::clone(&watched);
        let changes = DebouncedWatcher::start(is_document_change, move |changed_paths| {
            let display_paths = lock(&delivery_watched).changed_display_paths(&changed_paths);
            if !display_paths.is_empty() {
                on_changes(display_paths);
            }
        });
        Self { watched, changes }
    }

    pub fn watch(&self, display_paths: &[String]) {
        let documents = WatchedDocuments::from_display_paths(display_paths);
        let folders = documents.folders();
        *lock(&self.watched) = documents;
        self.changes.watch_folders(&folders);
    }
}

fn is_document_change(kind: &EventKind) -> bool {
    !matches!(kind, EventKind::Access(_))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::mpsc::{self, RecvTimeoutError};
    use std::time::Duration;

    use super::*;

    const WAIT_FOR_CHANGE: Duration = Duration::from_secs(5);

    #[test]
    fn reports_a_watched_document_after_it_is_saved() {
        let folder = tempfile::tempdir().unwrap();
        let document = dunce::canonicalize(folder.path()).unwrap().join("guide.md");
        fs::write(&document, "# Old").unwrap();
        let (sender, changes) = mpsc::channel();
        let watcher = DocumentWatcher::start(move |paths| {
            let _ = sender.send(paths);
        });
        let display_path = document.to_string_lossy().into_owned();
        watcher.watch(std::slice::from_ref(&display_path));

        fs::write(&document, "# New").unwrap();

        assert_eq!(
            changes.recv_timeout(WAIT_FOR_CHANGE),
            Ok(vec![display_path])
        );
    }

    #[test]
    fn ignores_documents_that_are_no_longer_watched() {
        let folder = tempfile::tempdir().unwrap();
        let document = dunce::canonicalize(folder.path()).unwrap().join("notes.md");
        fs::write(&document, "# Notes").unwrap();
        let (sender, changes) = mpsc::channel();
        let watcher = DocumentWatcher::start(move |paths| {
            let _ = sender.send(paths);
        });
        watcher.watch(&[document.to_string_lossy().into_owned()]);
        watcher.watch(&[]);

        fs::write(&document, "# Changed").unwrap();

        assert_eq!(
            changes.recv_timeout(Duration::from_secs(1)),
            Err(RecvTimeoutError::Timeout)
        );
    }
}
