use std::sync::Arc;

use tauri::State;

use crate::commands::documents::{run_blocking, validated_path};
use crate::commands::notes_location::now_ms;
use crate::documents::{DocumentAccessList, DocumentError, DocumentLocation, locate_document};
use crate::notes::{self, NotesRoot, TrashEntry};

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
    run_blocking(move || notes::create_note(&allowed_root(&location, &access)?, &parent, &name))
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
        let root = allowed_root(&location, &access)?;
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
    run_blocking(move || notes::rename_note(&allowed_root(&location, &access)?, &note, &name))
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
    run_blocking(move || notes::move_note(&allowed_root(&location, &access)?, &note, &into)).await?
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
    run_blocking(move || notes::delete_note(&allowed_root(&location, &access)?, &note, now_ms()))
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
    run_blocking(move || notes::restore_note(&allowed_root(&location, &access)?, &entry_id)).await?
}

/// Removes the trash entries for good and says how many there were.
#[tauri::command]
pub async fn empty_note_trash(
    location: String,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<usize, DocumentError> {
    let access = Arc::clone(&access);
    run_blocking(move || notes::empty_trash(&allowed_root(&location, &access)?)).await?
}

/// The Notes location, which the window must have been granted when the workspace was shown.
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

    #[test]
    fn a_missing_location_is_not_found() {
        let folder = tempfile::tempdir().unwrap();
        let missing = folder.path().join("gone");

        let result = allowed_root(&missing.to_string_lossy(), &DocumentAccessList::default());

        assert_eq!(result.err(), Some(DocumentError::NotFound));
        assert!(!missing.exists());
    }
}
