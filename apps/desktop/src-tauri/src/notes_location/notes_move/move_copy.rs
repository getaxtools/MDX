use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::SystemTime;

use serde::Serialize;
use sha2::{Digest, Sha256};

use super::copy_identity::{has_same_bytes, hash_of_file, hex_of, is_own_copy, pending_path_of};
use super::move_journal::{
    FileState, JournalFile, MoveJournal, MoveState, nanoseconds_of, path_inside,
};
use super::move_plan::check_target_is_empty;
use super::source_changes::{forget_changed_copies, take_source_changes};
use super::{ListedProblem, MoveError, MoveFileSystem};

/// The journal is written after this many files, as well as at every step.
const FILES_PER_JOURNAL_WRITE: usize = 100;
/// Notes changed by another program during the move are copied again, this many times at most.
const MAX_RECOPY_ROUNDS: usize = 3;
const COPY_BUFFER_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MovePhase {
    Copying,
    Verifying,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveProgress {
    pub phase: MovePhase,
    pub done_files: usize,
    pub total_files: usize,
}

/// What a running move reports to and is stopped by.
pub struct MoveRun<'a> {
    pub file_system: &'a dyn MoveFileSystem,
    pub stop: &'a AtomicBool,
    pub save: &'a dyn Fn(&MoveJournal) -> Result<(), MoveError>,
    pub report: &'a dyn Fn(MoveProgress),
}

/// Copies every pending file, verifies every copy and copies again what changed meanwhile, until
/// the journal reaches `verified`. Nothing in the old location is written; on any failure the
/// journal keeps the failure, so the move can be resumed or cancelled.
pub fn run_move(journal: &mut MoveJournal, run: &MoveRun) -> Result<(), MoveError> {
    let result = copy_and_verify(journal, run);
    if let Err(error) = &result
        && *error != MoveError::JournalUnavailable
    {
        journal.failure = Some(error.clone());
        let _ = (run.save)(journal);
    }
    result
}

fn copy_and_verify(journal: &mut MoveJournal, run: &MoveRun) -> Result<(), MoveError> {
    start_copying(journal, run)?;
    for _ in 0..=MAX_RECOPY_ROUNDS {
        copy_pending_files(journal, run)?;
        verify_copied_files(journal, run)?;
        if !take_source_changes(journal, run.file_system)? {
            check_file_count(journal)?;
            journal.state = MoveState::Verified;
            journal.failure = None;
            return (run.save)(journal);
        }
    }
    Err(MoveError::KeepsChanging)
}

fn start_copying(journal: &mut MoveJournal, run: &MoveRun) -> Result<(), MoveError> {
    match journal.state {
        MoveState::Planned => {
            check_target_is_empty(&journal.target)?;
        }
        MoveState::Copying | MoveState::Verified => forget_changed_copies(journal)?,
        MoveState::Switched => return Err(MoveError::WrongState),
    }
    journal.state = MoveState::Copying;
    journal.failure = None;
    make_folders(journal)?;
    (run.save)(journal)
}

pub fn make_folders(journal: &MoveJournal) -> Result<(), MoveError> {
    fs::create_dir_all(&journal.target).map_err(|error| MoveError::writing(&error, ""))?;
    for folder in &journal.folders {
        fs::create_dir_all(path_inside(&journal.target, folder)?)
            .map_err(|error| MoveError::writing(&error, folder))?;
    }
    Ok(())
}

fn copy_pending_files(journal: &mut MoveJournal, run: &MoveRun) -> Result<(), MoveError> {
    let total_files = journal.files.len();
    (run.report)(progress(MovePhase::Copying, 0, total_files));
    for index in 0..total_files {
        if run.stop.load(Ordering::Relaxed) {
            return Err(MoveError::Stopped);
        }
        let (source, target) = (journal.source.clone(), journal.target.clone());
        let Some(file) = journal.files.get_mut(index) else {
            break;
        };
        if file.state != FileState::Pending {
            continue;
        }
        copy_file(&source, &target, file, run.file_system)?;
        run.file_system.pause_after_file();
        if (index + 1) % FILES_PER_JOURNAL_WRITE == 0 {
            (run.save)(journal)?;
            (run.report)(progress(MovePhase::Copying, index + 1, total_files));
        }
    }
    (run.save)(journal)
}

fn verify_copied_files(journal: &mut MoveJournal, run: &MoveRun) -> Result<(), MoveError> {
    let total_files = journal.files.len();
    (run.report)(progress(MovePhase::Verifying, 0, total_files));
    for index in 0..total_files {
        if run.stop.load(Ordering::Relaxed) {
            return Err(MoveError::Stopped);
        }
        let target = journal.target.clone();
        let Some(file) = journal.files.get_mut(index) else {
            break;
        };
        if file.state == FileState::Copied {
            verify_copy(&target, file)?;
        }
        if (index + 1) % FILES_PER_JOURNAL_WRITE == 0 {
            (run.save)(journal)?;
            (run.report)(progress(MovePhase::Verifying, index + 1, total_files));
        }
    }
    (run.save)(journal)
}

const fn progress(phase: MovePhase, done_files: usize, total_files: usize) -> MoveProgress {
    MoveProgress {
        phase,
        done_files,
        total_files,
    }
}

fn copy_file(
    source_root: &Path,
    target_root: &Path,
    file: &mut JournalFile,
    file_system: &dyn MoveFileSystem,
) -> Result<(), MoveError> {
    let source = path_inside(source_root, &file.path)?;
    let target = path_inside(target_root, &file.path)?;
    let metadata = match fs::symlink_metadata(&source) {
        Ok(metadata) => metadata,
        // Gone since it was listed: the check against the notes folder after verifying drops it.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(MoveError::reading(&error, &file.path)),
    };
    if metadata.file_type().is_symlink() {
        return Err(MoveError::listing(
            ListedProblem::Links,
            vec![file.path.clone()],
        ));
    }
    // A copy with exactly the source's bytes may be replaced, as one left by a move that stopped
    // before its journal was written; anything else in its place is the user's.
    if target.exists() && !is_own_copy(&target, file) && !has_same_bytes(&target, &source) {
        return Err(MoveError::TargetChanged {
            path: file.path.clone(),
        });
    }
    let modified = metadata
        .modified()
        .map_err(|error| MoveError::reading(&error, &file.path))?;
    let copy = PendingCopy {
        source: &source,
        target: &target,
        relative: &file.path,
        modified,
    };
    let written = copy.write(file_system)?;
    file.size = metadata.len();
    file.modified_ns = nanoseconds_of(modified);
    file.target_modified_ns = Some(written.modified_ns);
    file.sha256 = Some(written.sha256);
    file.state = FileState::Copied;
    Ok(())
}

struct PendingCopy<'a> {
    source: &'a Path,
    target: &'a Path,
    relative: &'a str,
    modified: SystemTime,
}

/// What a written copy holds: the hash of the bytes read, and its time as its drive keeps it.
struct WrittenCopy {
    sha256: String,
    modified_ns: i64,
}

impl PendingCopy<'_> {
    /// Writes `<name>.mdx-moving`, keeps the source's modified time, then renames it into place.
    fn write(&self, file_system: &dyn MoveFileSystem) -> Result<WrittenCopy, MoveError> {
        let pending = pending_path_of(self.target);
        let _ = fs::remove_file(&pending);
        let result = self.write_to(&pending, file_system);
        if result.is_err() {
            let _ = fs::remove_file(&pending);
        }
        result
    }

    fn write_to(
        &self,
        pending: &Path,
        file_system: &dyn MoveFileSystem,
    ) -> Result<WrittenCopy, MoveError> {
        let writing = |error: std::io::Error| MoveError::writing(&error, self.relative);
        let mut reader =
            File::open(self.source).map_err(|error| MoveError::reading(&error, self.relative))?;
        let mut writer = file_system.create_copy(pending).map_err(writing)?;
        let sha256 = self.copy_hashing(&mut reader, &mut writer)?;
        writer.sync_all().map_err(writing)?;
        file_system
            .set_copy_time(&writer, self.modified)
            .map_err(writing)?;
        drop(writer);
        fs::rename(pending, self.target).map_err(writing)?;
        let kept_time = fs::metadata(self.target)
            .and_then(|metadata| metadata.modified())
            .map_err(writing)?;
        Ok(WrittenCopy {
            sha256,
            modified_ns: nanoseconds_of(kept_time),
        })
    }

    fn copy_hashing(&self, reader: &mut File, writer: &mut File) -> Result<String, MoveError> {
        let mut hasher = Sha256::new();
        let mut buffer = vec![0; COPY_BUFFER_BYTES];
        loop {
            let read = reader
                .read(&mut buffer)
                .map_err(|error| MoveError::reading(&error, self.relative))?;
            let Some(chunk) = buffer.get(..read).filter(|chunk| !chunk.is_empty()) else {
                return Ok(hex_of(hasher.finalize().as_slice()));
            };
            hasher.update(chunk);
            writer
                .write_all(chunk)
                .map_err(|error| MoveError::writing(&error, self.relative))?;
        }
    }
}

fn verify_copy(target_root: &Path, file: &mut JournalFile) -> Result<(), MoveError> {
    let target = path_inside(target_root, &file.path)?;
    let mismatch = || MoveError::HashMismatch {
        path: file.path.clone(),
    };
    let hash = hash_of_file(&target).map_err(|_| mismatch())?;
    if file.sha256.as_deref() != Some(hash.as_str()) || !is_own_copy(&target, file) {
        return Err(mismatch());
    }
    file.state = FileState::Verified;
    Ok(())
}

/// The copy must hold exactly the journal's files, nothing left over and nothing missing.
fn check_file_count(journal: &MoveJournal) -> Result<(), MoveError> {
    let found = count_files_below(&journal.target)?;
    let expected = journal.files.len();
    if found == expected {
        Ok(())
    } else {
        Err(MoveError::CountMismatch { expected, found })
    }
}

fn count_files_below(root: &Path) -> Result<usize, MoveError> {
    let mut count = 0;
    let mut folders: Vec<PathBuf> = vec![root.to_path_buf()];
    while let Some(folder) = folders.pop() {
        let entries = fs::read_dir(&folder).map_err(|error| MoveError::writing(&error, ""))?;
        for entry in entries.filter_map(Result::ok) {
            match entry.file_type() {
                Ok(file_type) if file_type.is_dir() => folders.push(entry.path()),
                _ => count += 1,
            }
        }
    }
    Ok(count)
}
