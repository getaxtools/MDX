use std::collections::HashSet;
use std::path::{MAIN_SEPARATOR, Path, PathBuf};
use std::sync::{Mutex, PoisonError};

#[cfg(test)]
use super::location_of_resolved_path;
use super::{DocumentError, DocumentLocation, canonical_key_of, locate_document};

#[derive(Debug, Default)]
pub struct DocumentAccessList {
    granted_folder_keys: Mutex<Vec<String>>,
    /// Documents granted one by one, where granting their folder would grant too much.
    granted_document_keys: Mutex<HashSet<String>>,
    opened_document_keys: Mutex<HashSet<String>>,
    /// Notes folders being moved: readable, but nothing in them may be written until the move ends.
    read_only_folder_keys: Mutex<HashSet<String>>,
}

impl DocumentAccessList {
    pub fn grant_folder(&self, folder: &Path) -> Result<(), DocumentError> {
        let location = locate_document(folder)?;
        self.grant_folder_key(location.canonical_key);
        Ok(())
    }

    /// Grants a folder already located, by exactly its canonical key.
    pub fn grant_located_folder(&self, folder: &DocumentLocation) {
        self.grant_folder_key(folder.canonical_key.clone());
    }

    pub fn grant_folder_of(&self, document: &Path) -> Result<DocumentLocation, DocumentError> {
        let location = locate_document(document)?;
        if let Some(folder) = location.path().parent() {
            self.grant_folder_key(canonical_key_of(&folder.to_string_lossy()));
        }
        Ok(location)
    }

    /// Grants the folder of a document already located, by its canonical key; when that folder is a
    /// drive root, the user's profile folder or a folder holding it, only the document is granted.
    pub fn grant_linked_document(&self, document: &DocumentLocation) {
        match document.path().parent() {
            Some(folder) if !is_too_broad_to_grant(folder) => {
                self.grant_folder_key(canonical_key_of(&folder.to_string_lossy()));
            }
            _ => {
                self.granted_document_keys
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .insert(document.canonical_key.clone());
            }
        }
    }

    pub fn is_allowed(&self, location: &DocumentLocation) -> bool {
        let is_granted_alone = self
            .granted_document_keys
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .contains(&location.canonical_key);
        is_granted_alone
            || self
                .granted_folder_keys
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

    /// The folder no longer belongs to the window, as after its notes moved elsewhere.
    pub fn revoke_folder(&self, folder: &Path) {
        let key = canonical_key_of(&folder.to_string_lossy());
        self.granted_folder_keys
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .retain(|granted| *granted != key);
    }

    pub fn make_folder_read_only(&self, folder: &Path) {
        self.read_only_folder_keys
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(canonical_key_of(&folder.to_string_lossy()));
    }

    pub fn make_folder_writable(&self, folder: &Path) {
        self.read_only_folder_keys
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(&canonical_key_of(&folder.to_string_lossy()));
    }

    /// The location is a read-only folder or lies inside one.
    pub fn is_read_only(&self, location: &DocumentLocation) -> bool {
        self.read_only_folder_keys
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .iter()
            .any(|folder_key| {
                location.canonical_key == *folder_key
                    || is_inside_folder(&location.canonical_key, folder_key)
            })
    }

    /// A file the user chose to write may not land in a notes folder being moved.
    pub fn check_writable_destination(&self, destination: &Path) -> Result<(), DocumentError> {
        let is_in_read_only_folder = destination
            .parent()
            .and_then(|folder| locate_document(folder).ok())
            .is_some_and(|folder| self.is_read_only(&folder));
        if is_in_read_only_folder {
            Err(DocumentError::AccessDenied)
        } else {
            Ok(())
        }
    }

    /// Records a document the app has read, which is what makes it eligible to be saved over.
    pub fn remember_opened(&self, location: &DocumentLocation) {
        self.opened_document_keys
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(location.canonical_key.clone());
    }

    pub fn was_opened(&self, location: &DocumentLocation) -> bool {
        self.opened_document_keys
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .contains(&location.canonical_key)
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

/// A drive root, the user's profile folder or a folder holding it would grant far more than a project.
pub fn is_too_broad_to_grant(folder: &Path) -> bool {
    folder.parent().is_none() || profile_folder().is_some_and(|profile| profile.starts_with(folder))
}

fn profile_folder() -> Option<PathBuf> {
    let variable = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    dunce::canonicalize(std::env::var_os(variable)?).ok()
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

    #[test]
    fn a_linked_document_grants_its_folder_unless_that_folder_is_too_broad() {
        let access = DocumentAccessList::default();
        let in_drive_root = location_of_resolved_path(Path::new(r"C:\plan.md"));
        let profile = profile_folder().unwrap();
        let in_profile = location_of_resolved_path(&profile.join("plan.md"));
        let in_project = location_of_resolved_path(Path::new(r"C:\Projects\shop\plan.md"));

        for document in [&in_drive_root, &in_profile, &in_project] {
            access.grant_linked_document(document);
        }

        let sibling = |path: &Path| location_of_resolved_path(&path.with_file_name("other.md"));
        assert!(access.is_allowed(&in_drive_root) && access.is_allowed(&in_profile));
        assert!(!access.is_allowed(&sibling(&in_drive_root.path())));
        assert!(!access.is_allowed(&sibling(&in_profile.path())));
        assert!(access.is_allowed(&sibling(&in_project.path())));
    }

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
    fn a_read_only_folder_stays_readable_until_it_is_writable_again() {
        let root = tree();
        let access = DocumentAccessList::default();
        access.grant_folder(&root.path().join("docs")).unwrap();

        access.make_folder_read_only(&root.path().join("docs"));

        let note = location(&root, "docs/guides/b.md");
        assert!(access.is_allowed(&note) && access.is_read_only(&note));
        assert!(!access.is_read_only(&location(&root, "docs-old/c.md")));
        access.make_folder_writable(&root.path().join("docs"));
        assert!(!access.is_read_only(&note));
    }

    #[test]
    fn a_chosen_file_in_a_read_only_folder_is_refused() {
        let root = tree();
        let access = DocumentAccessList::default();
        access.make_folder_read_only(&root.path().join("docs"));

        assert_eq!(
            access.check_writable_destination(
                &root.path().join("docs").join("guides").join("new.md")
            ),
            Err(DocumentError::AccessDenied)
        );
        assert_eq!(
            access.check_writable_destination(&root.path().join("other").join("new.md")),
            Ok(())
        );
        assert_eq!(
            access.check_writable_destination(&root.path().join("missing").join("new.md")),
            Ok(())
        );
    }

    #[test]
    fn a_revoked_folder_is_no_longer_allowed() {
        let root = tree();
        let access = DocumentAccessList::default();
        access.grant_folder(&root.path().join("docs")).unwrap();

        access.revoke_folder(&locate_document(&root.path().join("docs")).unwrap().path());

        assert!(!access.is_allowed(&location(&root, "docs/a.md")));
    }

    #[test]
    fn fails_to_grant_a_missing_folder() {
        let root = tree();

        let result = DocumentAccessList::default().grant_folder(&root.path().join("missing"));

        assert_eq!(result, Err(DocumentError::NotFound));
    }
}
