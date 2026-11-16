use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::commands::documents::run_blocking;
use crate::commands::notes::allowed_root;
use crate::documents::{DocumentAccessList, DocumentError};
use crate::notes_index::{
    Backlink, ExcludedPaths, IndexEvent, LinkUpdatePlan, NoteChange, NoteHeading, NoteMove,
    NoteSearchResults, NoteSuggestion, NotesIndexes, NotesLocationToShow, TagCount,
};
use crate::storage::WorkspaceId;

pub const NOTES_INDEX_STATUS_EVENT: &str = "notes-index-status";
/// The notes a reconcile read or dropped, so the window can refresh what it shows of them.
pub const NOTES_INDEX_CHANGES_EVENT: &str = "notes-index-changes";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexChanges {
    location_id: String,
    changes: Vec<NoteChange>,
}
const MAX_QUERY_CHARACTERS: usize = 200;

/// The Notes workspace to show: its folder, the id of its index and the paths the index leaves out.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShownNotes {
    path: String,
    location_id: String,
    excluded_paths: Vec<String>,
}
const MAX_NOTE_PATH_CHARACTERS: usize = 1_024;

/// Opens the index of the shown Notes workspace and brings it up to date in the background,
/// reporting its progress as `notes-index-status` events.
#[tauri::command]
pub async fn show_notes_index(
    location: ShownNotes,
    app: AppHandle,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<(), DocumentError> {
    let location_id =
        WorkspaceId::try_from(location.location_id).map_err(|_| DocumentError::InvalidRequest)?;
    let excluded =
        ExcludedPaths::new(&location.excluded_paths).map_err(|_| DocumentError::InvalidRequest)?;
    let access = Arc::clone(&access);
    run_blocking(move || {
        let root = allowed_root(&location.path, &access)?;
        let indexes = app.state::<Arc<NotesIndexes>>();
        let reporting_app = app.clone();
        let shown = NotesLocationToShow {
            root: root.folder().to_path_buf(),
            location_id: location_id.as_str().to_owned(),
            excluded,
        };
        indexes
            .show(shown, move |event| emit_index_event(&reporting_app, event))
            .map_err(|_| DocumentError::Unreadable)
    })
    .await?
}

fn emit_index_event(app: &AppHandle, event: IndexEvent) {
    let _ = match event {
        IndexEvent::Status(status) => app.emit(NOTES_INDEX_STATUS_EVENT, status),
        IndexEvent::Changes {
            location_id,
            changes,
        } => app.emit(
            NOTES_INDEX_CHANGES_EVENT,
            IndexChanges {
                location_id,
                changes,
            },
        ),
    };
}

/// Reconciles the shown index again, for a location that reports no changes, when the window gets the focus.
#[tauri::command]
pub fn refresh_notes_index(location_id: String, indexes: State<'_, Arc<NotesIndexes>>) {
    indexes.refresh(&location_id);
}

/// Removes every notes index for Clear All Data; notes stay, and an index is built again when shown.
#[tauri::command]
pub async fn clear_notes_indexes(
    indexes: State<'_, Arc<NotesIndexes>>,
) -> Result<usize, DocumentError> {
    let indexes = Arc::clone(&indexes);
    run_blocking(move || indexes.clear_all().map_err(|_| DocumentError::Unreadable)).await?
}

/// Stops the build of the index once another workspace is shown.
#[tauri::command]
pub fn hide_notes_index(indexes: State<'_, Arc<NotesIndexes>>) {
    indexes.hide();
}

/// Searches the notes of the shown Notes workspace; `tag:` and `path:` words filter the notes.
#[tauri::command]
pub async fn search_notes(
    location_id: String,
    query: String,
    indexes: State<'_, Arc<NotesIndexes>>,
) -> Result<NoteSearchResults, DocumentError> {
    if query.chars().count() > MAX_QUERY_CHARACTERS {
        return Err(DocumentError::InvalidRequest);
    }
    let indexes = Arc::clone(&indexes);
    run_blocking(move || {
        indexes
            .search(&location_id, &query)
            .map_err(|_| DocumentError::Unreadable)?
            .ok_or(DocumentError::NotFound)
    })
    .await?
}

/// The notes linking to a note of the shown Notes workspace, with the line each link is on.
#[tauri::command]
pub async fn note_backlinks(
    location_id: String,
    note_path: String,
    indexes: State<'_, Arc<NotesIndexes>>,
) -> Result<Vec<Backlink>, DocumentError> {
    validated_note_path(&note_path)?;
    let indexes = Arc::clone(&indexes);
    run_blocking(move || shown_answer(indexes.backlinks(&location_id, &note_path))).await?
}

/// The tags of the shown Notes workspace with the number of notes carrying each.
#[tauri::command]
pub async fn note_tags(
    location_id: String,
    indexes: State<'_, Arc<NotesIndexes>>,
) -> Result<Vec<TagCount>, DocumentError> {
    let indexes = Arc::clone(&indexes);
    run_blocking(move || shown_answer(indexes.tags(&location_id))).await?
}

/// Notes to offer while a wiki-link is typed in a note, nearest first.
#[tauri::command]
pub async fn note_suggestions(
    location_id: String,
    typed: String,
    from_note: String,
    indexes: State<'_, Arc<NotesIndexes>>,
) -> Result<Vec<NoteSuggestion>, DocumentError> {
    if typed.chars().count() > MAX_QUERY_CHARACTERS {
        return Err(DocumentError::InvalidRequest);
    }
    validated_note_path(&from_note)?;
    let indexes = Arc::clone(&indexes);
    run_blocking(move || shown_answer(indexes.suggestions(&location_id, &typed, &from_note)))
        .await?
}

/// The headings to offer after `#` in a wiki-link, of the note its target means from the typing note.
#[tauri::command]
pub async fn note_headings(
    location_id: String,
    target: String,
    from_note: String,
    indexes: State<'_, Arc<NotesIndexes>>,
) -> Result<Vec<NoteHeading>, DocumentError> {
    if target.chars().count() > MAX_NOTE_PATH_CHARACTERS {
        return Err(DocumentError::InvalidRequest);
    }
    validated_note_path(&from_note)?;
    let indexes = Arc::clone(&indexes);
    run_blocking(move || shown_answer(indexes.headings(&location_id, &target, &from_note))).await?
}

/// The link edits a rename or move of a note needs in the notes linking to it, planned after the
/// note moved; nothing is written.
#[tauri::command]
pub async fn plan_note_link_updates(
    location_id: String,
    moved: NoteMove,
    indexes: State<'_, Arc<NotesIndexes>>,
) -> Result<LinkUpdatePlan, DocumentError> {
    validated_note_path(&moved.from)?;
    validated_note_path(&moved.to)?;
    let indexes = Arc::clone(&indexes);
    run_blocking(move || shown_answer(indexes.link_updates(&location_id, &moved))).await?
}

/// A note's path inside the location, with forward slashes, that never climbs out of it.
pub(crate) fn validated_note_path(path: &str) -> Result<(), DocumentError> {
    let is_valid = !path.is_empty()
        && path.chars().count() <= MAX_NOTE_PATH_CHARACTERS
        && !path.contains(['\\', ':', '\0'])
        && path
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..");
    if is_valid {
        Ok(())
    } else {
        Err(DocumentError::InvalidRequest)
    }
}

fn shown_answer<Answer>(
    answer: Result<Option<Answer>, crate::notes_index::IndexError>,
) -> Result<Answer, DocumentError> {
    answer
        .map_err(|_| DocumentError::Unreadable)?
        .ok_or(DocumentError::NotFound)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oversized_or_malformed_requests_are_refused() {
        let too_long = "a/".repeat(MAX_NOTE_PATH_CHARACTERS);

        for path in [
            "",
            "../Plan.md",
            "Projects/../../Plan.md",
            r"C:\Plan.md",
            "a//b.md",
            too_long.as_str(),
        ] {
            assert_eq!(
                validated_note_path(path),
                Err(DocumentError::InvalidRequest),
                "{path:?}"
            );
        }
        assert_eq!(validated_note_path("Projects/Plan.md"), Ok(()));
    }
}
