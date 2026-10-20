use std::path::Path;
use std::sync::Arc;

use tauri::State;

use crate::documents::{DocumentAccessList, DocumentError, locate_document};
use crate::live_reload::{DocumentWatcher, FolderWatcher, WatchedFolder};

const MAX_WATCHED_DOCUMENTS: usize = 200;
const MAX_WATCHED_FOLDERS: usize = 200;

/// Watches the open documents for changes made by other programs; replaces the previous set.
#[tauri::command]
pub async fn watch_documents(
    paths: Vec<String>,
    watcher: State<'_, DocumentWatcher>,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<(), DocumentError> {
    if paths.len() > MAX_WATCHED_DOCUMENTS {
        return Err(DocumentError::InvalidRequest);
    }
    let access = Arc::clone(&access);
    let allowed_paths =
        tauri::async_runtime::spawn_blocking(move || allowed_display_paths(&paths, &access))
            .await
            .map_err(|_| DocumentError::Unreadable)?;
    watcher.watch(&allowed_paths);
    Ok(())
}

/// Watches the expanded folders for added, renamed or removed entries; replaces the previous set.
#[tauri::command]
pub async fn watch_folders(
    paths: Vec<String>,
    watcher: State<'_, FolderWatcher>,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<(), DocumentError> {
    if paths.len() > MAX_WATCHED_FOLDERS {
        return Err(DocumentError::InvalidRequest);
    }
    let access = Arc::clone(&access);
    let folders = tauri::async_runtime::spawn_blocking(move || allowed_folders(paths, &access))
        .await
        .map_err(|_| DocumentError::Unreadable)?;
    watcher.watch(folders);
    Ok(())
}

fn allowed_folders(paths: Vec<String>, access: &DocumentAccessList) -> Vec<WatchedFolder> {
    paths
        .into_iter()
        .filter_map(|requested_path| {
            let location = locate_document(Path::new(&requested_path)).ok()?;
            let path = location.path();
            (path.is_dir() && access.is_folder_allowed(&location)).then_some(WatchedFolder {
                path,
                requested_path,
            })
        })
        .collect()
}

fn allowed_display_paths(paths: &[String], access: &DocumentAccessList) -> Vec<String> {
    paths
        .iter()
        .filter_map(|path| locate_document(Path::new(path)).ok())
        .filter(|location| access.is_allowed(location))
        .map(|location| location.display_path)
        .collect()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    #[test]
    fn watches_only_documents_the_user_has_opened() {
        let allowed_folder = tempfile::tempdir().unwrap();
        let other_folder = tempfile::tempdir().unwrap();
        let allowed = allowed_folder.path().join("a.md");
        let other = other_folder.path().join("b.md");
        fs::write(&allowed, "#").unwrap();
        fs::write(&other, "#").unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(allowed_folder.path()).unwrap();

        let watched = allowed_display_paths(
            &[
                allowed.to_string_lossy().into_owned(),
                other.to_string_lossy().into_owned(),
                "missing.md".to_owned(),
            ],
            &access,
        );

        assert_eq!(watched.len(), 1);
        assert!(watched[0].ends_with("a.md"));
    }

    #[test]
    fn watches_only_folders_the_user_has_chosen() {
        let allowed_folder = tempfile::tempdir().unwrap();
        let other_folder = tempfile::tempdir().unwrap();
        let document = allowed_folder.path().join("a.md");
        fs::write(&document, "#").unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(allowed_folder.path()).unwrap();
        let allowed_path = allowed_folder.path().to_string_lossy().into_owned();

        let watched = allowed_folders(
            vec![
                allowed_path.clone(),
                other_folder.path().to_string_lossy().into_owned(),
                document.to_string_lossy().into_owned(),
                "missing".to_owned(),
            ],
            &access,
        );

        assert_eq!(watched.len(), 1);
        assert_eq!(watched[0].requested_path, allowed_path);
    }
}
