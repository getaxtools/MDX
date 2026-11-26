use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::read_marker;
use crate::commands::folders::is_hidden;
use crate::documents::{DocumentError, canonical_key_of};

/// What a folder holds before it becomes a Notes location, so the window can ask first.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NotesFolderInspection {
    /// Missing, or holding only hidden entries (dot names or the hidden attribute), as the index skips.
    Empty,
    /// Holds the user's files, which stay as they are; only the app folder is added.
    ExistingFiles,
    /// Already marked as a Notes location, which keeps its id.
    NotesLocation,
    /// A drive root or the user folder, which would put every file the user has in the index.
    Refused,
}

/// A folder as the file system names it, so a trailing separator, `..` or a link cannot hide a refused
/// place; a folder not made yet keeps its spelling.
pub fn canonical_folder(path: &Path) -> PathBuf {
    dunce::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// Both paths must come from `canonical_folder`.
pub fn is_refused_place(path: &Path, user_folder: Option<&Path>) -> bool {
    path.parent().is_none()
        || user_folder.is_some_and(|user_folder| {
            canonical_key_of(&user_folder.to_string_lossy())
                == canonical_key_of(&path.to_string_lossy())
        })
}

pub fn inspect_folder(
    path: &Path,
    user_folder: Option<&Path>,
) -> Result<NotesFolderInspection, DocumentError> {
    if is_refused_place(path, user_folder) {
        return Ok(NotesFolderInspection::Refused);
    }
    if !path.is_dir() {
        return Ok(NotesFolderInspection::Empty);
    }
    if read_marker(path)?.is_some() {
        return Ok(NotesFolderInspection::NotesLocation);
    }
    let has_user_files = fs::read_dir(path)?
        .filter_map(Result::ok)
        .any(|entry| !is_hidden(&entry));
    Ok(if has_user_files {
        NotesFolderInspection::ExistingFiles
    } else {
        NotesFolderInspection::Empty
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes_location::mark_location;

    fn folder_of_notes() -> tempfile::TempDir {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("Plan.md"), "# Plan\r\nSee [[Ideas]].\n").unwrap();
        fs::create_dir(folder.path().join("Projects")).unwrap();
        fs::write(folder.path().join("Projects").join("Ideas.md"), "# Ideas").unwrap();
        fs::create_dir(folder.path().join(".other-app")).unwrap();
        fs::write(folder.path().join(".other-app").join("settings.json"), "{}").unwrap();
        folder
    }

    #[test]
    fn the_user_folder_is_refused_however_it_is_spelled() {
        let user = tempfile::tempdir().unwrap();
        fs::create_dir(user.path().join("Notes")).unwrap();
        let user_folder = canonical_folder(user.path());
        let shown = user.path().to_string_lossy().into_owned();
        let spellings = [
            format!(r"{shown}\"),
            shown.replace('\\', "/"),
            format!(r"{shown}\Notes\.."),
            format!(r"{shown}\."),
        ];

        for spelling in spellings {
            let folder = canonical_folder(Path::new(&spelling));
            assert!(is_refused_place(&folder, Some(&user_folder)), "{spelling}");
        }
    }

    #[test]
    fn a_folder_not_made_yet_keeps_its_spelling() {
        let folder = tempfile::tempdir().unwrap();
        let missing = folder.path().join("MDX Notes");

        assert_eq!(canonical_folder(&missing), missing);
    }

    #[test]
    fn a_folder_with_notes_holds_existing_files() {
        let folder = folder_of_notes();

        assert_eq!(
            inspect_folder(folder.path(), None).unwrap(),
            NotesFolderInspection::ExistingFiles
        );
    }

    #[test]
    fn a_folder_with_only_dot_entries_counts_as_empty() {
        let folder = tempfile::tempdir().unwrap();
        fs::create_dir(folder.path().join(".other-app")).unwrap();

        assert_eq!(
            inspect_folder(folder.path(), None).unwrap(),
            NotesFolderInspection::Empty
        );
    }

    #[test]
    fn a_missing_default_folder_counts_as_empty() {
        let folder = tempfile::tempdir().unwrap();

        assert_eq!(
            inspect_folder(&folder.path().join("MDX Notes"), None).unwrap(),
            NotesFolderInspection::Empty
        );
    }

    #[test]
    fn a_marked_folder_is_reported_as_a_notes_location() {
        let folder = folder_of_notes();
        mark_location(folder.path(), "location-1", 1).unwrap();

        assert_eq!(
            inspect_folder(folder.path(), None).unwrap(),
            NotesFolderInspection::NotesLocation
        );
    }

    #[test]
    fn a_drive_root_is_refused() {
        assert!(is_refused_place(Path::new(r"D:\"), None));
        assert!(is_refused_place(Path::new(r"\\server\share\"), None));
    }

    #[test]
    fn the_user_folder_is_refused_in_any_letter_case() {
        let user_folder = Some(Path::new(r"C:\Users\Ana"));

        assert!(is_refused_place(Path::new(r"c:\users\ana"), user_folder));
        assert_eq!(
            inspect_folder(Path::new(r"C:\Users\Ana"), user_folder).unwrap(),
            NotesFolderInspection::Refused
        );
    }

    #[test]
    fn a_folder_inside_the_user_folder_is_allowed() {
        let user_folder = Some(Path::new(r"C:\Users\Ana"));

        assert!(!is_refused_place(
            Path::new(r"C:\Users\Ana\Notes"),
            user_folder
        ));
    }
}
