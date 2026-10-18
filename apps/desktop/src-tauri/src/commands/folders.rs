use std::fs;
use std::path::Path;
use std::sync::Arc;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::documents::{
    DocumentAccessList, DocumentError, DocumentLocation, is_markdown_path, locate_document,
    location_of_resolved_path,
};

const MAX_LISTED_DOCUMENTS: usize = 1_000;

/// Lets the user choose a folder, and allows the app to open the documents inside it.
#[tauri::command]
pub async fn pick_folder(
    app: AppHandle,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<Option<DocumentLocation>, DocumentError> {
    let access = Arc::clone(&access);
    tauri::async_runtime::spawn_blocking(move || {
        let Some(picked) = app.dialog().file().blocking_pick_folder() else {
            return Ok(None);
        };
        let folder = picked
            .into_path()
            .map_err(|_| DocumentError::InvalidRequest)?;
        access.grant_folder(&folder)?;
        locate_document(&folder).map(Some)
    })
    .await
    .map_err(|_| DocumentError::Unreadable)?
}

/// Lists the Markdown documents directly inside a folder the user has chosen.
#[tauri::command]
pub async fn list_folder_documents(
    folder: String,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<Vec<DocumentLocation>, DocumentError> {
    let access = Arc::clone(&access);
    tauri::async_runtime::spawn_blocking(move || folder_documents(Path::new(&folder), &access))
        .await
        .map_err(|_| DocumentError::Unreadable)?
}

fn folder_documents(
    folder: &Path,
    access: &DocumentAccessList,
) -> Result<Vec<DocumentLocation>, DocumentError> {
    let location = locate_document(folder)?;
    if !access.is_folder_allowed(&location) {
        return Err(DocumentError::AccessDenied);
    }
    // Directory entries carry their type, so cloud-only files are listed without being downloaded.
    let mut documents: Vec<DocumentLocation> = fs::read_dir(location.path())?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|file_type| file_type.is_file()))
        .map(|entry| entry.path())
        .filter(|path| is_markdown_path(path))
        .map(|path| location_of_resolved_path(&path))
        .collect();
    documents.sort_by_key(|document| document.file_name.to_lowercase());
    documents.truncate(MAX_LISTED_DOCUMENTS);
    Ok(documents)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_only_markdown_files_sorted_by_name() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("b-notes.md"), "#").unwrap();
        fs::write(folder.path().join("A-guide.markdown"), "#").unwrap();
        fs::write(folder.path().join("image.png"), "x").unwrap();
        fs::create_dir(folder.path().join("folder.md")).unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(folder.path()).unwrap();

        let names: Vec<String> = folder_documents(folder.path(), &access)
            .unwrap()
            .into_iter()
            .map(|document| document.file_name)
            .collect();

        assert_eq!(names, vec!["A-guide.markdown", "b-notes.md"]);
    }

    #[test]
    fn refuses_folders_the_user_has_not_chosen() {
        let folder = tempfile::tempdir().unwrap();

        assert_eq!(
            folder_documents(folder.path(), &DocumentAccessList::default()),
            Err(DocumentError::AccessDenied)
        );
    }
}
