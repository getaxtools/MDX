use std::io;

use serde::{Deserialize, Serialize};

use crate::platform;

/// The most paths a refusal names; the count says how many there are in all.
pub const MAX_LISTED_PATHS: usize = 20;

/// Why a move did not start or stopped. Paths are relative to the notes folder; the old location
/// is unchanged in every case.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, thiserror::Error)]
#[serde(
    tag = "code",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum MoveError {
    #[error("the new folder is not empty")]
    TargetNotEmpty,
    #[error("the new folder is inside the notes folder")]
    TargetInsideLocation,
    #[error("the new folder contains the notes folder")]
    TargetContainsLocation,
    #[error("the new folder is a drive or the user folder")]
    TargetRefused,
    #[error("the new folder's drive has too little free space")]
    NotEnoughSpace {
        required_bytes: u64,
        available_bytes: u64,
    },
    #[error("the notes folder holds links to other places")]
    LinksInside { paths: Vec<String>, count: usize },
    #[error("some paths would be too long in the new folder")]
    PathsTooLong { paths: Vec<String>, count: usize },
    #[error("a notes file could not be read")]
    SourceUnreadable { path: String },
    #[error("a file could not be written to the new folder")]
    TargetUnwritable { path: String },
    #[error("the new folder's drive is full")]
    DiskFull { path: String },
    #[error("another program has the file open")]
    FileLocked { path: String },
    #[error("a copied file differs from its source")]
    HashMismatch { path: String },
    #[error("the copy holds a different number of files")]
    CountMismatch { expected: usize, found: usize },
    #[error("a file the move did not make is in the new folder")]
    TargetChanged { path: String },
    #[error("the notes kept changing while they were copied")]
    KeepsChanging,
    #[error("the move was stopped")]
    Stopped,
    #[error("the move is not at a step that allows this")]
    WrongState,
    #[error("a move is already under way")]
    MoveUnderway,
    #[error("there is no move for this notes folder")]
    NoMove,
    #[error("a workspace still uses the old folder")]
    OldCopyInUse,
    #[error("the folder may not be used")]
    AccessDenied,
    #[error("the request was invalid")]
    InvalidRequest,
    #[error("the move journal could not be read or written")]
    JournalUnavailable,
}

/// Which refusal a list of paths makes.
#[derive(Debug, Clone, Copy)]
pub enum ListedProblem {
    Links,
    LongPaths,
}

impl MoveError {
    pub fn listing(problem: ListedProblem, all_paths: Vec<String>) -> Self {
        let count = all_paths.len();
        let paths = all_paths.into_iter().take(MAX_LISTED_PATHS).collect();
        match problem {
            ListedProblem::Links => Self::LinksInside { paths, count },
            ListedProblem::LongPaths => Self::PathsTooLong { paths, count },
        }
    }

    pub fn reading(error: &io::Error, path: &str) -> Self {
        let path = path.to_owned();
        if is_locked(error) {
            Self::FileLocked { path }
        } else {
            Self::SourceUnreadable { path }
        }
    }

    pub fn writing(error: &io::Error, path: &str) -> Self {
        let path = path.to_owned();
        if error.kind() == io::ErrorKind::StorageFull {
            Self::DiskFull { path }
        } else if is_locked(error) {
            Self::FileLocked { path }
        } else {
            Self::TargetUnwritable { path }
        }
    }
}

fn is_locked(error: &io::Error) -> bool {
    error
        .raw_os_error()
        .is_some_and(platform::is_locked_error_code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_full_drive_is_told_apart_from_other_write_failures() {
        let full = io::Error::from(io::ErrorKind::StorageFull);
        let other = io::Error::from(io::ErrorKind::InvalidData);

        assert_eq!(
            MoveError::writing(&full, "Plan.md"),
            MoveError::DiskFull {
                path: "Plan.md".to_owned()
            }
        );
        assert_eq!(
            MoveError::writing(&other, "Plan.md"),
            MoveError::TargetUnwritable {
                path: "Plan.md".to_owned()
            }
        );
    }

    #[test]
    fn serializes_sizes_for_the_window() {
        let error = MoveError::NotEnoughSpace {
            required_bytes: 2_200,
            available_bytes: 1_000,
        };

        assert_eq!(
            serde_json::to_string(&error).unwrap(),
            r#"{"code":"notEnoughSpace","requiredBytes":2200,"availableBytes":1000}"#
        );
    }

    #[test]
    fn a_listing_names_the_first_paths_and_counts_all() {
        let all_paths: Vec<String> = (0..MAX_LISTED_PATHS + 5)
            .map(|number| format!("{number}.md"))
            .collect();

        let listing = MoveError::listing(ListedProblem::LongPaths, all_paths);

        let MoveError::PathsTooLong { paths, count } = listing else {
            panic!("expected long paths, got {listing:?}");
        };
        assert_eq!(paths.len(), MAX_LISTED_PATHS);
        assert_eq!(count, MAX_LISTED_PATHS + 5);
    }
}
