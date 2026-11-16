use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::{MoveError, MovePlan};
use crate::documents::{canonical_key_of, write_text_atomically};

const JOURNAL_FORMAT_VERSION: u32 = 1;
/// About 200 bytes a file, so this holds well over 100,000 files.
const MAX_JOURNAL_BYTES: u64 = 64 * 1024 * 1024;
const JOURNAL_EXTENSION: &str = "json";

/// planned -> copying -> verified -> switched; the journal is deleted once the old copy is kept,
/// removed, or the move is cancelled.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MoveState {
    Planned,
    Copying,
    Verified,
    Switched,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileState {
    Pending,
    Copied,
    Verified,
}

/// One file of the notes folder, with what it was when it was copied.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalFile {
    /// Relative to the notes folder, with `/` between its parts.
    pub path: String,
    pub size: u64,
    pub modified_ns: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    pub state: FileState,
}

/// Everything a move needs to resume, cancel or remove the old copy after a restart.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveJournal {
    pub format_version: u32,
    pub location_id: String,
    pub workspace_id: String,
    pub source: PathBuf,
    pub target: PathBuf,
    pub state: MoveState,
    /// The move made the new folder, so Cancel may remove it once it is empty.
    pub is_target_new: bool,
    pub folders: Vec<String>,
    pub files: Vec<JournalFile>,
    pub online_only_count: usize,
    pub online_only_bytes: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure: Option<MoveError>,
}

/// Which workspace moves which folder where.
pub struct MoveIdentity {
    pub location_id: String,
    pub workspace_id: String,
    pub source: PathBuf,
    pub target: PathBuf,
}

impl MoveJournal {
    pub fn new(identity: MoveIdentity, plan: MovePlan) -> Self {
        Self {
            format_version: JOURNAL_FORMAT_VERSION,
            location_id: identity.location_id,
            workspace_id: identity.workspace_id,
            source: identity.source,
            target: identity.target,
            state: MoveState::Planned,
            is_target_new: plan.is_target_new,
            folders: plan.folders,
            files: plan.files,
            online_only_count: plan.online_only_count,
            online_only_bytes: plan.online_only_bytes,
            failure: None,
        }
    }

    pub fn total_bytes(&self) -> u64 {
        self.files.iter().map(|file| file.size).sum()
    }

    /// Every path must stay inside its folder and the two folders must not overlap, or nothing is done.
    fn is_sound(&self) -> bool {
        self.format_version == JOURNAL_FORMAT_VERSION
            && self.source.is_absolute()
            && self.target.is_absolute()
            && !folders_overlap(&self.source, &self.target)
            && self.folders.iter().all(|folder| is_plain_relative(folder))
            && self.files.iter().all(|file| is_plain_relative(&file.path))
    }
}

/// The journals in the app's data folder, one per Notes location, never inside a notes folder.
#[derive(Debug)]
pub struct MoveJournals {
    folder: PathBuf,
}

impl MoveJournals {
    pub fn new(folder: PathBuf) -> Self {
        Self { folder }
    }

    pub fn write(&self, journal: &MoveJournal) -> Result<(), MoveError> {
        fs::create_dir_all(&self.folder).map_err(|_| MoveError::JournalUnavailable)?;
        let text = serde_json::to_string(journal).map_err(|_| MoveError::JournalUnavailable)?;
        write_text_atomically(&self.path_of(&journal.location_id), &text)
            .map_err(|_| MoveError::JournalUnavailable)
    }

    pub fn read(&self, location_id: &str) -> Result<Option<MoveJournal>, MoveError> {
        let path = self.path_of(location_id);
        match fs::metadata(&path) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Ok(metadata) if metadata.len() <= MAX_JOURNAL_BYTES => {}
            _ => return Err(MoveError::JournalUnavailable),
        }
        let text = fs::read_to_string(&path).map_err(|_| MoveError::JournalUnavailable)?;
        let journal: MoveJournal =
            serde_json::from_str(&text).map_err(|_| MoveError::JournalUnavailable)?;
        if journal.location_id == location_id && journal.is_sound() {
            Ok(Some(journal))
        } else {
            Err(MoveError::JournalUnavailable)
        }
    }

    pub fn remove(&self, location_id: &str) -> Result<(), MoveError> {
        match fs::remove_file(self.path_of(location_id)) {
            Err(error) if error.kind() != io::ErrorKind::NotFound => {
                Err(MoveError::JournalUnavailable)
            }
            _ => Ok(()),
        }
    }

    /// The journals that can be read; a damaged one is left where it is.
    pub fn all(&self) -> Vec<MoveJournal> {
        let Ok(entries) = fs::read_dir(&self.folder) else {
            return Vec::new();
        };
        entries
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.extension().is_some_and(|ext| ext == JOURNAL_EXTENSION))
            .filter_map(|path| path.file_stem()?.to_str().map(str::to_owned))
            .filter_map(|location_id| self.read(&location_id).ok().flatten())
            .collect()
    }

    fn path_of(&self, location_id: &str) -> PathBuf {
        self.folder
            .join(format!("{location_id}.{JOURNAL_EXTENSION}"))
    }
}

/// A path written by the move itself, checked again before anything is created or deleted with it.
pub fn path_inside(root: &Path, relative: &str) -> Result<PathBuf, MoveError> {
    if !is_plain_relative(relative) {
        return Err(MoveError::InvalidRequest);
    }
    Ok(relative
        .split('/')
        .fold(root.to_path_buf(), |path, part| path.join(part)))
}

fn is_plain_relative(relative: &str) -> bool {
    !relative.is_empty() && relative.split('/').all(is_plain_name)
}

fn is_plain_name(part: &str) -> bool {
    let mut components = Path::new(part).components();
    !part.contains(['\\', ':', '\0'])
        && matches!(components.next(), Some(Component::Normal(name)) if name == part)
        && components.next().is_none()
}

/// The relative path of a file below the root, with `/` between its parts.
pub fn relative_path_of(root: &Path, path: &Path) -> Option<String> {
    let parts: Option<Vec<&str>> = path
        .strip_prefix(root)
        .ok()?
        .components()
        .map(|component| match component {
            Component::Normal(part) => part.to_str(),
            _ => None,
        })
        .collect();
    parts
        .map(|parts| parts.join("/"))
        .filter(|path| !path.is_empty())
}

pub fn folders_overlap(first: &Path, second: &Path) -> bool {
    is_same_or_inside(first, second) || is_same_or_inside(second, first)
}

/// Compares as the file system does: by canonical key, part by part.
pub fn is_same_or_inside(path: &Path, folder: &Path) -> bool {
    let key = |path: &Path| PathBuf::from(canonical_key_of(&path.to_string_lossy()));
    key(path).starts_with(key(folder))
}

pub fn nanoseconds_of(time: SystemTime) -> i64 {
    let nanoseconds = |elapsed: Duration| i64::try_from(elapsed.as_nanos()).unwrap_or(i64::MAX);
    match time.duration_since(UNIX_EPOCH) {
        Ok(after) => nanoseconds(after),
        Err(before) => -nanoseconds(before.duration()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn time_of(nanoseconds: i64) -> SystemTime {
        let elapsed = Duration::from_nanos(nanoseconds.unsigned_abs());
        if nanoseconds >= 0 {
            UNIX_EPOCH + elapsed
        } else {
            UNIX_EPOCH - elapsed
        }
    }

    fn journal(source: &Path, target: &Path) -> MoveJournal {
        MoveJournal {
            format_version: JOURNAL_FORMAT_VERSION,
            location_id: "location-1".to_owned(),
            workspace_id: "workspace-1".to_owned(),
            source: source.to_path_buf(),
            target: target.to_path_buf(),
            state: MoveState::Planned,
            is_target_new: false,
            folders: vec!["Projects".to_owned()],
            files: vec![JournalFile {
                path: "Projects/Plan.md".to_owned(),
                size: 5,
                modified_ns: 1,
                sha256: None,
                state: FileState::Pending,
            }],
            online_only_count: 0,
            online_only_bytes: 0,
            failure: None,
        }
    }

    #[test]
    fn a_journal_reads_back_as_written() {
        let data = tempfile::tempdir().unwrap();
        let journals = MoveJournals::new(data.path().join("notes-moves"));
        let written = journal(Path::new(r"C:\Notes"), Path::new(r"D:\Notes"));

        journals.write(&written).unwrap();

        assert_eq!(journals.read("location-1").unwrap(), Some(written));
        assert_eq!(journals.all().len(), 1);
    }

    #[test]
    fn a_journal_with_a_path_outside_its_folder_is_refused() {
        let data = tempfile::tempdir().unwrap();
        let journals = MoveJournals::new(data.path().to_path_buf());
        let mut climbing = journal(Path::new(r"C:\Notes"), Path::new(r"D:\Notes"));
        climbing.files[0].path = "../outside.md".to_owned();
        journals.write(&climbing).unwrap();

        assert_eq!(
            journals.read("location-1"),
            Err(MoveError::JournalUnavailable)
        );
    }

    #[test]
    fn a_journal_moving_a_folder_into_itself_is_refused() {
        let data = tempfile::tempdir().unwrap();
        let journals = MoveJournals::new(data.path().to_path_buf());
        let nested = journal(Path::new(r"C:\Notes"), Path::new(r"c:\notes\Copy"));
        journals.write(&nested).unwrap();

        assert_eq!(
            journals.read("location-1"),
            Err(MoveError::JournalUnavailable)
        );
    }

    #[test]
    fn only_plain_relative_paths_are_accepted() {
        let root = Path::new(r"C:\Notes");
        for unsafe_path in ["", "..", "a/../b", "/root", r"a\b", "C:x", "a//b", "./a"] {
            assert_eq!(
                path_inside(root, unsafe_path),
                Err(MoveError::InvalidRequest),
                "{unsafe_path}"
            );
        }
        assert_eq!(
            path_inside(root, "Projects/Plan.md").unwrap(),
            Path::new(r"C:\Notes\Projects\Plan.md")
        );
    }

    #[test]
    fn times_before_and_after_1970_survive_the_journal() {
        let after = UNIX_EPOCH + Duration::from_nanos(1_700_000_000_123_456_700);
        let before = UNIX_EPOCH - Duration::from_secs(86_400);

        assert_eq!(time_of(nanoseconds_of(after)), after);
        assert_eq!(time_of(nanoseconds_of(before)), before);
    }

    #[test]
    fn overlapping_folders_compare_by_key_and_whole_parts() {
        assert!(folders_overlap(
            Path::new(r"C:\Notes"),
            Path::new(r"c:\notes\Work")
        ));
        assert!(folders_overlap(
            Path::new(r"C:\Notes\Work"),
            Path::new(r"C:\Notes")
        ));
        assert!(!folders_overlap(
            Path::new(r"C:\Notes"),
            Path::new(r"C:\Notes 2")
        ));
    }
}
