use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;

use super::excluded_paths::ExcludedPaths;
use super::index_build::{BuildProgress, DiskNoteFolder, NoteChange, reconcile_index};
use super::index_store::{
    IndexError, IndexOpening, NotesIndex, index_file_path, remove_index_files_in,
};
use super::note_links::{
    Backlink, NoteHeading, NoteSuggestion, TagCount, backlinks_of, headings_of_link_target,
    suggest_notes, tag_counts,
};
use super::note_search::{NoteSearchResults, parse_query, search_notes};
use crate::live_reload::NotesFolderWatcher;

/// How far the shown workspace's index is, for the search view.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub location_id: String,
    pub indexed: usize,
    pub to_index: usize,
    pub is_building: bool,
    /// The index file was from another version or unreadable, so it was built again.
    pub was_rebuilt: bool,
    /// False when the location reports no changes, so the window asks for a reconcile on focus.
    pub is_watched: bool,
}

impl IndexStatus {
    fn building(location_id: &str, opening: IndexOpening, is_watched: bool) -> Self {
        Self {
            location_id: location_id.to_owned(),
            is_building: true,
            was_rebuilt: matches!(opening, IndexOpening::Rebuilt(_)),
            is_watched,
            ..Self::default()
        }
    }
}

/// What the index tells the window: how far it is, and which notes changed in a reconcile.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IndexEvent {
    Status(IndexStatus),
    Changes {
        location_id: String,
        changes: Vec<NoteChange>,
    },
}

/// A Notes location to show: its folder, the id of its index and the paths its index never reads.
pub struct NotesLocationToShow {
    pub root: PathBuf,
    pub location_id: String,
    pub excluded: ExcludedPaths,
}

struct ShownLocation {
    location_id: String,
    root: PathBuf,
    excluded: ExcludedPaths,
    stop: Arc<AtomicBool>,
    reconcile_requests: Sender<()>,
    _watcher: NotesFolderWatcher,
    thread: thread::JoinHandle<()>,
}

/// The notes index of the shown Notes workspace: opened when the workspace is shown, reconciled
/// in the background whenever its notes change, and stopped when another workspace is shown.
pub struct NotesIndexes {
    index_folder: PathBuf,
    shown: Mutex<Option<ShownLocation>>,
}

impl NotesIndexes {
    pub fn new(index_folder: PathBuf) -> Self {
        Self {
            index_folder,
            shown: Mutex::new(None),
        }
    }

    /// Opens the location's index, reconciles it with the folder and keeps it in step on a thread of its own.
    pub fn show(
        &self,
        location: NotesLocationToShow,
        report: impl Fn(IndexEvent) + Send + 'static,
    ) -> Result<(), IndexError> {
        self.hide();
        let NotesLocationToShow {
            root,
            location_id,
            excluded,
        } = location;
        let root = dunce::canonicalize(&root).unwrap_or(root);
        let (index, opening) =
            NotesIndex::open(&index_file_path(&self.index_folder, &location_id))?;
        let (reconcile_requests, requests) = mpsc::channel();
        let watcher_requests = reconcile_requests.clone();
        let watcher = NotesFolderWatcher::start(root.clone(), move || {
            let _ = watcher_requests.send(());
        });
        let stop = Arc::new(AtomicBool::new(false));
        let job = IndexJob {
            index,
            folder: DiskNoteFolder::new(root.clone(), excluded.clone()),
            stop: Arc::clone(&stop),
            status: IndexStatus::building(&location_id, opening, watcher.is_watching()),
        };
        let thread = thread::Builder::new()
            .name("notes-index".to_owned())
            .spawn(move || keep_in_step(job, &requests, &report))?;
        *self.shown.lock().unwrap_or_else(PoisonError::into_inner) = Some(ShownLocation {
            location_id,
            root,
            excluded,
            stop,
            reconcile_requests,
            _watcher: watcher,
            thread,
        });
        Ok(())
    }
    /// Stops watching and building; the thread ends once its current batch is written.
    pub fn hide(&self) {
        drop(self.take_shown());
    }

    /// Removes every notes index, for Clear All Data; the notes themselves are never touched.
    /// The shown index is closed first, so its file can be deleted; the count of files removed is returned.
    pub fn clear_all(&self) -> Result<usize, IndexError> {
        if let Some(thread) = self.take_shown() {
            let _ = thread.join();
        }
        remove_index_files_in(&self.index_folder)
    }

    fn take_shown(&self) -> Option<thread::JoinHandle<()>> {
        let location = self
            .shown
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take()?;
        location.stop.store(true, Ordering::Relaxed);
        let ShownLocation { thread, .. } = location;
        Some(thread)
    }

    /// Reconciles again, for a location that reports no changes, when the window gets the focus.
    pub fn refresh(&self, location_id: &str) {
        let shown = self.shown.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(location) = shown
            .as_ref()
            .filter(|location| location.location_id == location_id)
        {
            let _ = location.reconcile_requests.send(());
        }
    }

    /// Searches the shown workspace's notes, beside a reconcile that may still run.
    pub fn search(
        &self,
        location_id: &str,
        query: &str,
    ) -> Result<Option<NoteSearchResults>, IndexError> {
        self.read(location_id, |connection, folder| {
            search_notes(connection, folder, &parse_query(query))
        })
    }

    pub fn backlinks(
        &self,
        location_id: &str,
        note_path: &str,
    ) -> Result<Option<Vec<Backlink>>, IndexError> {
        self.read(location_id, |connection, folder| {
            backlinks_of(connection, folder, note_path)
        })
    }

    pub fn tags(&self, location_id: &str) -> Result<Option<Vec<TagCount>>, IndexError> {
        self.read(location_id, |connection, _| tag_counts(connection))
    }

    pub fn suggestions(
        &self,
        location_id: &str,
        typed: &str,
        from_note: &str,
    ) -> Result<Option<Vec<NoteSuggestion>>, IndexError> {
        self.read(location_id, |connection, _| {
            suggest_notes(connection, typed, from_note)
        })
    }

    pub fn headings(
        &self,
        location_id: &str,
        target: &str,
        from_note: &str,
    ) -> Result<Option<Vec<NoteHeading>>, IndexError> {
        self.read(location_id, |connection, _| {
            headings_of_link_target(connection, target, from_note)
        })
    }

    /// Reads the shown location's index through a connection of its own, so a reconcile never waits.
    fn read<Answer>(
        &self,
        location_id: &str,
        question: impl FnOnce(&Connection, &DiskNoteFolder) -> Result<Answer, IndexError>,
    ) -> Result<Option<Answer>, IndexError> {
        let Some(folder) = self.shown_folder(location_id) else {
            return Ok(None);
        };
        let connection = Connection::open_with_flags(
            index_file_path(&self.index_folder, location_id),
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        question(&connection, &folder).map(Some)
    }

    fn shown_folder(&self, location_id: &str) -> Option<DiskNoteFolder> {
        let shown = self.shown.lock().unwrap_or_else(PoisonError::into_inner);
        shown
            .as_ref()
            .filter(|location| location.location_id == location_id)
            .map(|location| DiskNoteFolder::new(location.root.clone(), location.excluded.clone()))
    }
}

/// The index of one shown location: the index it owns, the folder it reads and when to stop.
struct IndexJob {
    index: NotesIndex,
    folder: DiskNoteFolder,
    stop: Arc<AtomicBool>,
    status: IndexStatus,
}

/// Reconciles at once, then again after each batch of changes, until another workspace is shown.
fn keep_in_step(mut job: IndexJob, requests: &Receiver<()>, report: &dyn Fn(IndexEvent)) {
    loop {
        reconcile_once(&mut job, report);
        if job.stop.load(Ordering::Relaxed) || requests.recv().is_err() {
            return;
        }
        while requests.try_recv().is_ok() {}
        if job.stop.load(Ordering::Relaxed) {
            return;
        }
    }
}

fn reconcile_once(job: &mut IndexJob, report: &dyn Fn(IndexEvent)) {
    let status = IndexStatus {
        is_building: true,
        ..job.status.clone()
    };
    report(IndexEvent::Status(status.clone()));
    let mut on_progress = |progress: BuildProgress| {
        report(IndexEvent::Status(IndexStatus {
            indexed: progress.indexed,
            to_index: progress.to_index,
            ..status.clone()
        }));
    };
    let stop = Arc::clone(&job.stop);
    let outcome = reconcile_index(
        &mut job.index,
        &job.folder,
        &|| stop.load(Ordering::Relaxed),
        &mut on_progress,
    )
    .unwrap_or_default();
    if job.stop.load(Ordering::Relaxed) {
        return;
    }
    if !outcome.changes.is_empty() {
        report(IndexEvent::Changes {
            location_id: status.location_id.clone(),
            changes: outcome.changes,
        });
    }
    report(IndexEvent::Status(IndexStatus {
        indexed: outcome.indexed,
        to_index: outcome.indexed,
        is_building: false,
        ..status
    }));
    job.status.was_rebuilt = false;
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::Duration;

    use super::*;

    const WAIT: Duration = Duration::from_secs(10);

    fn show(indexes: &NotesIndexes, location: &std::path::Path) -> Receiver<IndexEvent> {
        show_excluding(indexes, location, &[])
    }

    fn show_excluding(
        indexes: &NotesIndexes,
        location: &std::path::Path,
        excluded: &[&str],
    ) -> Receiver<IndexEvent> {
        let (sender, receiver) = mpsc::channel();
        let excluded: Vec<String> = excluded.iter().map(|path| (*path).to_owned()).collect();
        let location = NotesLocationToShow {
            root: location.to_path_buf(),
            location_id: "location-1".to_owned(),
            excluded: ExcludedPaths::new(&excluded).unwrap(),
        };
        indexes
            .show(location, move |event| {
                let _ = sender.send(event);
            })
            .unwrap();
        receiver
    }

    fn location_with_a_private_note() -> tempfile::TempDir {
        let location = tempfile::tempdir().unwrap();
        fs::create_dir(location.path().join("Private")).unwrap();
        fs::write(
            location.path().join("Private").join("Review.md"),
            "# Review\n\nThe salary #pay\n",
        )
        .unwrap();
        fs::write(
            location.path().join("Plan.md"),
            "# Plan\n\nSee [[Review]].\n",
        )
        .unwrap();
        location
    }

    #[test]
    fn notes_under_an_excluded_path_never_reach_search_tags_links_or_suggestions() {
        let location = location_with_a_private_note();
        let index_folder = tempfile::tempdir().unwrap();
        let indexes = NotesIndexes::new(index_folder.path().to_path_buf());

        let finished = wait_until_built(&show_excluding(&indexes, location.path(), &["private"]));

        assert_eq!(finished.indexed, 1);
        assert!(
            indexes
                .search("location-1", "salary")
                .unwrap()
                .unwrap()
                .hits
                .is_empty()
        );
        assert!(indexes.tags("location-1").unwrap().unwrap().is_empty());
        assert!(
            indexes
                .suggestions("location-1", "rev", "Plan.md")
                .unwrap()
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn a_newly_excluded_note_leaves_the_index() {
        let location = location_with_a_private_note();
        let index_folder = tempfile::tempdir().unwrap();
        let indexes = NotesIndexes::new(index_folder.path().to_path_buf());
        wait_until_built(&show(&indexes, location.path()));
        assert_eq!(
            indexes
                .search("location-1", "salary")
                .unwrap()
                .unwrap()
                .hits
                .len(),
            1
        );

        wait_until_built(&show_excluding(&indexes, location.path(), &["Private"]));

        assert!(
            indexes
                .search("location-1", "salary")
                .unwrap()
                .unwrap()
                .hits
                .is_empty()
        );
    }

    fn wait_until_built(events: &Receiver<IndexEvent>) -> IndexStatus {
        loop {
            match events.recv_timeout(WAIT).unwrap() {
                IndexEvent::Status(status) if !status.is_building => return status,
                _ => {}
            }
        }
    }

    #[test]
    fn showing_a_location_builds_its_index_and_search_finds_its_notes() {
        let location = tempfile::tempdir().unwrap();
        fs::write(
            location.path().join("Plan.md"),
            "# Plan\n\nBook the venue.\n",
        )
        .unwrap();
        let index_folder = tempfile::tempdir().unwrap();
        let indexes = NotesIndexes::new(index_folder.path().to_path_buf());

        let finished = wait_until_built(&show(&indexes, location.path()));
        let results = indexes.search("location-1", "venue").unwrap().unwrap();

        assert_eq!(finished.indexed, 1);
        assert!(finished.is_watched);
        assert_eq!(results.hits.len(), 1);
    }

    #[test]
    fn a_note_written_by_another_program_is_indexed_and_reported() {
        let location = tempfile::tempdir().unwrap();
        let index_folder = tempfile::tempdir().unwrap();
        let indexes = NotesIndexes::new(index_folder.path().to_path_buf());
        let events = show(&indexes, location.path());
        wait_until_built(&events);

        fs::write(
            location.path().join("Later.md"),
            "# Later\n\nWritten outside.\n",
        )
        .unwrap();

        let changes = loop {
            if let IndexEvent::Changes { changes, .. } = events.recv_timeout(WAIT).unwrap() {
                break changes;
            }
        };
        assert_eq!(
            changes.first().map(|change| change.path.as_str()),
            Some("Later.md")
        );
        wait_until_built(&events);
        assert_eq!(
            indexes
                .search("location-1", "outside")
                .unwrap()
                .unwrap()
                .hits
                .len(),
            1
        );
    }

    #[test]
    fn refresh_reconciles_again() {
        let location = tempfile::tempdir().unwrap();
        let index_folder = tempfile::tempdir().unwrap();
        let indexes = NotesIndexes::new(index_folder.path().to_path_buf());
        let events = show(&indexes, location.path());
        wait_until_built(&events);

        indexes.refresh("location-1");

        assert!(!wait_until_built(&events).is_building);
    }

    #[test]
    fn another_location_is_not_searched() {
        let location = tempfile::tempdir().unwrap();
        let index_folder = tempfile::tempdir().unwrap();
        let indexes = NotesIndexes::new(index_folder.path().to_path_buf());
        let _events = show(&indexes, location.path());

        assert_eq!(indexes.search("location-2", "venue").unwrap(), None);
        indexes.hide();
        assert_eq!(indexes.search("location-1", "venue").unwrap(), None);
    }

    #[test]
    fn clearing_data_removes_the_cache_only() {
        let location = tempfile::tempdir().unwrap();
        fs::write(location.path().join("Plan.md"), "# Plan\n").unwrap();
        let index_folder = tempfile::tempdir().unwrap();
        fs::write(
            index_folder.path().join("other-location.notes-index"),
            b"old index",
        )
        .unwrap();
        fs::write(index_folder.path().join("readme.txt"), b"not an index").unwrap();
        let indexes = NotesIndexes::new(index_folder.path().to_path_buf());
        wait_until_built(&show(&indexes, location.path()));

        let removed = indexes.clear_all().unwrap();

        assert_eq!(removed, 2);
        assert!(index_folder.path().join("readme.txt").exists());
        assert!(!index_folder.path().join("location-1.notes-index").exists());
        assert_eq!(
            fs::read_to_string(location.path().join("Plan.md")).unwrap(),
            "# Plan\n"
        );
        assert_eq!(indexes.search("location-1", "plan").unwrap(), None);
    }
}
