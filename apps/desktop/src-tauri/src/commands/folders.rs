use std::fs::{self, DirEntry};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::documents::{
    DocumentAccessList, DocumentError, DocumentLocation, is_markdown_path, locate_document,
    location_of_resolved_path,
};

const MAX_LISTED_ENTRIES_PER_KIND: usize = 1_000;

/// UI tests answer the folder picker with this folder, since WebDriver cannot reach the native dialog.
#[cfg(debug_assertions)]
const PICKED_FOLDER_OVERRIDE_VARIABLE: &str = "MDX_PICKED_FOLDER";

/// Asks the user for a folder; `None` when they cancel.
pub(crate) fn pick_folder_in_dialog(app: &AppHandle) -> Result<Option<PathBuf>, DocumentError> {
    #[cfg(debug_assertions)]
    if let Some(answer) = ui_test_folder_picks::next_answer() {
        return Ok(answer);
    }
    #[cfg(debug_assertions)]
    if let Some(folder) = std::env::var_os(PICKED_FOLDER_OVERRIDE_VARIABLE) {
        return Ok(Some(folder.into()));
    }
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    picked
        .into_path()
        .map(Some)
        .map_err(|_| DocumentError::InvalidRequest)
}

/// UI tests cannot reach the system folder picker, so debug builds answer it with the folders in
/// `MDX_UI_TEST_PICKED_FOLDERS`, separated by `;`, one per pick, and then as if the user cancelled.
#[cfg(debug_assertions)]
mod ui_test_folder_picks {
    use std::collections::VecDeque;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock, PoisonError};

    const PICKED_FOLDERS_VARIABLE: &str = "MDX_UI_TEST_PICKED_FOLDERS";

    /// `None` when the variable is not set, so the real picker opens.
    pub fn next_answer() -> Option<Option<PathBuf>> {
        static ANSWERS: OnceLock<Option<Mutex<VecDeque<PathBuf>>>> = OnceLock::new();
        let answers = ANSWERS
            .get_or_init(|| {
                std::env::var(PICKED_FOLDERS_VARIABLE).ok().map(|folders| {
                    Mutex::new(
                        folders
                            .split(';')
                            .filter(|folder| !folder.is_empty())
                            .map(PathBuf::from)
                            .collect(),
                    )
                })
            })
            .as_ref()?;
        Some(
            answers
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .pop_front(),
        )
    }
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub struct FolderListing {
    folders: Vec<DocumentLocation>,
    documents: Vec<DocumentLocation>,
}

/// Lets the user choose a folder, and allows the app to open the documents inside it.
#[tauri::command]
pub async fn pick_folder(
    app: AppHandle,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<Option<DocumentLocation>, DocumentError> {
    let access = Arc::clone(&access);
    tauri::async_runtime::spawn_blocking(move || {
        let Some(folder) = pick_folder_in_dialog(&app)? else {
            return Ok(None);
        };
        access.grant_folder(&folder)?;
        locate_document(&folder).map(Some)
    })
    .await
    .map_err(|_| DocumentError::Unreadable)?
}

/// Lists the subfolders and Markdown documents directly inside a folder the user has chosen.
#[tauri::command]
pub async fn list_folder_contents(
    folder: String,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<FolderListing, DocumentError> {
    let access = Arc::clone(&access);
    tauri::async_runtime::spawn_blocking(move || folder_listing(Path::new(&folder), &access))
        .await
        .map_err(|_| DocumentError::Unreadable)?
}

fn folder_listing(
    folder: &Path,
    access: &DocumentAccessList,
) -> Result<FolderListing, DocumentError> {
    let location = locate_document(folder)?;
    if !access.is_folder_allowed(&location) {
        return Err(DocumentError::AccessDenied);
    }
    let mut listing = FolderListing::default();
    // Directory entries carry their type, so cloud-only files are listed without being downloaded.
    for entry in fs::read_dir(location.path())?.filter_map(Result::ok) {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let path = entry.path();
        if file_type.is_dir() && !is_hidden(&entry) {
            listing.folders.push(location_of_resolved_path(&path));
        } else if file_type.is_file() && is_markdown_path(&path) {
            listing.documents.push(location_of_resolved_path(&path));
        }
    }
    sort_by_name_and_cap(&mut listing.folders);
    sort_by_name_and_cap(&mut listing.documents);
    Ok(listing)
}

fn sort_by_name_and_cap(locations: &mut Vec<DocumentLocation>) {
    locations.sort_by_key(|location| location.file_name.to_lowercase());
    locations.truncate(MAX_LISTED_ENTRIES_PER_KIND);
}

pub(crate) fn is_hidden(entry: &DirEntry) -> bool {
    entry.file_name().to_string_lossy().starts_with('.') || has_hidden_attribute(entry)
}

#[cfg(windows)]
fn has_hidden_attribute(entry: &DirEntry) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    entry
        .metadata()
        .is_ok_and(|metadata| metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0)
}

#[cfg(not(windows))]
fn has_hidden_attribute(_entry: &DirEntry) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names_of(locations: &[DocumentLocation]) -> Vec<&str> {
        locations
            .iter()
            .map(|location| location.file_name.as_str())
            .collect()
    }

    #[test]
    fn lists_only_markdown_files_sorted_by_name() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("b-notes.md"), "#").unwrap();
        fs::write(folder.path().join("A-guide.markdown"), "#").unwrap();
        fs::write(folder.path().join("image.png"), "x").unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(folder.path()).unwrap();

        let listing = folder_listing(folder.path(), &access).unwrap();

        assert_eq!(
            names_of(&listing.documents),
            vec!["A-guide.markdown", "b-notes.md"]
        );
    }

    #[test]
    fn lists_subfolders_sorted_by_name_and_skips_hidden_ones() {
        let folder = tempfile::tempdir().unwrap();
        fs::create_dir(folder.path().join("hooks")).unwrap();
        fs::create_dir(folder.path().join("Docs")).unwrap();
        fs::create_dir(folder.path().join("folder.md")).unwrap();
        fs::create_dir(folder.path().join(".git")).unwrap();
        fs::write(folder.path().join("README.md"), "#").unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(folder.path()).unwrap();

        let listing = folder_listing(folder.path(), &access).unwrap();

        assert_eq!(
            names_of(&listing.folders),
            vec!["Docs", "folder.md", "hooks"]
        );
        assert_eq!(names_of(&listing.documents), vec!["README.md"]);
    }

    #[test]
    fn lists_a_subfolder_of_a_chosen_folder() {
        let folder = tempfile::tempdir().unwrap();
        let subfolder = folder.path().join("docs");
        fs::create_dir(&subfolder).unwrap();
        fs::write(subfolder.join("PLAN.md"), "#").unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(folder.path()).unwrap();

        let listing = folder_listing(&subfolder, &access).unwrap();

        assert_eq!(names_of(&listing.documents), vec!["PLAN.md"]);
    }

    #[test]
    fn refuses_folders_the_user_has_not_chosen() {
        let folder = tempfile::tempdir().unwrap();

        assert_eq!(
            folder_listing(folder.path(), &DocumentAccessList::default()),
            Err(DocumentError::AccessDenied)
        );
    }
}
