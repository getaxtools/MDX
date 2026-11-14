use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::documents::{DocumentError, write_text_atomically};

/// The app's own folder inside a Notes location; dot-named, so note trees and tools skip it.
pub const NOTES_APP_FOLDER: &str = ".mdx-notes";
const MARKER_FILE_NAME: &str = "notes-location.json";
const MARKER_FORMAT_VERSION: u32 = 1;

/// Marks a folder as one Notes location, so it is found again after a move and claimed only once.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationMarker {
    pub format_version: u32,
    pub location_id: String,
    pub created_at_ms: u64,
}

/// The marker of a Notes location, or `None` when the folder has none.
pub fn read_marker(location: &Path) -> Result<Option<LocationMarker>, DocumentError> {
    let text = match fs::read_to_string(location.join(NOTES_APP_FOLDER).join(MARKER_FILE_NAME)) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    serde_json::from_str(&text)
        .map(Some)
        .map_err(|_| DocumentError::Unreadable)
}

/// Gives the folder a marker unless it has one; an existing marker keeps its id, as for an existing notes folder.
pub fn mark_location(
    location: &Path,
    new_location_id: &str,
    created_at_ms: u64,
) -> Result<LocationMarker, DocumentError> {
    if let Some(marker) = read_marker(location)? {
        return Ok(marker);
    }
    let app_folder = location.join(NOTES_APP_FOLDER);
    fs::create_dir_all(&app_folder)?;
    let marker = LocationMarker {
        format_version: MARKER_FORMAT_VERSION,
        location_id: new_location_id.to_owned(),
        created_at_ms,
    };
    let text = serde_json::to_string_pretty(&marker).map_err(|_| DocumentError::InvalidRequest)?;
    write_text_atomically(&app_folder.join(MARKER_FILE_NAME), &text)?;
    Ok(marker)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_folder_gets_a_marker() {
        let folder = tempfile::tempdir().unwrap();

        let marker = mark_location(folder.path(), "location-1", 1_000).unwrap();

        assert_eq!(marker.location_id, "location-1");
        assert_eq!(read_marker(folder.path()).unwrap(), Some(marker));
        let entries: Vec<_> = fs::read_dir(folder.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(entries, [NOTES_APP_FOLDER]);
    }

    #[test]
    fn an_existing_notes_folder_keeps_its_id() {
        let folder = tempfile::tempdir().unwrap();
        mark_location(folder.path(), "location-1", 1_000).unwrap();

        let marker = mark_location(folder.path(), "location-2", 2_000).unwrap();

        assert_eq!(marker.location_id, "location-1");
    }

    #[test]
    fn a_folder_without_a_marker_is_not_a_location() {
        let folder = tempfile::tempdir().unwrap();

        assert_eq!(read_marker(folder.path()), Ok(None));
    }

    #[test]
    fn a_damaged_marker_is_reported_not_replaced() {
        let folder = tempfile::tempdir().unwrap();
        fs::create_dir(folder.path().join(NOTES_APP_FOLDER)).unwrap();
        fs::write(
            folder.path().join(NOTES_APP_FOLDER).join(MARKER_FILE_NAME),
            "{ broken",
        )
        .unwrap();

        assert_eq!(
            mark_location(folder.path(), "location-2", 2_000),
            Err(DocumentError::Unreadable)
        );
    }
}
