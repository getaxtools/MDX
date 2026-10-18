use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};

use crate::documents::canonical_key_of;

/// The open documents being watched, keyed the same way as everywhere else in the app.
#[derive(Debug, Default)]
pub struct WatchedDocuments {
    display_paths_by_key: HashMap<String, String>,
}

impl WatchedDocuments {
    pub fn from_display_paths(display_paths: &[String]) -> Self {
        Self {
            display_paths_by_key: display_paths
                .iter()
                .map(|display_path| (canonical_key_of(display_path), display_path.clone()))
                .collect(),
        }
    }

    pub fn folders(&self) -> BTreeSet<PathBuf> {
        self.display_paths_by_key
            .values()
            .filter_map(|display_path| Path::new(display_path).parent().map(Path::to_path_buf))
            .collect()
    }

    pub fn changed_display_paths(&self, changed_paths: &[PathBuf]) -> Vec<String> {
        let mut seen_keys = BTreeSet::new();
        changed_paths
            .iter()
            .filter_map(|path| {
                let key = canonical_key_of(&path.to_string_lossy());
                let display_path = self.display_paths_by_key.get(&key)?;
                seen_keys.insert(key).then(|| display_path.clone())
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn watched() -> WatchedDocuments {
        WatchedDocuments::from_display_paths(&[
            r"C:\Docs\Guide.md".to_owned(),
            r"C:\Docs\Notes.md".to_owned(),
            r"D:\Specs\Plan.md".to_owned(),
        ])
    }

    #[test]
    fn watches_each_folder_once() {
        let folders: Vec<PathBuf> = watched().folders().into_iter().collect();

        assert_eq!(
            folders,
            vec![PathBuf::from(r"C:\Docs"), PathBuf::from(r"D:\Specs")]
        );
    }

    #[test]
    fn reports_only_watched_documents_once_each() {
        let changed = watched().changed_display_paths(&[
            PathBuf::from(r"C:\Docs\Guide.md"),
            PathBuf::from(r"C:\Docs\other.txt"),
            PathBuf::from(r"C:\Docs\Guide.md"),
        ]);

        assert_eq!(changed, vec![r"C:\Docs\Guide.md".to_owned()]);
    }

    #[cfg(windows)]
    #[test]
    fn matches_changed_paths_regardless_of_case_on_windows() {
        let changed = watched().changed_display_paths(&[PathBuf::from(r"c:\docs\NOTES.md")]);

        assert_eq!(changed, vec![r"C:\Docs\Notes.md".to_owned()]);
    }
}
