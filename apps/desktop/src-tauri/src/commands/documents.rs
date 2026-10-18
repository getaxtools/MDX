use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::documents::{
    DocumentAccessList, DocumentError, OpenedDocument, PathStatus, open_allowed_document,
    status_of_path,
};
use crate::open_requests::{StartupDocuments, grant_documents};

const MAX_PATH_CHARACTERS: usize = 32_767;
const MAX_STATUS_CHECKS: usize = 500;
const MARKDOWN_FILTER_EXTENSIONS: [&str; 5] = ["md", "markdown", "mdown", "mkd", "mdx"];

#[tauri::command]
pub async fn open_document(
    path: String,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<OpenedDocument, DocumentError> {
    let path = validated_path(&path)?;
    let access = Arc::clone(&access);
    run_blocking(move || open_allowed_document(&path, &access)).await?
}

#[tauri::command]
pub async fn pick_documents(
    app: AppHandle,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<Vec<String>, DocumentError> {
    let access = Arc::clone(&access);
    run_blocking(move || {
        let picked = app
            .dialog()
            .file()
            .add_filter("Markdown", &MARKDOWN_FILTER_EXTENSIONS)
            .blocking_pick_files()
            .unwrap_or_default();
        let paths: Vec<PathBuf> = picked
            .into_iter()
            .filter_map(|file| file.into_path().ok())
            .collect();
        grant_documents(&paths, &access)
    })
    .await
}

#[tauri::command]
pub async fn check_path_statuses(paths: Vec<String>) -> Result<Vec<PathStatus>, DocumentError> {
    if paths.len() > MAX_STATUS_CHECKS {
        return Err(DocumentError::InvalidRequest);
    }
    let paths = paths
        .iter()
        .map(|path| validated_path(path))
        .collect::<Result<Vec<_>, _>>()?;
    run_blocking(move || paths.iter().map(|path| status_of_path(path)).collect()).await
}

#[tauri::command]
pub fn take_startup_documents(startup: State<'_, StartupDocuments>) -> Vec<String> {
    startup.take()
}

fn validated_path(path: &str) -> Result<PathBuf, DocumentError> {
    let is_valid = !path.trim().is_empty()
        && path.chars().count() <= MAX_PATH_CHARACTERS
        && !path.contains('\0');
    if is_valid {
        Ok(Path::new(path).to_path_buf())
    } else {
        Err(DocumentError::InvalidRequest)
    }
}

async fn run_blocking<Output: Send + 'static>(
    work: impl FnOnce() -> Output + Send + 'static,
) -> Result<Output, DocumentError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| DocumentError::Unreadable)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_an_ordinary_path() {
        assert_eq!(
            validated_path("C:/docs/a.md"),
            Ok(PathBuf::from("C:/docs/a.md"))
        );
    }

    #[test]
    fn rejects_empty_overlong_and_nul_containing_paths() {
        assert_eq!(validated_path("   "), Err(DocumentError::InvalidRequest));
        assert_eq!(
            validated_path(&"a".repeat(MAX_PATH_CHARACTERS + 1)),
            Err(DocumentError::InvalidRequest)
        );
        assert_eq!(validated_path("a\0.md"), Err(DocumentError::InvalidRequest));
    }

    #[test]
    fn rejects_too_many_status_checks() {
        let paths = vec!["a.md".to_owned(); MAX_STATUS_CHECKS + 1];

        let result = tauri::async_runtime::block_on(check_path_statuses(paths));

        assert_eq!(result, Err(DocumentError::InvalidRequest));
    }

    #[test]
    fn checks_statuses_in_the_order_requested() {
        let folder = tempfile::tempdir().unwrap();
        std::fs::write(folder.path().join("a.md"), "#").unwrap();
        let paths = vec![
            folder.path().join("a.md").to_string_lossy().into_owned(),
            folder.path().join("gone.md").to_string_lossy().into_owned(),
        ];

        let statuses = tauri::async_runtime::block_on(check_path_statuses(paths)).unwrap();

        assert_eq!(statuses, vec![PathStatus::Available, PathStatus::Missing]);
    }
}
