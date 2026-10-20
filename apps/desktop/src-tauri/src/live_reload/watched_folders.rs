use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};

use crate::documents::canonical_key_of;

/// A folder whose listing is shown, and the path the webview asked for it by.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WatchedFolder {
    pub path: PathBuf,
    pub requested_path: String,
}

/// The expanded folders being watched, keyed the same way as everywhere else in the app.
#[derive(Debug, Default)]
pub struct WatchedFolders {
    requested_paths_by_key: HashMap<String, String>,
    paths: BTreeSet<PathBuf>,
}

impl WatchedFolders {
    pub fn new(folders: Vec<WatchedFolder>) -> Self {
        let mut watched = Self::default();
        for folder in folders {
            watched
                .requested_paths_by_key
                .insert(key_of(&folder.path), folder.requested_path);
            watched.paths.insert(folder.path);
        }
        watched
    }

    pub fn paths(&self) -> &BTreeSet<PathBuf> {
        &self.paths
    }

    /// The folders whose listing a change touches: the folder holding the changed entry, or the
    /// changed entry itself when it is a watched folder that was renamed or removed.
    pub fn changed_folders(&self, changed_paths: &[PathBuf]) -> Vec<String> {
        let mut seen_keys = BTreeSet::new();
        changed_paths
            .iter()
            .flat_map(|path| [path.parent(), Some(path.as_path())])
            .flatten()
            .filter_map(|path| {
                let key = key_of(path);
                let requested_path = self.requested_paths_by_key.get(&key)?;
                seen_keys.insert(key).then(|| requested_path.clone())
            })
            .collect()
    }
}

fn key_of(path: &Path) -> String {
    canonical_key_of(&path.to_string_lossy())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn watched_folder(path: &str) -> WatchedFolder {
        WatchedFolder {
            path: PathBuf::from(path),
            requested_path: path.to_owned(),
        }
    }

    fn watched() -> WatchedFolders {
        WatchedFolders::new(vec![
            watched_folder(r"C:\Docs"),
            watched_folder(r"C:\Docs\Guides"),
        ])
    }

    #[test]
    fn reports_the_folder_that_holds_an_added_or_removed_entry() {
        let changed = watched().changed_folders(&[PathBuf::from(r"C:\Docs\Guides\new.md")]);

        assert_eq!(changed, vec![r"C:\Docs\Guides".to_owned()]);
    }

    #[test]
    fn reports_each_folder_once_per_batch() {
        let changed = watched().changed_folders(&[
            PathBuf::from(r"C:\Docs\a.md"),
            PathBuf::from(r"C:\Docs\b.md"),
        ]);

        assert_eq!(changed, vec![r"C:\Docs".to_owned()]);
    }

    #[test]
    fn reports_a_watched_folder_that_was_renamed_or_removed_and_its_parent() {
        let changed = watched().changed_folders(&[PathBuf::from(r"C:\Docs\Guides")]);

        assert_eq!(
            changed,
            vec![r"C:\Docs".to_owned(), r"C:\Docs\Guides".to_owned()]
        );
    }

    #[test]
    fn ignores_changes_outside_the_watched_folders() {
        let changed = watched().changed_folders(&[PathBuf::from(r"D:\Other\notes.md")]);

        assert!(changed.is_empty());
    }

    #[test]
    fn answers_with_the_path_the_folder_was_requested_by() {
        let watched = WatchedFolders::new(vec![WatchedFolder {
            path: PathBuf::from(r"C:\Docs"),
            requested_path: r"Z:\Docs".to_owned(),
        }]);

        let changed = watched.changed_folders(&[PathBuf::from(r"C:\Docs\a.md")]);

        assert_eq!(changed, vec![r"Z:\Docs".to_owned()]);
    }

    #[cfg(windows)]
    #[test]
    fn matches_changed_paths_regardless_of_case_on_windows() {
        let changed = watched().changed_folders(&[PathBuf::from(r"c:\docs\GUIDES\x.md")]);

        assert_eq!(changed, vec![r"C:\Docs\Guides".to_owned()]);
    }
}
