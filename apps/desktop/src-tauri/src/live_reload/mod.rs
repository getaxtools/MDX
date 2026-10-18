mod watched_documents;

use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::Duration;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

pub use watched_documents::WatchedDocuments;

pub const DOCUMENTS_CHANGED_EVENT: &str = "documents-changed";
/// Editors often write a file in several steps; wait for them to finish before reloading.
const QUIET_PERIOD: Duration = Duration::from_millis(300);

pub struct DocumentWatcher {
    watched: Arc<Mutex<WatchedDocuments>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
    watched_folders: Mutex<BTreeSet<PathBuf>>,
}

impl DocumentWatcher {
    pub fn start(on_changes: impl Fn(Vec<String>) + Send + 'static) -> Self {
        let watched = Arc::new(Mutex::new(WatchedDocuments::default()));
        let (sender, receiver) = mpsc::channel::<PathBuf>();
        let delivery_watched = Arc::clone(&watched);
        thread::spawn(move || deliver_changes(&receiver, &delivery_watched, &on_changes));
        let watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
            let Ok(event) = result else { return };
            if matches!(event.kind, EventKind::Access(_)) {
                return;
            }
            for path in event.paths {
                let _ = sender.send(path);
            }
        })
        .ok();
        Self {
            watched,
            watcher: Mutex::new(watcher),
            watched_folders: Mutex::new(BTreeSet::new()),
        }
    }

    pub fn watch(&self, display_paths: &[String]) {
        let documents = WatchedDocuments::from_display_paths(display_paths);
        let folders = documents.folders();
        *lock(&self.watched) = documents;
        let mut watcher = lock(&self.watcher);
        let Some(watcher) = watcher.as_mut() else {
            return;
        };
        let mut watched_folders = lock(&self.watched_folders);
        for folder in watched_folders.difference(&folders) {
            let _ = watcher.unwatch(folder);
        }
        for folder in folders.difference(&watched_folders) {
            let _ = watcher.watch(folder, RecursiveMode::NonRecursive);
        }
        *watched_folders = folders;
    }
}

fn deliver_changes(
    receiver: &Receiver<PathBuf>,
    watched: &Mutex<WatchedDocuments>,
    on_changes: &impl Fn(Vec<String>),
) {
    while let Ok(first_path) = receiver.recv() {
        let mut changed_paths = vec![first_path];
        while let Ok(path) = receiver.recv_timeout(QUIET_PERIOD) {
            changed_paths.push(path);
        }
        let display_paths = lock(watched).changed_display_paths(&changed_paths);
        if !display_paths.is_empty() {
            on_changes(display_paths);
        }
    }
}

fn lock<Value>(mutex: &Mutex<Value>) -> std::sync::MutexGuard<'_, Value> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::mpsc::RecvTimeoutError;

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
