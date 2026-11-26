use std::fs;
use std::path::Path;

use serde::Serialize;

use super::copy_identity::{has_same_bytes, hash_of_file, is_own_copy, pending_path_of};
use super::move_journal::{JournalFile, MoveJournal, MoveState, folders_overlap, path_inside};
use super::{MAX_LISTED_PATHS, MoveError};

/// Files that were left where they are, named relative to their folder.
#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeptFiles {
    pub paths: Vec<String>,
    pub count: usize,
}

impl KeptFiles {
    pub fn add(&mut self, path: &str) {
        self.count += 1;
        if self.paths.len() < MAX_LISTED_PATHS {
            self.paths.push(path.to_owned());
        }
    }
}

/// Removes from the new folder only the copies this move made, then the folders it made once they
/// are empty. The old location is never opened for writing; a file in the new folder the move did
/// not make is kept and listed.
pub fn cancel_move(journal: &MoveJournal) -> Result<KeptFiles, MoveError> {
    if journal.state == MoveState::Switched {
        return Err(MoveError::WrongState);
    }
    if folders_overlap(&journal.source, &journal.target) {
        return Err(MoveError::InvalidRequest);
    }
    let mut kept = KeptFiles::default();
    for file in &journal.files {
        let target = path_inside(&journal.target, &file.path)?;
        let source = path_inside(&journal.source, &file.path)?;
        let _ = fs::remove_file(pending_path_of(&target));
        if !target.exists() {
            continue;
        }
        if is_copy_made_by_move(&target, &source, file) && fs::remove_file(&target).is_ok() {
            continue;
        }
        kept.add(&file.path);
    }
    remove_empty_folders(&journal.target, &journal.folders, journal.is_target_new);
    Ok(kept)
}

/// A copy the journal recorded must still have its size, time and hash; one copied after the
/// journal was last written must hold exactly its source's bytes.
fn is_copy_made_by_move(target: &Path, source: &Path, file: &JournalFile) -> bool {
    match (&file.target_modified_ns, &file.sha256) {
        (Some(_), Some(sha256)) => {
            is_own_copy(target, file) && hash_of_file(target).is_ok_and(|hash| hash == *sha256)
        }
        _ => has_same_bytes(target, source),
    }
}

/// Deepest first; `remove_dir` refuses a folder that still holds anything.
pub fn remove_empty_folders(root: &Path, folders: &[String], should_remove_root: bool) {
    let mut deepest_first: Vec<&String> = folders.iter().collect();
    deepest_first.sort_by_key(|folder| std::cmp::Reverse(folder.matches('/').count()));
    for folder in deepest_first {
        if let Ok(path) = path_inside(root, folder) {
            let _ = fs::remove_dir(path);
        }
    }
    if should_remove_root {
        let _ = fs::remove_dir(root);
    }
}
