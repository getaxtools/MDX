use std::path::{MAIN_SEPARATOR, Path};
use std::sync::{Mutex, PoisonError};

use super::{DocumentError, DocumentLocation, canonical_key_of, locate_document};

#[derive(Debug, Default)]
pub struct DocumentAccessList {
    granted_folder_keys: Mutex<Vec<String>>,
}

impl DocumentAccessList {
    pub fn grant_folder(&self, folder: &Path) -> Result<(), DocumentError> {
        let location = locate_document(folder)?;
        self.grant_folder_key(location.canonical_key);
        Ok(())
    }

    pub fn grant_folder_of(&self, document: &Path) -> Result<DocumentLocation, DocumentError> {
        let location = locate_document(document)?;
        if let Some(folder) = location.path().parent() {
            self.grant_folder_key(canonical_key_of(&folder.to_string_lossy()));
        }
        Ok(location)
    }

    pub fn is_allowed(&self, location: &DocumentLocation) -> bool {
        self.granted_folder_keys
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .iter()
            .any(|folder_key| is_inside_folder(&location.canonical_key, folder_key))
    }

    pub fn is_folder_allowed(&self, folder: &DocumentLocation) -> bool {
        self.granted_folder_keys
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .iter()
            .any(|folder_key| {
                folder.canonical_key == *folder_key
                    || is_inside_folder(&folder.canonical_key, folder_key)
            })
    }

    fn grant_folder_key(&self, folder_key: String) {
        let mut folder_keys = self
            .granted_folder_keys
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        if !folder_keys.contains(&folder_key) {
            folder_keys.push(folder_key);
        }
    }
}

fn is_inside_folder(document_key: &str, folder_key: &str) -> bool {
    let folder_with_separator = if folder_key.ends_with(MAIN_SEPARATOR) {
        folder_key.to_owned()
    } else {
        format!("{folder_key}{MAIN_SEPARATOR}")
    };
    document_key.starts_with(&folder_with_separator)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    fn tree() -> tempfile::TempDir {
        let root = tempfile::tempdir().unwrap();
        for folder in ["docs/guides", "docs-old", "other"] {
            fs::create_dir_all(root.path().join(folder)).unwrap();
        }
        for file in [
            "docs/a.md",
            "docs/guides/b.md",
            "docs-old/c.md",
            "other/d.md",
        ] {
            fs::write(root.path().join(file), "#").unwrap();
        }
        root
    }

    fn location(root: &tempfile::TempDir, file: &str) -> DocumentLocation {
        locate_document(&root.path().join(file)).unwrap()
    }

    #[test]
    fn allows_documents_in_and_below_the_folder_of_a_granted_document() {
        let root = tree();
        let access = DocumentAccessList::default();

        access
            .grant_folder_of(&root.path().join("docs/a.md"))
            .unwrap();

        assert!(access.is_allowed(&location(&root, "docs/a.md")));
        assert!(access.is_allowed(&location(&root, "docs/guides/b.md")));
        assert!(!access.is_allowed(&location(&root, "other/d.md")));
    }

    #[test]
    fn does_not_treat_a_folder_name_prefix_as_inside() {
        let root = tree();
        let access = DocumentAccessList::default();

        access.grant_folder(&root.path().join("docs")).unwrap();

        assert!(!access.is_allowed(&location(&root, "docs-old/c.md")));
    }

    #[test]
    fn allows_nothing_by_default() {
        let root = tree();

        assert!(!DocumentAccessList::default().is_allowed(&location(&root, "docs/a.md")));
    }

    #[test]
    fn fails_to_grant_a_missing_folder() {
        let root = tree();

        let result = DocumentAccessList::default().grant_folder(&root.path().join("missing"));

        assert_eq!(result, Err(DocumentError::NotFound));
    }
}
