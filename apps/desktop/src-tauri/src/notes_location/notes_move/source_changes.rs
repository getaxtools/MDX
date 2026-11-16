use std::collections::HashMap;
use std::fs;
use std::path::Path;

use super::move_copy::{is_own_copy, make_folders};
use super::move_journal::{FileState, JournalFile, MoveJournal, nanoseconds_of, path_inside};
use super::move_plan::list_source_tree;
use super::{ListedProblem, MoveError, MoveFileSystem};

/// On resume, a file copied before keeps its state only while both its copy and its source still
/// have the size and time the journal holds; any other file is copied again.
pub fn forget_changed_copies(journal: &mut MoveJournal) -> Result<(), MoveError> {
    let (source_root, target_root) = (journal.source.clone(), journal.target.clone());
    for file in &mut journal.files {
        if file.state == FileState::Pending {
            continue;
        }
        let source = path_inside(&source_root, &file.path)?;
        let target = path_inside(&target_root, &file.path)?;
        if !is_own_copy(&target, file) {
            file.state = FileState::Pending;
        } else if !is_unchanged(&source, file) {
            remove_own_copy(&target, file)?;
            file.sha256 = None;
            file.state = FileState::Pending;
        }
    }
    Ok(())
}

/// Lists the notes folder again and takes in what another program changed since it was copied:
/// changed and new files become pending, and the copies of removed files go. True when anything changed.
pub fn take_source_changes(
    journal: &mut MoveJournal,
    file_system: &dyn MoveFileSystem,
) -> Result<bool, MoveError> {
    let tree = list_source_tree(&journal.source, file_system)?;
    if !tree.links.is_empty() {
        return Err(MoveError::listing(ListedProblem::Links, tree.links));
    }
    let mut current: HashMap<String, JournalFile> = tree
        .files
        .into_iter()
        .map(|file| (file.path.clone(), file))
        .collect();
    let has_removed_files = drop_removed_files(journal, &current)?;
    let has_changed_files = take_changed_files(journal, &mut current)?;
    let has_new_files = !current.is_empty();
    let mut new_files: Vec<JournalFile> = current.into_values().collect();
    new_files.sort_by(|first, second| first.path.cmp(&second.path));
    journal.files.extend(new_files);
    let new_folders: Vec<String> = tree
        .folders
        .into_iter()
        .filter(|folder| !journal.folders.contains(folder))
        .collect();
    let has_new_folders = !new_folders.is_empty();
    journal.folders.extend(new_folders);
    make_folders(journal)?;
    Ok(has_removed_files || has_changed_files || has_new_files || has_new_folders)
}

fn drop_removed_files(
    journal: &mut MoveJournal,
    current: &HashMap<String, JournalFile>,
) -> Result<bool, MoveError> {
    let (removed, kept): (Vec<JournalFile>, Vec<JournalFile>) = journal
        .files
        .drain(..)
        .partition(|file| !current.contains_key(&file.path));
    journal.files = kept;
    for file in &removed {
        remove_own_copy(&path_inside(&journal.target, &file.path)?, file)?;
    }
    Ok(!removed.is_empty())
}

/// Leaves only the new files in `current`.
fn take_changed_files(
    journal: &mut MoveJournal,
    current: &mut HashMap<String, JournalFile>,
) -> Result<bool, MoveError> {
    let mut has_changes = false;
    for file in &mut journal.files {
        let Some(now) = current.remove(&file.path) else {
            continue;
        };
        if now.size != file.size || now.modified_ns != file.modified_ns {
            let target = path_inside(&journal.target, &file.path)?;
            remove_own_copy(&target, file)?;
            *file = now;
            has_changes = true;
        }
    }
    Ok(has_changes)
}

/// Removes a copy the move made of a file that changed or went; anything else there is refused.
fn remove_own_copy(target: &Path, file: &JournalFile) -> Result<(), MoveError> {
    if !target.exists() {
        return Ok(());
    }
    if !is_own_copy(target, file) {
        return Err(MoveError::TargetChanged {
            path: file.path.clone(),
        });
    }
    fs::remove_file(target).map_err(|error| MoveError::writing(&error, &file.path))
}

fn is_unchanged(source: &Path, file: &JournalFile) -> bool {
    fs::symlink_metadata(source).is_ok_and(|metadata| {
        metadata.len() == file.size
            && metadata
                .modified()
                .is_ok_and(|modified| nanoseconds_of(modified) == file.modified_ns)
    })
}
