use std::fs;
use std::path::{Path, PathBuf};

use crate::documents::{
    DocumentAccessList, DocumentError, DocumentLocation, is_too_broad_to_grant, locate_document,
};

const MAX_LINK_PATH_CHARACTERS: usize = 1_024;

/// The folder a link inside a granted project root leads to, located once so the same folder is shown
/// and granted. The folder holding the link must be granted too, so no path outside a grant is probed.
pub fn linked_folder_target(
    root: &Path,
    link_path: &str,
    access: &DocumentAccessList,
) -> Result<DocumentLocation, DocumentError> {
    let relative = validated_link_path(link_path)?;
    let root_location = locate_document(root)?;
    if !access.is_folder_allowed(&root_location) {
        return Err(DocumentError::AccessDenied);
    }
    let unresolved_link = root_location.path().join(&relative);
    let (Some(parent), Some(link_name)) = (unresolved_link.parent(), unresolved_link.file_name())
    else {
        return Err(DocumentError::InvalidRequest);
    };
    // A missing folder answers as an ungranted one does, so nothing about the disk outside a grant shows.
    let parent_location = locate_document(parent).map_err(|_| DocumentError::AccessDenied)?;
    if !access.is_folder_allowed(&parent_location) {
        return Err(DocumentError::AccessDenied);
    }
    let link = parent_location.path().join(link_name);
    if !fs::symlink_metadata(&link)?.file_type().is_symlink() {
        return Err(DocumentError::InvalidRequest);
    }
    let target = locate_document(&link)?;
    if !target.path().is_dir() || is_too_broad_to_grant(&target.path()) {
        return Err(DocumentError::InvalidRequest);
    }
    Ok(target)
}

/// Grants a linked folder's tree for the session once the user agrees, so the next scan follows the link.
/// `confirm` asks the user, naming the target; nothing is granted when the user declines.
pub fn follow_linked_folder(
    root: &Path,
    link_path: &str,
    access: &DocumentAccessList,
    confirm: impl FnOnce(&DocumentLocation) -> bool,
) -> Result<bool, DocumentError> {
    let target = linked_folder_target(root, link_path, access)?;
    if !confirm(&target) {
        return Ok(false);
    }
    access.grant_located_folder(&target);
    Ok(true)
}

/// A relative path inside a root, refused when any part could climb out of it or name a drive.
pub fn validated_link_path(link_path: &str) -> Result<PathBuf, DocumentError> {
    if link_path.chars().count() > MAX_LINK_PATH_CHARACTERS {
        return Err(DocumentError::InvalidRequest);
    }
    let mut relative = PathBuf::new();
    for part in link_path.split(['/', '\\']) {
        let is_unsafe =
            part.is_empty() || part == "." || part == ".." || part.contains([':', '\0']);
        if is_unsafe {
            return Err(DocumentError::InvalidRequest);
        }
        relative.push(part);
    }
    Ok(relative)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spec_projects::test_support::{granted, link_folder, write_files};

    fn project_with_link() -> (tempfile::TempDir, tempfile::TempDir) {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        write_files(outside.path(), &["specs/tabs/spec.md"]);
        link_folder(&root.path().join("openspec"), outside.path());
        (root, outside)
    }

    #[test]
    fn grants_exactly_the_target_it_asked_about_after_the_user_agrees() {
        let (root, outside) = project_with_link();
        let access = granted(root.path());
        let mut asked_about = None;

        let followed = follow_linked_folder(root.path(), "openspec", &access, |target| {
            asked_about = Some(target.clone());
            true
        })
        .unwrap();

        let outside_location = locate_document(outside.path()).unwrap();
        assert!(followed);
        assert_eq!(asked_about, Some(outside_location.clone()));
        assert!(access.is_folder_allowed(&outside_location));
    }

    #[test]
    fn grants_nothing_when_the_user_declines() {
        let (root, outside) = project_with_link();
        let access = granted(root.path());

        let followed = follow_linked_folder(root.path(), "openspec", &access, |_| false).unwrap();

        assert!(!followed);
        assert!(!access.is_folder_allowed(&locate_document(outside.path()).unwrap()));
    }

    #[test]
    fn refuses_without_asking_for_an_ungranted_root_a_plain_folder_or_a_climbing_path() {
        let (root, _outside) = project_with_link();
        write_files(root.path(), &["specs/a.md"]);
        let access = granted(root.path());
        let never_asked = |_: &DocumentLocation| -> bool { panic!("the user must not be asked") };

        assert_eq!(
            follow_linked_folder(
                root.path(),
                "openspec",
                &DocumentAccessList::default(),
                never_asked
            ),
            Err(DocumentError::AccessDenied)
        );
        assert_eq!(
            follow_linked_folder(root.path(), "specs", &access, never_asked),
            Err(DocumentError::InvalidRequest)
        );
        for path in ["../openspec", "a//b", "C:/x", ""] {
            assert_eq!(
                follow_linked_folder(root.path(), path, &access, never_asked),
                Err(DocumentError::InvalidRequest),
                "{path}"
            );
        }
    }

    #[test]
    fn does_not_look_through_a_link_into_an_ungranted_folder() {
        let (root, outside) = project_with_link();
        let further = tempfile::tempdir().unwrap();
        link_folder(&outside.path().join("further"), further.path());
        let access = granted(root.path());
        let never_asked = |_: &DocumentLocation| -> bool { panic!("the user must not be asked") };

        assert_eq!(
            follow_linked_folder(root.path(), "openspec/further", &access, never_asked),
            Err(DocumentError::AccessDenied)
        );
        assert_eq!(
            follow_linked_folder(root.path(), "missing/further", &access, never_asked),
            Err(DocumentError::AccessDenied)
        );
    }

    #[test]
    fn refuses_a_link_to_a_drive_root_or_the_profile_folder() {
        let root = tempfile::tempdir().unwrap();
        let profile = dunce::canonicalize(
            std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap(),
        )
        .unwrap();
        link_folder(&root.path().join("home"), &profile);
        let access = granted(root.path());
        let never_asked = |_: &DocumentLocation| -> bool { panic!("the user must not be asked") };

        assert!(is_too_broad_to_grant(profile.ancestors().last().unwrap()));
        assert!(is_too_broad_to_grant(profile.parent().unwrap()));
        assert_eq!(
            follow_linked_folder(root.path(), "home", &access, never_asked),
            Err(DocumentError::InvalidRequest)
        );
    }
}
