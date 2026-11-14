use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::attachments::{DroppedImages, MAX_ATTACHMENT_BYTES, save_attachment_bytes};
use crate::commands::documents::validated_path;
use crate::documents::{DocumentAccessList, DocumentError, locate_document};

/// Where the picture comes from: a file the user dropped on the window, or pasted bytes.
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AttachmentSource {
    DroppedFile { path: String },
    PastedBytes { bytes: Vec<u8> },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentRequest {
    document_path: String,
    /// A folder below the document's folder, such as `assets`.
    attachment_folder: String,
    suggested_name: String,
    source: AttachmentSource,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedAttachmentReply {
    relative_path: String,
}

/// Copies a dropped or pasted picture next to an open document and returns its relative path.
#[tauri::command]
pub async fn save_attachment(
    request: AttachmentRequest,
    access: State<'_, Arc<DocumentAccessList>>,
    dropped: State<'_, Arc<DroppedImages>>,
) -> Result<SavedAttachmentReply, DocumentError> {
    let access = Arc::clone(&access);
    let dropped = Arc::clone(&dropped);
    tauri::async_runtime::spawn_blocking(move || {
        save_requested_attachment(request, &access, &dropped)
    })
    .await
    .map_err(|_| DocumentError::Unreadable)?
}

fn save_requested_attachment(
    request: AttachmentRequest,
    access: &DocumentAccessList,
    dropped: &DroppedImages,
) -> Result<SavedAttachmentReply, DocumentError> {
    let location = locate_document(&validated_path(&request.document_path)?)?;
    if !access.is_allowed(&location) || !access.was_opened(&location) {
        return Err(DocumentError::AccessDenied);
    }
    let document = location.path();
    let folder = document.parent().ok_or(DocumentError::InvalidRequest)?;
    let bytes = source_bytes(request.source, dropped)?;
    let saved = save_attachment_bytes(
        folder,
        &request.attachment_folder,
        &request.suggested_name,
        &bytes,
    )?;
    Ok(SavedAttachmentReply {
        relative_path: saved.relative_path,
    })
}

fn source_bytes(
    source: AttachmentSource,
    dropped: &DroppedImages,
) -> Result<Vec<u8>, DocumentError> {
    match source {
        AttachmentSource::PastedBytes { bytes } => Ok(bytes),
        AttachmentSource::DroppedFile { path } => {
            let path = PathBuf::from(path);
            if !dropped.take(&path) {
                return Err(DocumentError::AccessDenied);
            }
            if fs::metadata(&path)?.len() > u64::try_from(MAX_ATTACHMENT_BYTES).unwrap_or(u64::MAX)
            {
                return Err(DocumentError::TooLarge);
            }
            Ok(fs::read(&path)?)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\npicture";

    fn opened_document() -> (tempfile::TempDir, String, DocumentAccessList) {
        let folder = tempfile::tempdir().unwrap();
        let document = folder.path().join("guide.md");
        fs::write(&document, "# Guide").unwrap();
        let access = DocumentAccessList::default();
        let location = access.grant_folder_of(&document).unwrap();
        access.remember_opened(&location);
        (folder, location.display_path, access)
    }

    fn request(document_path: &str, source: AttachmentSource) -> AttachmentRequest {
        AttachmentRequest {
            document_path: document_path.to_owned(),
            attachment_folder: "assets".to_owned(),
            suggested_name: "chart.png".to_owned(),
            source,
        }
    }

    #[test]
    fn copies_a_dropped_picture_next_to_the_document() {
        let (folder, document, access) = opened_document();
        let picture = folder.path().join("chart.png");
        fs::write(&picture, PNG).unwrap();
        let dropped = DroppedImages::default();
        dropped.remember([picture.clone()]);
        let source = AttachmentSource::DroppedFile {
            path: picture.to_string_lossy().into_owned(),
        };

        let saved =
            save_requested_attachment(request(&document, source), &access, &dropped).unwrap();

        assert_eq!(saved.relative_path, "assets/chart.png");
    }

    #[test]
    fn refuses_a_file_that_was_not_dropped() {
        let (folder, document, access) = opened_document();
        let picture = folder.path().join("chart.png");
        fs::write(&picture, PNG).unwrap();
        let source = AttachmentSource::DroppedFile {
            path: picture.to_string_lossy().into_owned(),
        };

        let refusal = save_requested_attachment(
            request(&document, source),
            &access,
            &DroppedImages::default(),
        );

        assert_eq!(refusal, Err(DocumentError::AccessDenied));
    }

    #[test]
    fn refuses_a_document_the_app_did_not_open() {
        let folder = tempfile::tempdir().unwrap();
        let document = folder.path().join("other.md");
        fs::write(&document, "#").unwrap();
        let source = AttachmentSource::PastedBytes {
            bytes: PNG.to_vec(),
        };

        let refusal = save_requested_attachment(
            request(&document.to_string_lossy(), source),
            &DocumentAccessList::default(),
            &DroppedImages::default(),
        );

        assert_eq!(refusal, Err(DocumentError::AccessDenied));
    }

    #[test]
    fn saves_pasted_bytes() {
        let (_folder, document, access) = opened_document();
        let source = AttachmentSource::PastedBytes {
            bytes: PNG.to_vec(),
        };

        let saved = save_requested_attachment(
            request(&document, source),
            &access,
            &DroppedImages::default(),
        );

        assert_eq!(
            saved,
            Ok(SavedAttachmentReply {
                relative_path: "assets/chart.png".to_owned()
            })
        );
    }
}
