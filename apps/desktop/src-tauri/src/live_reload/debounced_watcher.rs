use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use super::lock;

/// Other programs often write in several steps; wait for them to finish before reporting.
const QUIET_PERIOD: Duration = Duration::from_millis(300);

/// Watches the direct contents of a set of folders and reports the changed paths in batches.
pub struct DebouncedWatcher {
    watcher: Mutex<Option<RecommendedWatcher>>,
    watched_folders: Mutex<BTreeSet<PathBuf>>,
}

impl DebouncedWatcher {
    pub fn start(
        is_relevant: fn(&EventKind) -> bool,
        on_changed_paths: impl Fn(Vec<PathBuf>) + Send + 'static,
    ) -> Self {
        let (sender, receiver) = mpsc::channel::<PathBuf>();
        thread::spawn(move || deliver_in_batches(&receiver, &on_changed_paths));
        let watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
            let Ok(event) = result else { return };
            if !is_relevant(&event.kind) {
                return;
            }
            for path in event.paths {
                let _ = sender.send(path);
            }
        })
        .ok();
        Self {
            watcher: Mutex::new(watcher),
            watched_folders: Mutex::new(BTreeSet::new()),
        }
    }

    /// Replaces the watched folders; a folder that cannot be watched now is tried again next time.
    pub fn watch_folders(&self, folders: &BTreeSet<PathBuf>) {
        let mut watcher = lock(&self.watcher);
        let Some(watcher) = watcher.as_mut() else {
            return;
        };
        let mut watched_folders = lock(&self.watched_folders);
        for folder in watched_folders.difference(folders) {
            let _ = watcher.unwatch(folder);
        }
        let mut now_watched: BTreeSet<PathBuf> =
            watched_folders.intersection(folders).cloned().collect();
        for folder in folders.difference(&watched_folders) {
            if watcher.watch(folder, RecursiveMode::NonRecursive).is_ok() {
                now_watched.insert(folder.clone());
            }
        }
        *watched_folders = now_watched;
    }
}

fn deliver_in_batches(receiver: &Receiver<PathBuf>, on_changed_paths: &impl Fn(Vec<PathBuf>)) {
    while let Ok(first_path) = receiver.recv() {
        let mut changed_paths = vec![first_path];
        while let Ok(path) = receiver.recv_timeout(QUIET_PERIOD) {
            changed_paths.push(path);
        }
        on_changed_paths(changed_paths);
    }
}
