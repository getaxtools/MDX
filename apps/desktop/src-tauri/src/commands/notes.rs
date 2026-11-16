use std::sync::Arc;

use tauri::State;

use crate::commands::documents::{run_blocking, validated_path};
use crate::commands::notes_index::validated_note_path;
use crate::commands::notes_location::now_ms;
use crate::documents::{DocumentAccessList, DocumentError, DocumentLocation, locate_document};
use crate::notes::{self, AppliedLinkUpdates, NotesRoot, TrashEntry};
use crate::notes_index::{
    MAX_LINK_EDITS_PER_NOTE, MAX_LINK_TARGET_BYTES, MAX_LINK_UPDATE_NOTES, NoteLinkEdits,
};

const CONTENT_HASH_LENGTH: usize = 64;

/// Makes an empty note in the location, a folder in it, or under a note as its child.
#[tauri::command]
pub async fn create_note(
    location: String,
    parent: String,
    name: String,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<DocumentLocation, DocumentError> {
    let parent = validated_path(&parent)?;
    let access = Arc::clone(&access);
    run_blocking(move || notes::create_note(&writable_root(&location, &access)?, &parent, &name))
        .await?
}

/// A note to make with its first text, such as today's note from the daily template.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInFolder {
    /// A folder inside the location, with `/` between its parts; empty for the location itself.
    folder: String,
    name: String,
    text: String,
}

/// A note's first text comes from a template, never from a whole document.
const MAX_NEW_NOTE_TEXT_BYTES: usize = 1024 * 1024;

/// Makes a note with text in a folder of the location, making the folder on first use.
#[tauri::command]
pub async fn create_note_in_folder(
    location: String,
    note: NoteInFolder,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<DocumentLocation, DocumentError> {
    if note.text.len() > MAX_NEW_NOTE_TEXT_BYTES {
        return Err(DocumentError::TooLarge);
    }
    let access = Arc::clone(&access);
    run_blocking(move || {
        let root = writable_root(&location, &access)?;
        notes::create_note_in_folder(&root, &note.folder, &note.name, &note.text)
    })
    .await?
}
/// Renames a note and the folder of its child notes.
#[tauri::command]
pub async fn rename_note(
    location: String,
    note: String,
    name: String,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<DocumentLocation, DocumentError> {
    let note = validated_path(&note)?;
    let access = Arc::clone(&access);
    run_blocking(move || notes::rename_note(&writable_root(&location, &access)?, &note, &name))
        .await?
}

/// Moves a note and its child notes into a folder of the location or under another note.
#[tauri::command]
pub async fn move_note(
    location: String,
    note: String,
    into: String,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<DocumentLocation, DocumentError> {
    let note = validated_path(&note)?;
    let into = validated_path(&into)?;
    let access = Arc::clone(&access);
    run_blocking(move || notes::move_note(&writable_root(&location, &access)?, &note, &into))
        .await?
}

/// Moves a note and its child notes into the location's trash.
#[tauri::command]
pub async fn delete_note(
    location: String,
    note: String,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<TrashEntry, DocumentError> {
    let note = validated_path(&note)?;
    let access = Arc::clone(&access);
    run_blocking(move || notes::delete_note(&writable_root(&location, &access)?, &note, now_ms()))
        .await?
}

#[tauri::command]
pub async fn list_note_trash(
    location: String,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<Vec<TrashEntry>, DocumentError> {
    let access = Arc::clone(&access);
    run_blocking(move || notes::list_trash(&allowed_root(&location, &access)?)).await?
}

/// Puts a deleted note back where it was, under a new name if that one is taken.
#[tauri::command]
pub async fn restore_note(
    location: String,
    entry_id: String,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<DocumentLocation, DocumentError> {
    let access = Arc::clone(&access);
    run_blocking(move || notes::restore_note(&writable_root(&location, &access)?, &entry_id))
        .await?
}

/// Removes the trash entries for good and says how many there were.
#[tauri::command]
pub async fn empty_note_trash(
    location: String,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<usize, DocumentError> {
    let access = Arc::clone(&access);
    run_blocking(move || notes::empty_trash(&writable_root(&location, &access)?)).await?
}

/// Changes the planned link targets in notes of the location after a rename or move, and returns
/// the edits that undo it; a note changed since the plan is left as it is.
#[tauri::command]
pub async fn apply_note_link_updates(
    location: String,
    updates: Vec<NoteLinkEdits>,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<AppliedLinkUpdates, DocumentError> {
    validated_link_updates(&updates)?;
    let access = Arc::clone(&access);
    run_blocking(move || {
        Ok(notes::apply_link_updates(
            &writable_root(&location, &access)?,
            &updates,
        ))
    })
    .await?
}

/// Checks the shape of the edits before any note is read: paths inside the location with `/`
/// between their parts and no `..`, a SHA-256 in hex for each note, at most as many notes and edits
/// as a plan holds, and targets of at most 4,096 bytes without a line break. Writing then also
/// refuses any path that is not a Markdown note inside the location or that is in a dot folder.
fn validated_link_updates(updates: &[NoteLinkEdits]) -> Result<(), DocumentError> {
    if updates.len() > MAX_LINK_UPDATE_NOTES {
        return Err(DocumentError::InvalidRequest);
    }
    for note in updates {
        validated_note_path(&note.path)?;
        validated_note_path(&note.path_once_undone)?;
        let is_hash = note.content_hash.len() == CONTENT_HASH_LENGTH
            && note
                .content_hash
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit());
        let are_edits_link_targets = note.edits.len() <= MAX_LINK_EDITS_PER_NOTE
            && note.edits.iter().all(|edit| {
                [&edit.before, &edit.after].iter().all(|target| {
                    target.len() <= MAX_LINK_TARGET_BYTES && !target.contains(['\n', '\r'])
                })
            });
        if !is_hash || !are_edits_link_targets {
            return Err(DocumentError::InvalidRequest);
        }
    }
    Ok(())
}

/// The Notes location, which the window must have been granted when the workspace was shown.
/// A location the window may change: allowed, and not being moved.
fn writable_root(location: &str, access: &DocumentAccessList) -> Result<NotesRoot, DocumentError> {
    let root = allowed_root(location, access)?;
    if access.is_read_only(&locate_document(root.folder())?) {
        return Err(DocumentError::AccessDenied);
    }
    Ok(root)
}

pub(crate) fn allowed_root(
    location: &str,
    access: &DocumentAccessList,
) -> Result<NotesRoot, DocumentError> {
    let root = NotesRoot::new(&validated_path(location)?)?;
    if !access.is_folder_allowed(&locate_document(root.folder())?) {
        return Err(DocumentError::AccessDenied);
    }
    Ok(root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_location_being_moved_refuses_changes_but_stays_readable() {
        let folder = tempfile::tempdir().unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(folder.path()).unwrap();
        access.make_folder_read_only(folder.path());
        let location = folder.path().to_string_lossy();

        assert_eq!(
            writable_root(&location, &access).err(),
            Some(DocumentError::AccessDenied)
        );
        assert!(allowed_root(&location, &access).is_ok());
    }

    #[test]
    fn a_location_the_window_was_not_granted_is_refused() {
        let folder = tempfile::tempdir().unwrap();

        let result = allowed_root(
            &folder.path().to_string_lossy(),
            &DocumentAccessList::default(),
        );

        assert_eq!(result.err(), Some(DocumentError::AccessDenied));
    }

    #[test]
    fn a_granted_location_is_accepted() {
        let folder = tempfile::tempdir().unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(folder.path()).unwrap();

        let root = allowed_root(&folder.path().to_string_lossy(), &access).unwrap();

        assert_eq!(root.folder(), dunce::canonicalize(folder.path()).unwrap());
    }

    fn link_update(path: &str, after: &str) -> NoteLinkEdits {
        NoteLinkEdits {
            path: path.to_owned(),
            path_once_undone: path.to_owned(),
            content_hash: "a".repeat(CONTENT_HASH_LENGTH),
            edits: vec![crate::notes_index::LinkEdit {
                start: 2,
                end: 7,
                before: "Draft".to_owned(),
                after: after.to_owned(),
            }],
        }
    }

    #[test]
    fn link_updates_that_are_not_link_targets_inside_the_location_are_refused() {
        let too_long = "a".repeat(MAX_LINK_TARGET_BYTES + 1);
        let mut not_a_hash = link_update("Inbox.md", "Plan");
        not_a_hash.content_hash = "not a hash".to_owned();

        for updates in [
            vec![link_update("../Inbox.md", "Plan")],
            vec![link_update(r"C:\Inbox.md", "Plan")],
            vec![link_update("Inbox.md", "Plan]]\n# Injected")],
            vec![link_update("Inbox.md", &too_long)],
            vec![not_a_hash],
            vec![link_update("Inbox.md", "Plan"); MAX_LINK_UPDATE_NOTES + 1],
        ] {
            assert_eq!(
                validated_link_updates(&updates),
                Err(DocumentError::InvalidRequest)
            );
        }
        assert_eq!(
            validated_link_updates(&[link_update("Projects/Inbox.md", "Plan")]),
            Ok(())
        );
    }

    #[test]
    fn a_missing_location_is_not_found() {
        let folder = tempfile::tempdir().unwrap();
        let missing = folder.path().join("gone");

        let result = allowed_root(&missing.to_string_lossy(), &DocumentAccessList::default());

        assert_eq!(result.err(), Some(DocumentError::NotFound));
        assert!(!missing.exists());
    }
}
