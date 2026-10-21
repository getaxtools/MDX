use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::State;

use crate::commands::folders::is_hidden;
use crate::documents::{
    DocumentAccessList, DocumentError, DocumentLocation, is_markdown_path, locate_document,
    location_of_resolved_path,
};

const MAX_SEARCHED_FOLDERS: usize = 100;
const MAX_FOUND_DOCUMENTS: usize = 5_000;
const MAX_FOLDER_DEPTH: usize = 12;
const MAX_VISITED_FOLDERS: usize = 10_000;

/// The Markdown documents in chosen folders and their subfolders, for finding a document by name.
#[tauri::command]
pub async fn find_folder_documents(
    folders: Vec<String>,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<Vec<DocumentLocation>, DocumentError> {
    if folders.len() > MAX_SEARCHED_FOLDERS {
        return Err(DocumentError::InvalidRequest);
    }
    let access = Arc::clone(&access);
    tauri::async_runtime::spawn_blocking(move || documents_in_folders(&folders, &access))
        .await
        .map_err(|_| DocumentError::Unreadable)
}

/// What one search may still do, shared by every chosen folder so many roots cannot multiply it.
struct SearchBudget {
    folders_left: usize,
    found: Vec<DocumentLocation>,
    seen_keys: HashSet<String>,
}

impl SearchBudget {
    fn is_spent(&self) -> bool {
        self.folders_left == 0 || self.found.len() >= MAX_FOUND_DOCUMENTS
    }

    fn add(&mut self, document: DocumentLocation) {
        if self.found.len() < MAX_FOUND_DOCUMENTS
            && self.seen_keys.insert(document.canonical_key.clone())
        {
            self.found.push(document);
        }
    }
}

pub fn documents_in_folders(
    folders: &[String],
    access: &DocumentAccessList,
) -> Vec<DocumentLocation> {
    let mut budget = SearchBudget {
        folders_left: MAX_VISITED_FOLDERS,
        found: Vec::new(),
        seen_keys: HashSet::new(),
    };
    for folder in folders {
        let Ok(location) = locate_document(Path::new(folder)) else {
            continue;
        };
        if access.is_folder_allowed(&location) {
            collect_documents_below(&location.path(), &mut budget);
        }
        if budget.is_spent() {
            break;
        }
    }
    budget.found
}

/// Walks a folder depth first in name order, skipping hidden folders and never following links.
fn collect_documents_below(root: &Path, budget: &mut SearchBudget) {
    let mut folders_to_visit = vec![(root.to_path_buf(), 0)];
    while let Some((folder, depth)) = folders_to_visit.pop() {
        if budget.is_spent() {
            return;
        }
        budget.folders_left -= 1;
        let (subfolders, folder_documents) = entries_of(&folder);
        for document in folder_documents {
            budget.add(document);
        }
        if depth < MAX_FOLDER_DEPTH {
            folders_to_visit.extend(subfolders.into_iter().rev().map(|path| (path, depth + 1)));
        }
    }
}

fn entries_of(folder: &Path) -> (Vec<PathBuf>, Vec<DocumentLocation>) {
    let Ok(entries) = fs::read_dir(folder) else {
        return (Vec::new(), Vec::new());
    };
    let mut entries: Vec<_> = entries.filter_map(Result::ok).collect();
    entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_lowercase());
    let mut subfolders = Vec::new();
    let mut documents = Vec::new();
    for entry in entries {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let path = entry.path();
        if file_type.is_dir() && !is_hidden(&entry) {
            subfolders.push(path);
        } else if file_type.is_file() && is_markdown_path(&path) {
            documents.push(location_of_resolved_path(&path));
        }
    }
    (subfolders, documents)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn granted_folder() -> (tempfile::TempDir, DocumentAccessList) {
        let folder = tempfile::tempdir().unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(folder.path()).unwrap();
        (folder, access)
    }

    fn names_of(documents: &[DocumentLocation]) -> Vec<&str> {
        documents
            .iter()
            .map(|document| document.file_name.as_str())
            .collect()
    }

    fn display_path_of(folder: &tempfile::TempDir) -> String {
        folder.path().to_string_lossy().into_owned()
    }

    #[test]
    fn finds_markdown_documents_in_subfolders() {
        let (folder, access) = granted_folder();
        fs::create_dir_all(folder.path().join("guides").join("setup")).unwrap();
        fs::write(folder.path().join("README.md"), "#").unwrap();
        fs::write(folder.path().join("guides").join("intro.md"), "#").unwrap();
        fs::write(
            folder
                .path()
                .join("guides")
                .join("setup")
                .join("install.md"),
            "#",
        )
        .unwrap();
        fs::write(folder.path().join("guides").join("image.png"), "x").unwrap();

        let documents = documents_in_folders(&[display_path_of(&folder)], &access);

        assert_eq!(
            names_of(&documents),
            vec!["README.md", "intro.md", "install.md"]
        );
    }

    #[test]
    fn skips_hidden_folders() {
        let (folder, access) = granted_folder();
        fs::create_dir(folder.path().join(".git")).unwrap();
        fs::write(folder.path().join(".git").join("notes.md"), "#").unwrap();

        let documents = documents_in_folders(&[display_path_of(&folder)], &access);

        assert!(documents.is_empty());
    }

    #[test]
    fn finds_nothing_in_folders_the_user_has_not_chosen() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("secret.md"), "#").unwrap();

        let documents =
            documents_in_folders(&[display_path_of(&folder)], &DocumentAccessList::default());

        assert!(documents.is_empty());
    }

    #[test]
    fn lists_a_document_once_when_folders_overlap() {
        let (folder, access) = granted_folder();
        fs::create_dir(folder.path().join("docs")).unwrap();
        fs::write(folder.path().join("docs").join("plan.md"), "#").unwrap();
        let subfolder = folder.path().join("docs").to_string_lossy().into_owned();

        let documents = documents_in_folders(&[display_path_of(&folder), subfolder], &access);

        assert_eq!(names_of(&documents), vec!["plan.md"]);
    }
}
