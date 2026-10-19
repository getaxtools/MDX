use std::path::Path;
use std::sync::Arc;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::documents::{
    DocumentAccessList, DocumentError, validated_file_name, write_text_atomically,
};
use crate::open_requests::grant_documents;
use crate::storage::{
    FAVOURITES_FILE_EXTENSION, read_favourites_file, saved_document_paths,
    validated_favourites_json, with_json_extension,
};

/// Asks where to save the exported favourites; returns the saved path, or `None` on cancel.
#[tauri::command]
pub async fn export_favourites(
    contents: String,
    suggested_file_name: String,
    app: AppHandle,
) -> Result<Option<String>, DocumentError> {
    tauri::async_runtime::spawn_blocking(move || {
        validated_favourites_json(&contents)?;
        let file_name = validated_file_name(&suggested_file_name)?;
        let Some(chosen) = app
            .dialog()
            .file()
            .add_filter("JSON", &[FAVOURITES_FILE_EXTENSION])
            .set_file_name(file_name)
            .blocking_save_file()
            .and_then(|file| file.into_path().ok())
        else {
            return Ok(None);
        };
        let destination = with_json_extension(chosen);
        write_text_atomically(&destination, &contents)?;
        Ok(Some(destination.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|_| DocumentError::Unreadable)?
}

/// Asks for an exported favourites file and returns its text, allowing the app to open the
/// documents it lists, because choosing the file is the user's consent; `None` on cancel.
#[tauri::command]
pub async fn import_favourites(
    app: AppHandle,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<Option<String>, DocumentError> {
    let access = Arc::clone(&access);
    tauri::async_runtime::spawn_blocking(move || {
        let Some(chosen) = app
            .dialog()
            .file()
            .add_filter("JSON", &[FAVOURITES_FILE_EXTENSION])
            .blocking_pick_file()
            .and_then(|file| file.into_path().ok())
        else {
            return Ok(None);
        };
        let contents = read_favourites_file(&chosen)?;
        grant_listed_documents(&contents, &access);
        Ok(Some(contents))
    })
    .await
    .map_err(|_| DocumentError::Unreadable)?
}

fn grant_listed_documents(contents: &str, access: &DocumentAccessList) {
    let paths = saved_document_paths(contents);
    grant_documents(&paths.documents, access);
    for folder in &paths.folders {
        let _ = access.grant_folder(Path::new(folder));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_the_documents_and_folders_an_imported_file_lists() {
        let folder = tempfile::tempdir().unwrap();
        let document = folder.path().join("notes").join("a.md");
        let specs = folder.path().join("specs");
        std::fs::create_dir_all(document.parent().unwrap()).unwrap();
        std::fs::create_dir(&specs).unwrap();
        std::fs::write(&document, "# A").unwrap();
        let contents = serde_json::json!({
            "format": "mdx-favourites",
            "favourites": [
                { "location": { "displayPath": document }, "kind": "file" },
                { "location": { "displayPath": specs }, "kind": "folder" }
            ]
        })
        .to_string();
        let access = DocumentAccessList::default();

        grant_listed_documents(&contents, &access);

        let located = crate::documents::locate_document(&document).unwrap();
        let specs_location = crate::documents::locate_document(&specs).unwrap();
        assert!(access.is_allowed(&located));
        assert!(access.is_folder_allowed(&specs_location));
    }
}
