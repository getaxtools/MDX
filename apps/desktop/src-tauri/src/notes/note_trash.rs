use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::note_files::{NotesRoot, children_folder_of, note_name_of, note_named, require_note};
use crate::documents::{DocumentError, DocumentLocation, locate_document, write_text_atomically};
use crate::notes_location::NOTES_APP_FOLDER;

const TRASH_FOLDER_NAME: &str = "trash";
const RECORD_FILE_NAME: &str = "trash-entry.json";
const RECORD_FORMAT_VERSION: u32 = 1;
const MAX_ENTRY_ID_CHARACTERS: usize = 260;
const MAX_RESTORED_NAME_ATTEMPTS: u32 = 100;

/// Where a deleted note came from, kept next to it in its trash folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrashRecord {
    format_version: u32,
    /// The note's path inside the location, with forward slashes.
    original_path: String,
    deleted_at_ms: u64,
}

/// A deleted note as the trash view lists it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashEntry {
    /// The entry's folder name inside the trash; restore and the view refer to it.
    pub id: String,
    pub name: String,
    pub original_path: String,
    pub deleted_at_ms: u64,
    pub has_child_notes: bool,
}

/// Moves a note, with its child notes, into the location's trash; nothing is removed from disk.
pub fn delete_note(
    root: &NotesRoot,
    note: &Path,
    deleted_at_ms: u64,
) -> Result<TrashEntry, DocumentError> {
    let note = root.resolve_inside(note)?;
    require_note(&note)?;
    let file_name = note.file_name().ok_or(DocumentError::InvalidRequest)?;
    let name = note_name_of(&note);
    let entry_folder = new_entry_folder(root, deleted_at_ms, &name)?;
    let record = TrashRecord {
        format_version: RECORD_FORMAT_VERSION,
        original_path: relative_path(root, &note)?,
        deleted_at_ms,
    };
    let text = serde_json::to_string_pretty(&record).map_err(|_| DocumentError::InvalidRequest)?;
    write_text_atomically(&entry_folder.join(RECORD_FILE_NAME), &text)?;
    let children = children_folder_of(&note);
    let has_child_notes = children.is_dir();
    let moved = move_pair(&note, &entry_folder.join(file_name), has_child_notes);
    if let Err(error) = moved {
        let _ = fs::remove_dir_all(&entry_folder);
        return Err(error);
    }
    Ok(entry_of(&entry_folder, record, has_child_notes))
}

/// The deleted notes, most recently deleted first; folders without a readable record are left out.
pub fn list_trash(root: &NotesRoot) -> Result<Vec<TrashEntry>, DocumentError> {
    let Ok(folders) = fs::read_dir(trash_folder(root)) else {
        return Ok(Vec::new());
    };
    let mut entries: Vec<TrashEntry> = folders
        .filter_map(Result::ok)
        .map(|folder| folder.path())
        .filter_map(|folder| {
            let record = read_record(&folder)?;
            let has_child_notes = trashed_note(&folder, &record)
                .is_some_and(|note| children_folder_of(&note).is_dir());
            Some(entry_of(&folder, record, has_child_notes))
        })
        .collect();
    entries.sort_by_key(|entry| std::cmp::Reverse(entry.deleted_at_ms));
    Ok(entries)
}

/// Puts a deleted note back where it was, as "Name (restored)" when that name is taken by then.
pub fn restore_note(root: &NotesRoot, entry_id: &str) -> Result<DocumentLocation, DocumentError> {
    let entry_folder = entry_folder_of(root, entry_id)?;
    let record = read_record(&entry_folder).ok_or(DocumentError::NotFound)?;
    let trashed = trashed_note(&entry_folder, &record).ok_or(DocumentError::NotFound)?;
    let original = root.folder().join(&record.original_path);
    let folder = original.parent().ok_or(DocumentError::InvalidRequest)?;
    if !folder.starts_with(root.folder()) {
        return Err(DocumentError::AccessDenied);
    }
    fs::create_dir_all(folder)?;
    let has_child_notes = children_folder_of(&trashed).is_dir();
    let target = free_place_for(folder, &trashed, has_child_notes)?;
    move_pair(&trashed, &target, has_child_notes)?;
    fs::remove_dir_all(&entry_folder)?;
    locate_document(&target)
}

/// Removes every trash entry for good; anything else in the trash folder is left alone.
pub fn empty_trash(root: &NotesRoot) -> Result<usize, DocumentError> {
    let Ok(folders) = fs::read_dir(trash_folder(root)) else {
        return Ok(0);
    };
    let mut removed = 0;
    for folder in folders.filter_map(Result::ok).map(|folder| folder.path()) {
        if folder.is_dir() && read_record(&folder).is_some() {
            fs::remove_dir_all(&folder)?;
            removed += 1;
        }
    }
    Ok(removed)
}

fn trash_folder(root: &NotesRoot) -> PathBuf {
    root.folder().join(NOTES_APP_FOLDER).join(TRASH_FOLDER_NAME)
}

fn new_entry_folder(
    root: &NotesRoot,
    deleted_at_ms: u64,
    name: &str,
) -> Result<PathBuf, DocumentError> {
    let trash = trash_folder(root);
    fs::create_dir_all(&trash)?;
    for attempt in 0..MAX_RESTORED_NAME_ATTEMPTS {
        let suffix = if attempt == 0 {
            String::new()
        } else {
            format!("-{attempt}")
        };
        let folder = trash.join(format!("{deleted_at_ms}-{name}{suffix}"));
        match fs::create_dir(&folder) {
            Ok(()) => return Ok(folder),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.into()),
        }
    }
    Err(DocumentError::NameTaken)
}

/// A trash entry named by the view: one plain folder name directly inside the trash.
fn entry_folder_of(root: &NotesRoot, entry_id: &str) -> Result<PathBuf, DocumentError> {
    let is_plain_name = !entry_id.is_empty()
        && entry_id.chars().count() <= MAX_ENTRY_ID_CHARACTERS
        && entry_id != "."
        && entry_id != ".."
        && !entry_id.contains(['/', '\\', ':', '\0']);
    if !is_plain_name {
        return Err(DocumentError::InvalidRequest);
    }
    let folder = trash_folder(root).join(entry_id);
    if folder.is_dir() {
        Ok(folder)
    } else {
        Err(DocumentError::NotFound)
    }
}

fn read_record(entry_folder: &Path) -> Option<TrashRecord> {
    let text = fs::read_to_string(entry_folder.join(RECORD_FILE_NAME)).ok()?;
    let record: TrashRecord = serde_json::from_str(&text).ok()?;
    is_relative_inside(&record.original_path).then_some(record)
}

/// A recorded path never climbs out of the location, even if the record was edited by hand.
fn is_relative_inside(path: &str) -> bool {
    !path.is_empty()
        && !path.contains(['\\', ':', '\0'])
        && path
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

fn trashed_note(entry_folder: &Path, record: &TrashRecord) -> Option<PathBuf> {
    let file_name = record.original_path.rsplit('/').next()?;
    let note = entry_folder.join(file_name);
    note.is_file().then_some(note)
}

fn entry_of(entry_folder: &Path, record: TrashRecord, has_child_notes: bool) -> TrashEntry {
    let file_name = record.original_path.rsplit('/').next().unwrap_or_default();
    TrashEntry {
        id: entry_folder
            .file_name()
            .map_or_else(String::new, |name| name.to_string_lossy().into_owned()),
        name: note_name_of(Path::new(file_name)),
        original_path: record.original_path,
        deleted_at_ms: record.deleted_at_ms,
        has_child_notes,
    }
}

fn relative_path(root: &NotesRoot, note: &Path) -> Result<String, DocumentError> {
    let relative = note
        .strip_prefix(root.folder())
        .map_err(|_| DocumentError::AccessDenied)?;
    let parts: Vec<String> = relative
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect();
    Ok(parts.join("/"))
}

/// The original name when it is free in the folder, otherwise "Name (restored)", "Name (restored 2)" and on.
fn free_place_for(
    folder: &Path,
    trashed: &Path,
    has_child_notes: bool,
) -> Result<PathBuf, DocumentError> {
    let name = note_name_of(trashed);
    let extension = trashed.extension().map_or_else(String::new, |extension| {
        format!(".{}", extension.to_string_lossy())
    });
    for attempt in 0..MAX_RESTORED_NAME_ATTEMPTS {
        let candidate = match attempt {
            0 => name.clone(),
            1 => format!("{name} (restored)"),
            _ => format!("{name} (restored {attempt})"),
        };
        let is_free = note_named(folder, &candidate).is_none()
            && !(has_child_notes && folder.join(&candidate).exists());
        if is_free {
            return Ok(folder.join(format!("{candidate}{extension}")));
        }
    }
    Err(DocumentError::NameTaken)
}

/// Moves a note and, when it has them, its child notes; on a failure the note goes back.
fn move_pair(note: &Path, target: &Path, has_child_notes: bool) -> Result<(), DocumentError> {
    fs::rename(note, target)?;
    if has_child_notes
        && let Err(error) = fs::rename(children_folder_of(note), children_folder_of(target))
    {
        let _ = fs::rename(target, note);
        return Err(error.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Location {
        _folder: tempfile::TempDir,
        root: NotesRoot,
    }

    impl Location {
        fn new() -> Self {
            let folder = tempfile::tempdir().unwrap();
            let root = NotesRoot::new(folder.path()).unwrap();
            Self {
                _folder: folder,
                root,
            }
        }

        fn path(&self, relative: &str) -> PathBuf {
            self.root.folder().join(relative)
        }

        fn write_bytes(&self, relative: &str, bytes: &[u8]) -> PathBuf {
            let path = self.path(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, bytes).unwrap();
            path
        }
    }

    #[test]
    fn restore_brings_back_the_same_bytes() {
        let location = Location::new();
        let bytes = b"\xEF\xBB\xBF# Plan\r\n\xE2\x9C\x93 done\r\n";
        let note = location.write_bytes(r"Projects\Plan.md", bytes);

        let entry = delete_note(&location.root, &note, 1_000).unwrap();
        assert!(!note.exists());
        let restored = restore_note(&location.root, &entry.id).unwrap();

        assert_eq!(restored.path(), note);
        assert_eq!(fs::read(&note).unwrap(), bytes);
        assert_eq!(list_trash(&location.root).unwrap(), Vec::new());
    }

    #[test]
    fn restoring_onto_a_taken_name_adds_restored() {
        let location = Location::new();
        let note = location.write_bytes("Plan.md", b"old");
        let entry = delete_note(&location.root, &note, 1_000).unwrap();
        location.write_bytes("Plan.md", b"new");

        let restored = restore_note(&location.root, &entry.id).unwrap();

        assert_eq!(restored.file_name, "Plan (restored).md");
        assert_eq!(fs::read(location.path("Plan.md")).unwrap(), b"new");
        assert_eq!(fs::read(restored.path()).unwrap(), b"old");
    }

    #[test]
    fn a_note_with_children_is_deleted_and_restored_together() {
        let location = Location::new();
        let note = location.write_bytes("Projects.md", b"projects");
        location.write_bytes(r"Projects\Plan.md", b"plan");

        let entry = delete_note(&location.root, &note, 1_000).unwrap();
        assert!(entry.has_child_notes);
        assert!(!location.path("Projects").exists());
        restore_note(&location.root, &entry.id).unwrap();

        assert_eq!(
            fs::read(location.path(r"Projects\Plan.md")).unwrap(),
            b"plan"
        );
    }

    #[test]
    fn lists_deleted_notes_with_their_place_newest_first() {
        let location = Location::new();
        let plan = location.write_bytes(r"Projects\Plan.md", b"plan");
        let inbox = location.write_bytes("Inbox.md", b"inbox");
        delete_note(&location.root, &plan, 1_000).unwrap();
        delete_note(&location.root, &inbox, 2_000).unwrap();

        let entries = list_trash(&location.root).unwrap();

        assert_eq!(
            entries
                .iter()
                .map(|entry| (entry.name.as_str(), entry.original_path.as_str()))
                .collect::<Vec<_>>(),
            vec![("Inbox", "Inbox.md"), ("Plan", "Projects/Plan.md")]
        );
    }

    #[test]
    fn two_notes_of_one_name_deleted_at_once_get_their_own_entries() {
        let location = Location::new();
        let first = location.write_bytes(r"A\Plan.md", b"a");
        let second = location.write_bytes(r"B\Plan.md", b"b");

        let first_entry = delete_note(&location.root, &first, 1_000).unwrap();
        let second_entry = delete_note(&location.root, &second, 1_000).unwrap();

        assert_ne!(first_entry.id, second_entry.id);
        assert_eq!(list_trash(&location.root).unwrap().len(), 2);
    }

    #[test]
    fn empty_removes_only_trash_entries() {
        let location = Location::new();
        let note = location.write_bytes("Plan.md", b"plan");
        let kept = location.write_bytes("Inbox.md", b"inbox");
        delete_note(&location.root, &note, 1_000).unwrap();
        let stray = location.write_bytes(r".mdx-notes\trash\not-an-entry\file.txt", b"stray");

        let removed = empty_trash(&location.root).unwrap();

        assert_eq!(removed, 1);
        assert!(stray.exists());
        assert!(kept.exists());
        assert!(location.path(r".mdx-notes\trash").is_dir());
    }

    #[test]
    fn an_entry_id_that_leaves_the_trash_is_refused() {
        let location = Location::new();

        for entry_id in ["", "..", r"..\..\Plan", "a/b", "C:x"] {
            assert_eq!(
                restore_note(&location.root, entry_id),
                Err(DocumentError::InvalidRequest),
                "{entry_id:?}"
            );
        }
    }

    #[test]
    fn a_record_edited_to_climb_out_of_the_location_is_ignored() {
        let location = Location::new();
        location.write_bytes(
            r".mdx-notes\trash\1-Plan\trash-entry.json",
            br#"{"formatVersion":1,"originalPath":"../outside/Plan.md","deletedAtMs":1}"#,
        );
        location.write_bytes(r".mdx-notes\trash\1-Plan\Plan.md", b"plan");

        assert_eq!(list_trash(&location.root).unwrap(), Vec::new());
        assert_eq!(
            restore_note(&location.root, "1-Plan"),
            Err(DocumentError::NotFound)
        );
    }
}
