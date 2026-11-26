use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::commands::documents::{run_blocking, validated_path};
use crate::documents::{
    DocumentAccessList, DocumentError, DocumentLocation, canonical_key_of, locate_document,
};
use crate::notes_location::{
    DEFAULT_NOTES_FOLDER_NAME, NotesFolderInspection, canonical_folder, inspect_folder,
    is_refused_place, mark_location, one_drive_folders, read_marker,
};
use crate::storage::WorkspaceId;

/// UI tests point Documents at a temporary folder, so they never write to the real one.
const DOCUMENTS_FOLDER_OVERRIDE_VARIABLE: &str = "MDX_DOCUMENTS_DIR";

fn documents_folder(app: &AppHandle) -> Option<PathBuf> {
    if cfg!(debug_assertions)
        && let Some(override_folder) = std::env::var_os(DOCUMENTS_FOLDER_OVERRIDE_VARIABLE)
    {
        return Some(PathBuf::from(override_folder));
    }
    app.path().document_dir().ok()
}

/// Documents follows a redirected or OneDrive-backed folder; the sync roots only decide a notice.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownFolders {
    documents: Option<String>,
    synced_folders: Vec<String>,
}

#[tauri::command]
pub fn known_folders(app: AppHandle) -> KnownFolders {
    KnownFolders {
        documents: documents_folder(&app).map(|folder| folder.to_string_lossy().into_owned()),
        synced_folders: one_drive_folders(|name| std::env::var_os(name)),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedNotesLocation {
    location: DocumentLocation,
    location_id: String,
    /// The folder already was a Notes location, so its own id is kept.
    is_existing: bool,
}

/// Makes a folder a Notes location and lets the window read it. A new folder is made only at the
/// default place in Documents; any other folder must be one the user picked.
#[tauri::command]
pub fn prepare_notes_location(
    path: String,
    location_id: String,
    app: AppHandle,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<PreparedNotesLocation, DocumentError> {
    let path = claimable_path(&path, &app, &access)?;
    let location_id =
        WorkspaceId::try_from(location_id).map_err(|_| DocumentError::InvalidRequest)?;
    if is_refused_place(&path, user_folder(&app).as_deref()) {
        return Err(DocumentError::AccessDenied);
    }
    fs::create_dir_all(&path)?;
    let marker = mark_location(&path, location_id.as_str(), now_ms())?;
    access.grant_folder(&path)?;
    Ok(PreparedNotesLocation {
        location: locate_document(&path)?,
        is_existing: marker.location_id != location_id.as_str(),
        location_id: marker.location_id,
    })
}

/// What a folder the window may claim holds, so it can ask before using one with files in it. Off
/// the window's thread, since a network or cloud folder can be slow to list.
#[tauri::command]
pub async fn inspect_notes_folder(
    path: String,
    app: AppHandle,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<NotesFolderInspection, DocumentError> {
    let access = Arc::clone(&access);
    run_blocking(move || {
        let path = claimable_path(&path, &app, &access)?;
        inspect_folder(&path, user_folder(&app).as_deref())
    })
    .await?
}

pub(crate) fn claimable_path(
    path: &str,
    app: &AppHandle,
    access: &DocumentAccessList,
) -> Result<PathBuf, DocumentError> {
    let path = validated_path(path)?;
    let is_picked = |folder: &Path| {
        locate_document(folder).is_ok_and(|location| access.is_folder_allowed(&location))
    };
    if may_claim(&path, documents_folder(app).as_deref(), is_picked) {
        Ok(canonical_folder(&path))
    } else {
        Err(DocumentError::AccessDenied)
    }
}

pub(crate) fn user_folder(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .home_dir()
        .ok()
        .map(|folder| canonical_folder(&folder))
}

/// A folder the user picked, or the default place for Notes folders, which may not exist yet.
pub fn may_claim(path: &Path, documents: Option<&Path>, is_picked: impl Fn(&Path) -> bool) -> bool {
    if !path.is_absolute() {
        return false;
    }
    is_default_place(path, documents) || (path.is_dir() && is_picked(path))
}

/// Whether a Notes workspace's folder is there and is still the same location.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LocationCheck {
    Available,
    NotAvailable,
}

/// Looks for the folder and its marker; a missing folder is reported, never created.
#[tauri::command]
pub fn check_notes_location(
    path: String,
    location_id: String,
) -> Result<LocationCheck, DocumentError> {
    Ok(location_check(&validated_path(&path)?, &location_id))
}

pub fn location_check(path: &Path, location_id: &str) -> LocationCheck {
    let is_same_location = path.is_dir()
        && read_marker(path)
            .is_ok_and(|marker| marker.is_some_and(|marker| marker.location_id == location_id));
    if is_same_location {
        LocationCheck::Available
    } else {
        LocationCheck::NotAvailable
    }
}

/// A folder the user picked to find a moved Notes folder; refused unless its marker has the same id.
#[tauri::command]
pub fn locate_notes_location(
    path: String,
    location_id: String,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<Option<DocumentLocation>, DocumentError> {
    let path = validated_path(&path)?;
    let location = locate_document(&path)?;
    if !access.is_folder_allowed(&location) {
        return Err(DocumentError::AccessDenied);
    }
    Ok((location_check(&path, &location_id) == LocationCheck::Available).then_some(location))
}

fn is_default_place(path: &Path, documents: Option<&Path>) -> bool {
    let (Some(parent), Some(documents), Some(name)) = (path.parent(), documents, path.file_name())
    else {
        return false;
    };
    canonical_key_of(&parent.to_string_lossy()) == canonical_key_of(&documents.to_string_lossy())
        && name
            .to_string_lossy()
            .starts_with(DEFAULT_NOTES_FOLDER_NAME)
}

pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|elapsed| u64::try_from(elapsed.as_millis()).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    const DOCUMENTS: &str = r"C:\Users\Ana\Documents";

    #[test]
    fn a_missing_path_reports_not_available_without_creating_it() {
        let folder = tempfile::tempdir().unwrap();
        let missing = folder.path().join("MDX Notes");

        assert_eq!(
            location_check(&missing, "location-1"),
            LocationCheck::NotAvailable
        );
        assert!(!missing.exists());
    }

    #[test]
    fn the_same_location_is_available_and_another_id_is_not() {
        let folder = tempfile::tempdir().unwrap();
        mark_location(folder.path(), "location-1", 1).unwrap();

        assert_eq!(
            location_check(folder.path(), "location-1"),
            LocationCheck::Available
        );
        assert_eq!(
            location_check(folder.path(), "location-2"),
            LocationCheck::NotAvailable
        );
    }

    #[test]
    fn a_folder_without_its_marker_is_not_available() {
        let folder = tempfile::tempdir().unwrap();

        assert_eq!(
            location_check(folder.path(), "location-1"),
            LocationCheck::NotAvailable
        );
    }

    #[test]
    fn may_make_the_default_folder_in_documents() {
        let documents = Some(Path::new(DOCUMENTS));

        assert!(may_claim(
            Path::new(r"C:\Users\Ana\Documents\MDX Notes"),
            documents,
            |_| false
        ));
        assert!(may_claim(
            Path::new(r"c:\users\ana\documents\MDX Notes - Work"),
            documents,
            |_| false
        ));
    }

    #[test]
    fn refuses_other_places_the_user_did_not_pick() {
        let documents = Some(Path::new(DOCUMENTS));

        assert!(!may_claim(
            Path::new(r"C:\Windows\MDX Notes"),
            documents,
            |_| false
        ));
        assert!(!may_claim(
            Path::new(r"C:\Users\Ana\Documents\Other"),
            documents,
            |_| false
        ));
        assert!(!may_claim(Path::new(r"MDX Notes"), documents, |_| true));
    }

    #[test]
    fn accepts_an_existing_folder_the_user_picked() {
        let folder = tempfile::tempdir().unwrap();

        assert!(may_claim(folder.path(), None, |_| true));
        assert!(!may_claim(folder.path(), None, |_| false));
        assert!(!may_claim(&folder.path().join("missing"), None, |_| true));
    }
}
