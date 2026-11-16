use std::collections::HashSet;
use std::path::PathBuf;

use serde::Serialize;

use super::move_cancel::{KeptFiles, remove_empty_folders};
use super::move_copy::{hash_of_file, is_own_copy};
use super::move_journal::{MoveJournal, MoveState, path_inside};
use super::move_plan::list_source_tree;
use super::{MoveError, MoveFileSystem};
use crate::platform::RecycleBin;

/// The shell's file operation is given this many files at a time.
const FILES_PER_RECYCLE_CALL: usize = 200;

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OldCopyRemoval {
    pub recycled_count: usize,
    pub kept: KeptFiles,
    /// The old folder is on a drive without a Recycle Bin, such as a network share, so all of it stays.
    pub has_no_recycle_bin: bool,
}

/// Moves to the Recycle Bin only the old files that still have the size, time and hash the move
/// verified; every other file stays and is listed. Without a Recycle Bin nothing is removed.
pub fn remove_old_copy(
    journal: &MoveJournal,
    recycle_bin: &dyn RecycleBin,
    file_system: &dyn MoveFileSystem,
) -> Result<OldCopyRemoval, MoveError> {
    if journal.state != MoveState::Switched {
        return Err(MoveError::WrongState);
    }
    if !recycle_bin.is_available_for(&journal.source) {
        return Ok(OldCopyRemoval {
            recycled_count: 0,
            kept: KeptFiles::default(),
            has_no_recycle_bin: true,
        });
    }
    let (matching, mut kept) = matching_old_files(journal)?;
    keep_files_the_move_never_saw(journal, file_system, &mut kept);
    for batch in matching.chunks(FILES_PER_RECYCLE_CALL) {
        recycle_bin
            .recycle(batch)
            .map_err(|error| MoveError::writing(&error, ""))?;
    }
    remove_empty_folders(&journal.source, &journal.folders, true);
    Ok(OldCopyRemoval {
        recycled_count: matching.len(),
        kept,
        has_no_recycle_bin: false,
    })
}

fn matching_old_files(journal: &MoveJournal) -> Result<(Vec<PathBuf>, KeptFiles), MoveError> {
    let mut matching = Vec::new();
    let mut kept = KeptFiles::default();
    for file in &journal.files {
        let path = path_inside(&journal.source, &file.path)?;
        let is_as_verified = is_own_copy(&path, file)
            && file
                .sha256
                .as_ref()
                .is_some_and(|sha256| hash_of_file(&path).is_ok_and(|hash| hash == *sha256));
        if is_as_verified {
            matching.push(path);
        } else if path.exists() {
            kept.add(&file.path);
        }
    }
    Ok((matching, kept))
}

/// Notes added to the old folder after the move, and links, are never the move's to remove.
fn keep_files_the_move_never_saw(
    journal: &MoveJournal,
    file_system: &dyn MoveFileSystem,
    kept: &mut KeptFiles,
) {
    let Ok(tree) = list_source_tree(&journal.source, file_system) else {
        return;
    };
    let known: HashSet<&str> = journal
        .files
        .iter()
        .map(|file| file.path.as_str())
        .collect();
    for path in tree
        .links
        .iter()
        .chain(tree.files.iter().map(|file| &file.path))
    {
        if !known.contains(path.as_str()) {
            kept.add(path);
        }
    }
}
