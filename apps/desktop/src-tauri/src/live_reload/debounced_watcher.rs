use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use super::lock;

/// Other programs often write in several steps; wait for them to finish before reporting.
const QUIET_PERIOD: Duration = Duration::from_millis(300);
/// A folder that never goes quiet, such as one holding a growing log, still gets its changes reported.
const MAX_BATCH_AGE: Duration = Duration::from_secs(2);

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
        let started = Instant::now();
        let mut changed_paths = BTreeSet::from([first_path]);
        while started.elapsed() < MAX_BATCH_AGE {
            let Ok(path) = receiver.recv_timeout(QUIET_PERIOD) else {
                break;
            };
            changed_paths.insert(path);
        }
        on_changed_paths(changed_paths.into_iter().collect());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_changes_even_while_events_keep_arriving() {
        let (paths, receiver) = mpsc::channel::<PathBuf>();
        let (batches, delivered) = mpsc::channel::<Vec<PathBuf>>();
        thread::spawn(move || {
            deliver_in_batches(&receiver, &|changed| {
                let _ = batches.send(changed);
            });
        });

        let sender = thread::spawn(move || {
            for _ in 0..40 {
                let _ = paths.send(PathBuf::from("busy.log"));
                thread::sleep(Duration::from_millis(100));
            }
        });

        let first_batch = delivered.recv_timeout(MAX_BATCH_AGE + Duration::from_secs(1));

        assert_eq!(first_batch, Ok(vec![PathBuf::from("busy.log")]));
        sender.join().unwrap();
    }
}
