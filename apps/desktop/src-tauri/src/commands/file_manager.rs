use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use super::documents::validated_path;
use crate::documents::{DocumentAccessList, DocumentError, locate_document};

/// Shows a document or folder the user has opened in File Explorer, with the item selected.
#[tauri::command]
pub async fn reveal_in_file_manager(
    path: String,
    app: AppHandle,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<(), DocumentError> {
    let requested = validated_path(&path)?;
    let access = Arc::clone(&access);
    let revealed =
        tauri::async_runtime::spawn_blocking(move || revealable_path(&requested, &access))
            .await
            .map_err(|_| DocumentError::Unreadable)??;
    app.opener()
        .reveal_item_in_dir(revealed)
        .map_err(|_| DocumentError::Unreadable)
}

fn revealable_path(path: &Path, access: &DocumentAccessList) -> Result<PathBuf, DocumentError> {
    let location = locate_document(path)?;
    if access.is_allowed(&location) || access.is_folder_allowed(&location) {
        Ok(location.path())
    } else {
        Err(DocumentError::AccessDenied)
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    #[test]
    fn reveals_documents_and_folders_the_user_has_opened() {
        let folder = tempfile::tempdir().unwrap();
        let document = folder.path().join("guide.md");
        fs::write(&document, "# Guide").unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(folder.path()).unwrap();

        assert!(revealable_path(&document, &access).is_ok());
        assert!(revealable_path(folder.path(), &access).is_ok());
    }

    #[test]
    fn refuses_paths_the_user_has_not_opened() {
        let folder = tempfile::tempdir().unwrap();
        let document = folder.path().join("private.md");
        fs::write(&document, "# Private").unwrap();

        assert_eq!(
            revealable_path(&document, &DocumentAccessList::default()),
            Err(DocumentError::AccessDenied)
        );
    }

    #[test]
    fn reports_paths_that_do_not_exist() {
        let folder = tempfile::tempdir().unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(folder.path()).unwrap();

        assert!(revealable_path(&folder.path().join("missing.md"), &access).is_err());
    }
}
