use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::copy_identity::{hash_of_file, is_own_copy, is_unchanged_source};
use super::move_cancel::{KeptFiles, remove_empty_folders};
use super::move_journal::{JournalFile, MoveJournal, MoveState, path_inside};
use super::move_plan::list_source_tree;
use super::{MoveError, MoveFileSystem};
use crate::platform::RecycleBin;

/// The shell's file operation is given this many files at a time.
const FILES_PER_RECYCLE_CALL: usize = 200;
/// The shell takes paths without the long-path prefix, so a longer one could not reach the Recycle Bin.
const MAX_RECYCLABLE_PATH_UNITS: usize = 259;

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
    let Some(capacity_bytes) = recycle_bin.capacity_for(&journal.source) else {
        return Ok(OldCopyRemoval {
            recycled_count: 0,
            kept: KeptFiles::default(),
            has_no_recycle_bin: true,
        });
    };
    let (matching, mut kept) = matching_old_files(journal, capacity_bytes)?;
    keep_files_the_move_never_saw(journal, file_system, &mut kept);
    let recycled_count = recycle_in_batches(&matching, recycle_bin, &mut kept)?;
    remove_empty_folders(&journal.source, &journal.folders, true);
    Ok(OldCopyRemoval {
        recycled_count,
        kept,
        has_no_recycle_bin: false,
    })
}

/// Files still there after their batch are kept and listed. A failure before anything went is
/// reported; a later one keeps that batch and every batch after it.
fn recycle_in_batches(
    matching: &[OldFile],
    recycle_bin: &dyn RecycleBin,
    kept: &mut KeptFiles,
) -> Result<usize, MoveError> {
    let mut recycled_count = 0;
    let mut batches = matching.chunks(FILES_PER_RECYCLE_CALL);
    while let Some(batch) = batches.next() {
        let paths: Vec<PathBuf> = batch.iter().map(|file| file.path.clone()).collect();
        let Ok(still_there) = recycle_bin.recycle(&paths) else {
            if recycled_count == 0 {
                return Err(MoveError::RecycleFailed);
            }
            for file in batch.iter().chain(batches.flatten()) {
                kept.add(&file.relative);
            }
            break;
        };
        for file in batch {
            if still_there.contains(&file.path) {
                kept.add(&file.relative);
            } else {
                recycled_count += 1;
            }
        }
    }
    Ok(recycled_count)
}

/// An old file to recycle, with the name it is listed under if it stays.
struct OldFile {
    path: PathBuf,
    relative: String,
}

/// Old files that may go: unchanged since they were verified, with their copy still in place,
/// reachable by the shell, and within what the Recycle Bin can hold, so none is deleted outright.
fn matching_old_files(
    journal: &MoveJournal,
    capacity_bytes: u64,
) -> Result<(Vec<OldFile>, KeptFiles), MoveError> {
    let mut matching = Vec::new();
    let mut kept = KeptFiles::default();
    let mut room_bytes = capacity_bytes;
    for file in &journal.files {
        let old = path_inside(&journal.source, &file.path)?;
        let copy = path_inside(&journal.target, &file.path)?;
        let fits = file.size <= room_bytes && path_units(&old) <= MAX_RECYCLABLE_PATH_UNITS;
        if fits && is_as_verified(&old, file) && is_as_verified_copy(&copy, file) {
            room_bytes -= file.size;
            matching.push(OldFile {
                path: old,
                relative: file.path.clone(),
            });
        } else if old.exists() {
            kept.add(&file.path);
        }
    }
    Ok((matching, kept))
}

fn is_as_verified(old: &Path, file: &JournalFile) -> bool {
    is_unchanged_source(old, file) && has_verified_hash(old, file)
}

fn is_as_verified_copy(copy: &Path, file: &JournalFile) -> bool {
    is_own_copy(copy, file) && has_verified_hash(copy, file)
}

fn has_verified_hash(path: &Path, file: &JournalFile) -> bool {
    file.sha256
        .as_ref()
        .is_some_and(|sha256| hash_of_file(path).is_ok_and(|hash| hash == *sha256))
}

fn path_units(path: &Path) -> usize {
    path.to_string_lossy().encode_utf16().count()
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
