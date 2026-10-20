use std::path::Path;
use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::commands::documents::validated_path;
use crate::documents::{
    DocumentAccessList, DocumentError, MAX_DOCUMENT_BYTES, encode_document_text,
    encoding_for_label, is_markdown_path, locate_document, modified_at_ms_of,
    write_bytes_atomically,
};

/// Edited text to write over an open document, with what the editor knew about the file.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditedDocument {
    path: String,
    text: String,
    encoding: String,
    has_byte_order_mark: bool,
    expected_modified_at_ms: u64,
    should_overwrite_changes_on_disk: bool,
}

/// Saves edited text in the document's own encoding and returns the file's new modified time.
/// Refuses with `changedOnDisk` when another program changed the file since it was opened.
#[tauri::command]
pub async fn save_document(
    document: EditedDocument,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<u64, DocumentError> {
    let access = Arc::clone(&access);
    tauri::async_runtime::spawn_blocking(move || save_edited_document(&document, &access))
        .await
        .map_err(|_| DocumentError::Unreadable)?
}

fn save_edited_document(
    document: &EditedDocument,
    access: &DocumentAccessList,
) -> Result<u64, DocumentError> {
    let location = locate_document(&validated_path(&document.path)?)?;
    // Writing needs more than a granted folder: the app must have opened this very document.
    if !access.is_allowed(&location) || !access.was_opened(&location) {
        return Err(DocumentError::AccessDenied);
    }
    let path = location.path();
    if !is_markdown_path(&path) {
        return Err(DocumentError::NotMarkdown);
    }
    if u64::try_from(document.text.len()).unwrap_or(u64::MAX) > MAX_DOCUMENT_BYTES {
        return Err(DocumentError::TooLarge);
    }
    let encoding = encoding_for_label(&document.encoding).ok_or(DocumentError::InvalidRequest)?;
    if !document.should_overwrite_changes_on_disk && has_changed_on_disk(&path, document)? {
        return Err(DocumentError::ChangedOnDisk);
    }
    let bytes = encode_document_text(&document.text, encoding, document.has_byte_order_mark)?;
    write_bytes_atomically(&path, &bytes)?;
    modified_at_ms_of(&path)
}

fn has_changed_on_disk(path: &Path, document: &EditedDocument) -> Result<bool, DocumentError> {
    Ok(modified_at_ms_of(path)? != document.expected_modified_at_ms)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    fn granted_document(content: &[u8]) -> (tempfile::TempDir, String, DocumentAccessList) {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("guide.md");
        fs::write(&path, content).unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(folder.path()).unwrap();
        access.remember_opened(&locate_document(&path).unwrap());
        (folder, path.to_string_lossy().into_owned(), access)
    }

    fn edited(path: &str, text: &str, encoding: &str) -> EditedDocument {
        EditedDocument {
            path: path.to_owned(),
            text: text.to_owned(),
            encoding: encoding.to_owned(),
            has_byte_order_mark: false,
            expected_modified_at_ms: modified_at_ms_of(Path::new(path)).unwrap(),
            should_overwrite_changes_on_disk: false,
        }
    }

    #[test]
    fn saves_the_text_in_the_document_encoding() {
        let (_folder, path, access) = granted_document(b"caf\xE9");

        save_edited_document(&edited(&path, "café crème", "windows-1252"), &access).unwrap();

        assert_eq!(fs::read(&path).unwrap(), b"caf\xE9 cr\xE8me");
    }

    #[test]
    fn keeps_a_byte_order_mark() {
        let (_folder, path, access) = granted_document(b"\xEF\xBB\xBF# Old");
        let document = EditedDocument {
            has_byte_order_mark: true,
            ..edited(&path, "# New", "utf-8")
        };

        save_edited_document(&document, &access).unwrap();

        assert_eq!(fs::read(&path).unwrap(), b"\xEF\xBB\xBF# New");
    }

    #[test]
    fn refuses_when_another_program_changed_the_file_unless_told_to_overwrite() {
        let (_folder, path, access) = granted_document(b"# Old");
        let document = EditedDocument {
            expected_modified_at_ms: 1,
            ..edited(&path, "# Mine", "utf-8")
        };

        let refused = save_edited_document(&document, &access);
        let overwritten = save_edited_document(
            &EditedDocument {
                should_overwrite_changes_on_disk: true,
                ..document
            },
            &access,
        );

        assert_eq!(refused, Err(DocumentError::ChangedOnDisk));
        assert!(overwritten.is_ok());
        assert_eq!(fs::read_to_string(&path).unwrap(), "# Mine");
    }

    #[test]
    fn refuses_documents_outside_granted_folders() {
        let (_folder, path, _access) = granted_document(b"# Old");

        let result = save_edited_document(
            &edited(&path, "# New", "utf-8"),
            &DocumentAccessList::default(),
        );

        assert_eq!(result, Err(DocumentError::AccessDenied));
    }

    #[test]
    fn refuses_a_document_in_a_granted_folder_that_was_never_opened() {
        let (folder, _, access) = granted_document(b"# Guide");
        let other = folder.path().join("other.md");
        fs::write(&other, "# Other").unwrap();

        let result = save_edited_document(
            &edited(&other.to_string_lossy(), "# Overwritten", "utf-8"),
            &access,
        );

        assert_eq!(result, Err(DocumentError::AccessDenied));
        assert_eq!(fs::read_to_string(&other).unwrap(), "# Other");
    }

    #[test]
    fn refuses_text_the_encoding_cannot_store_and_leaves_the_file_alone() {
        let (_folder, path, access) = granted_document(b"plain");

        let result = save_edited_document(&edited(&path, "✓ done", "windows-1252"), &access);

        assert_eq!(result, Err(DocumentError::CannotEncode));
        assert_eq!(fs::read(&path).unwrap(), b"plain");
    }

    #[test]
    fn returns_the_new_modified_time() {
        let (_folder, path, access) = granted_document(b"# Old");

        let modified_at_ms =
            save_edited_document(&edited(&path, "# New", "utf-8"), &access).unwrap();

        assert_eq!(modified_at_ms, modified_at_ms_of(Path::new(&path)).unwrap());
    }
}
