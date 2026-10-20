use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Deserialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};

use crate::documents::{
    DocumentAccessList, DocumentError, MAX_DOCUMENT_BYTES, OpenedDocument, PathStatus,
    copy_document, encoding_for_label, is_markdown_path, locate_document, open_allowed_document,
    open_allowed_document_as, status_of_path, validated_file_name, with_markdown_extension,
    write_text_atomically,
};
use crate::open_requests::{StartupDocuments, grant_documents};

const MAX_PATH_CHARACTERS: usize = 32_767;
const MAX_STATUS_CHECKS: usize = 500;
const MARKDOWN_FILTER_EXTENSIONS: [&str; 5] = ["md", "markdown", "mdown", "mkd", "mdx"];

/// Opens a document, decoded with `encoding` when the user chose one, or else detected.
#[tauri::command]
pub async fn open_document(
    path: String,
    encoding: Option<String>,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<OpenedDocument, DocumentError> {
    let path = validated_path(&path)?;
    let chosen_encoding = encoding
        .map(|label| encoding_for_label(&label).ok_or(DocumentError::InvalidRequest))
        .transpose()?;
    let access = Arc::clone(&access);
    run_blocking(move || match chosen_encoding {
        Some(encoding) => open_allowed_document_as(&path, &access, encoding),
        None => open_allowed_document(&path, &access),
    })
    .await?
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

/// What Save As writes: a copy of an open document, or the text of a document not saved yet.
#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SaveSource {
    Copy { path: String },
    Text { text: String, file_name: String },
}

/// Asks where to save, writes the document there and returns the saved path, or `None` on cancel.
#[tauri::command]
pub async fn save_document_as(
    source: SaveSource,
    app: AppHandle,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<Option<String>, DocumentError> {
    let access = Arc::clone(&access);
    run_blocking(move || {
        let request = SaveRequest::validated(source, &access)?;
        let Some(chosen) = request
            .dialog(app.dialog().file())
            .blocking_save_file()
            .and_then(|file| file.into_path().ok())
        else {
            return Ok(None);
        };
        let destination = with_markdown_extension(chosen);
        request.write_to(&destination)?;
        access.grant_folder_of(&destination)?;
        Ok(Some(locate_document(&destination)?.display_path))
    })
    .await?
}

enum SaveRequest {
    Copy { source: PathBuf, file_name: String },
    Text { text: String, file_name: String },
}

impl SaveRequest {
    fn validated(source: SaveSource, access: &DocumentAccessList) -> Result<Self, DocumentError> {
        match source {
            SaveSource::Copy { path } => {
                let location = locate_document(&validated_path(&path)?)?;
                if !access.is_allowed(&location) {
                    return Err(DocumentError::AccessDenied);
                }
                if !is_markdown_path(&location.path()) {
                    return Err(DocumentError::NotMarkdown);
                }
                Ok(Self::Copy {
                    source: location.path(),
                    file_name: location.file_name,
                })
            }
            SaveSource::Text { text, file_name } => {
                if u64::try_from(text.len()).unwrap_or(u64::MAX) > MAX_DOCUMENT_BYTES {
                    return Err(DocumentError::TooLarge);
                }
                let file_name = validated_file_name(&file_name)?.to_owned();
                Ok(Self::Text { text, file_name })
            }
        }
    }

    fn dialog(&self, dialog: FileDialogBuilder<tauri::Wry>) -> FileDialogBuilder<tauri::Wry> {
        let dialog = dialog.add_filter("Markdown", &MARKDOWN_FILTER_EXTENSIONS);
        match self {
            Self::Copy { source, file_name } => {
                let dialog = dialog.set_file_name(file_name);
                match source.parent() {
                    Some(folder) => dialog.set_directory(folder),
                    None => dialog,
                }
            }
            Self::Text { file_name, .. } => dialog.set_file_name(file_name),
        }
    }

    fn write_to(&self, destination: &Path) -> Result<(), DocumentError> {
        match self {
            Self::Copy { source, .. } => copy_document(source, destination),
            Self::Text { text, .. } => write_text_atomically(destination, text),
        }
    }
}

pub(crate) fn validated_path(path: &str) -> Result<PathBuf, DocumentError> {
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

    fn folder_with_document() -> (tempfile::TempDir, PathBuf, DocumentAccessList) {
        let folder = tempfile::tempdir().unwrap();
        let document = folder.path().join("guide.md");
        std::fs::write(&document, "# Guide").unwrap();
        (folder, document, DocumentAccessList::default())
    }

    #[test]
    fn saves_a_copy_only_of_a_document_the_user_has_opened() {
        let (_folder, document, access) = folder_with_document();
        let copy = || SaveSource::Copy {
            path: document.to_string_lossy().into_owned(),
        };

        assert!(matches!(
            SaveRequest::validated(copy(), &access),
            Err(DocumentError::AccessDenied)
        ));
        access.grant_folder_of(&document).unwrap();
        assert!(matches!(
            SaveRequest::validated(copy(), &access),
            Ok(SaveRequest::Copy { file_name, .. }) if file_name == "guide.md"
        ));
    }

    #[test]
    fn refuses_to_save_a_copy_of_a_file_that_is_not_markdown() {
        let (folder, document, access) = folder_with_document();
        let image = folder.path().join("image.png");
        std::fs::write(&image, "x").unwrap();
        access.grant_folder_of(&document).unwrap();

        let request = SaveSource::Copy {
            path: image.to_string_lossy().into_owned(),
        };

        assert!(matches!(
            SaveRequest::validated(request, &access),
            Err(DocumentError::NotMarkdown)
        ));
    }

    #[test]
    fn refuses_new_documents_with_an_unsafe_name() {
        let request = SaveSource::Text {
            text: "# New".to_owned(),
            file_name: r"..\escape.md".to_owned(),
        };

        assert!(matches!(
            SaveRequest::validated(request, &DocumentAccessList::default()),
            Err(DocumentError::InvalidRequest)
        ));
    }

    #[test]
    fn accepts_a_new_document_with_a_plain_name() {
        let request = SaveSource::Text {
            text: "# New".to_owned(),
            file_name: "Untitled-1.md".to_owned(),
        };

        assert!(matches!(
            SaveRequest::validated(request, &DocumentAccessList::default()),
            Ok(SaveRequest::Text { file_name, .. }) if file_name == "Untitled-1.md"
        ));
    }

    #[test]
    fn reads_save_requests_sent_by_the_frontend() {
        let copy: SaveSource =
            serde_json::from_str(r#"{"kind":"copy","path":"C:/docs/a.md"}"#).unwrap();
        let text: SaveSource =
            serde_json::from_str(r##"{"kind":"text","text":"# A","fileName":"Untitled-1.md"}"##)
                .unwrap();

        assert!(matches!(copy, SaveSource::Copy { path } if path == "C:/docs/a.md"));
        assert!(matches!(text, SaveSource::Text { file_name, .. } if file_name == "Untitled-1.md"));
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
