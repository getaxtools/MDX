use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use notify::EventKind;
use notify::event::ModifyKind;

use super::debounced_watcher::{DebouncedWatcher, WHOLE_TREE};

/// Tells the notes index that notes in a location were added, saved, renamed or removed, in batches.
pub struct NotesFolderWatcher {
    changes: DebouncedWatcher,
    root: PathBuf,
}

impl NotesFolderWatcher {
    pub fn start(root: PathBuf, on_notes_changed: impl Fn() + Send + 'static) -> Self {
        let watched_root = root.clone();
        let changes =
            DebouncedWatcher::start_in_mode(WHOLE_TREE, is_content_change, move |changed_paths| {
                if changed_paths
                    .iter()
                    .any(|path| may_change_notes(&watched_root, path))
                {
                    on_notes_changed();
                }
            });
        changes.watch_folders(&BTreeSet::from([root.clone()]));
        Self { changes, root }
    }

    /// False when the location cannot be watched; the window then asks for a reconcile on focus.
    pub fn is_watching(&self) -> bool {
        self.changes.is_watching(&self.root)
    }
}

/// Saving a note changes its contents; renames, new and removed files change the notes themselves.
fn is_content_change(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Any
            | EventKind::Create(_)
            | EventKind::Remove(_)
            | EventKind::Modify(ModifyKind::Data(_) | ModifyKind::Name(_) | ModifyKind::Any)
    )
}

/// Changes inside dot folders, such as the app folder with its trash, never change a note by themselves;
/// an empty path stands for a watcher error, after which anything may have changed.
fn may_change_notes(root: &Path, path: &Path) -> bool {
    if path.as_os_str().is_empty() {
        return true;
    }
    path.strip_prefix(root).is_ok_and(|relative| {
        !relative
            .components()
            .any(|part| part.as_os_str().to_string_lossy().starts_with('.'))
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::mpsc::{self, RecvTimeoutError};
    use std::time::Duration;

    use super::*;

    const WAIT_FOR_CHANGE: Duration = Duration::from_secs(5);
    const WAIT_FOR_SILENCE: Duration = Duration::from_secs(1);

    fn watch(root: &Path) -> (NotesFolderWatcher, mpsc::Receiver<()>) {
        let (sender, receiver) = mpsc::channel();
        let watcher = NotesFolderWatcher::start(dunce::canonicalize(root).unwrap(), move || {
            let _ = sender.send(());
        });
        (watcher, receiver)
    }

    #[test]
    fn recursive_mode_reports_a_change_in_a_subfolder() {
        let location = tempfile::tempdir().unwrap();
        fs::create_dir_all(location.path().join("Projects").join("Work")).unwrap();
        let (watcher, changes) = watch(location.path());
        assert!(watcher.is_watching());

        fs::write(
            location
                .path()
                .join("Projects")
                .join("Work")
                .join("Plan.md"),
            "# Plan",
        )
        .unwrap();

        assert_eq!(changes.recv_timeout(WAIT_FOR_CHANGE), Ok(()));
    }

    #[test]
    fn content_change_filter_reports_a_saved_note() {
        let location = tempfile::tempdir().unwrap();
        let note = location.path().join("Plan.md");
        fs::write(&note, "# Plan").unwrap();
        let (_watcher, changes) = watch(location.path());

        fs::write(&note, "# Plan\n\nMore").unwrap();

        assert_eq!(changes.recv_timeout(WAIT_FOR_CHANGE), Ok(()));
    }

    #[test]
    fn changes_inside_the_app_folder_alone_are_not_reported() {
        let location = tempfile::tempdir().unwrap();
        fs::create_dir_all(location.path().join(".mdx-notes").join("trash")).unwrap();
        let (_watcher, changes) = watch(location.path());

        fs::write(
            location
                .path()
                .join(".mdx-notes")
                .join("trash")
                .join("entry.json"),
            "{}",
        )
        .unwrap();

        assert_eq!(
            changes.recv_timeout(WAIT_FOR_SILENCE),
            Err(RecvTimeoutError::Timeout)
        );
    }

    #[test]
    fn a_watcher_error_counts_as_a_change() {
        assert!(may_change_notes(Path::new(r"C:\Notes"), Path::new("")));
        assert!(!may_change_notes(
            Path::new(r"C:\Notes"),
            Path::new(r"C:\Notes\.mdx-notes\x")
        ));
        assert!(may_change_notes(
            Path::new(r"C:\Notes"),
            Path::new(r"C:\Notes\Plan.md")
        ));
    }
}
