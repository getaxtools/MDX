use std::path::{Path, PathBuf};

use crate::documents::{
    DocumentAccessList, DocumentError, DocumentLocation, OpenedDocument, locate_document,
    read_located_text_file,
};
use crate::spec_projects::project_scan::MAX_SCANNED_FILES;

pub const MAX_SPEC_FILE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_RELATIVE_PATH_CHARACTERS: usize = 1_024;
const MARKDOWN_EXTENSIONS: [&str; 3] = ["md", "markdown", "mdc"];
const READABLE_EXTENSIONS: [&str; 6] = ["md", "markdown", "mdc", "yaml", "yml", "json"];
/// Instruction files that some coding assistants read although their names have no extension.
const READABLE_FILE_NAMES: [&str; 2] = [".cursorrules", ".windsurfrules"];

/// Reads a Markdown, YAML, JSON or instruction file of a granted project root by its path relative to the root.
pub fn read_granted_project_file(
    root: &Path,
    relative_path: &str,
    access: &DocumentAccessList,
) -> Result<OpenedDocument, DocumentError> {
    let relative = validated_relative_path(relative_path)?;
    let root_location = locate_document(root)?;
    if !access.is_folder_allowed(&root_location) {
        return Err(DocumentError::AccessDenied);
    }
    let location = locate_document(&root_location.path().join(relative))?;
    // The resolved path decides, so a link inside the project cannot reach an ungranted file.
    if !access.is_allowed(&location) {
        return Err(DocumentError::AccessDenied);
    }
    if !is_readable_file(&location.path()) {
        return Err(DocumentError::InvalidRequest);
    }
    read_located_text_file(location, MAX_SPEC_FILE_BYTES)
}

/// The Markdown documents of a granted project root to search, by their paths relative to the root.
/// A document gone since the scan, or one a link leads out of the granted folders, is left out.
pub fn granted_project_documents(
    root: &Path,
    relative_paths: &[String],
    access: &DocumentAccessList,
) -> Result<Vec<DocumentLocation>, DocumentError> {
    if relative_paths.len() > MAX_SCANNED_FILES {
        return Err(DocumentError::InvalidRequest);
    }
    let relatives = relative_paths
        .iter()
        .map(|path| validated_relative_path(path))
        .collect::<Result<Vec<_>, _>>()?;
    let root_location = locate_document(root)?;
    if !access.is_folder_allowed(&root_location) {
        return Err(DocumentError::AccessDenied);
    }
    let mut seen_keys = std::collections::HashSet::new();
    Ok(relatives
        .into_iter()
        .filter(|relative| has_extension_in(relative, &MARKDOWN_EXTENSIONS))
        .filter_map(|relative| locate_document(&root_location.path().join(relative)).ok())
        .filter(|location| access.is_allowed(location))
        .filter(|location| seen_keys.insert(location.canonical_key.clone()))
        .collect())
}

fn validated_relative_path(relative_path: &str) -> Result<PathBuf, DocumentError> {
    if relative_path.chars().count() > MAX_RELATIVE_PATH_CHARACTERS {
        return Err(DocumentError::InvalidRequest);
    }
    let mut relative = PathBuf::new();
    for part in relative_path.split(['/', '\\']) {
        let is_unsafe =
            part.is_empty() || part == "." || part == ".." || part.contains([':', '\0']);
        if is_unsafe {
            return Err(DocumentError::InvalidRequest);
        }
        relative.push(part);
    }
    if !is_readable_file(&relative) {
        return Err(DocumentError::InvalidRequest);
    }
    Ok(relative)
}

fn has_extension_in(path: &Path, extensions: &[&str]) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extensions.contains(&extension.to_lowercase().as_str()))
}

fn is_readable_file(path: &Path) -> bool {
    let has_readable_extension = has_extension_in(path, &READABLE_EXTENSIONS);
    let has_readable_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| READABLE_FILE_NAMES.contains(&name.to_lowercase().as_str()));
    has_readable_extension || has_readable_name
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::spec_projects::test_support::{granted, link_folder, write_files};

    #[test]
    fn reads_a_markdown_file_and_keeps_its_byte_order_mark() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("openspec").join("specs").join("tabs");
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("spec.md"), "\u{feff}# Tabs\r\n").unwrap();

        let file = read_granted_project_file(
            root.path(),
            "openspec/specs/tabs/spec.md",
            &granted(root.path()),
        )
        .unwrap();

        assert_eq!(file.text, "# Tabs\r\n");
        assert!(file.has_byte_order_mark);
        assert_eq!(file.location.file_name, "spec.md");
    }

    #[test]
    fn finds_text_in_documents_of_hidden_spec_folders() {
        let root = tempfile::tempdir().unwrap();
        let paths = [
            ".specify/memory/constitution.md",
            ".kiro/specs/albums/requirements.md",
            "openspec/specs/tabs/spec.md",
        ];
        write_files(root.path(), &paths);
        let access = granted(root.path());
        let relative_paths = paths.map(str::to_owned);

        let documents = granted_project_documents(root.path(), &relative_paths, &access).unwrap();
        let results = crate::commands::folder_text_search::search_documents(
            documents,
            "Text",
            crate::commands::folder_text_search::TextSearchOptions::default(),
        );

        let found: Vec<String> = results
            .documents
            .iter()
            .map(|document| document.location.file_name.clone())
            .collect();
        assert_eq!(found, ["constitution.md", "requirements.md", "spec.md"]);
    }

    #[test]
    fn searches_only_markdown_inside_the_granted_root() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        write_files(
            root.path(),
            &["openspec/config.yaml", "openspec/specs/a/spec.md"],
        );
        write_files(outside.path(), &["b/spec.md"]);
        link_folder(&root.path().join("linked"), outside.path());
        let access = granted(root.path());
        let paths = [
            "openspec/config.yaml",
            "openspec/specs/a/spec.md",
            "linked/b/spec.md",
            "gone.md",
        ]
        .map(str::to_owned);

        let documents = granted_project_documents(root.path(), &paths, &access).unwrap();

        let names: Vec<&str> = documents
            .iter()
            .map(|document| document.file_name.as_str())
            .collect();
        assert_eq!(names, ["spec.md"]);
        assert_eq!(
            granted_project_documents(root.path(), &["../x.md".to_owned()], &access),
            Err(DocumentError::InvalidRequest)
        );
        assert_eq!(
            granted_project_documents(root.path(), &[], &DocumentAccessList::default()),
            Err(DocumentError::AccessDenied)
        );
    }

    #[test]
    fn searches_a_document_named_twice_once_and_refuses_more_than_the_scan_lists() {
        let root = tempfile::tempdir().unwrap();
        write_files(root.path(), &["specs/a/spec.md"]);
        let access = granted(root.path());
        let twice = ["specs/a/spec.md", "specs\\a\\spec.md", "SPECS/a/spec.md"].map(str::to_owned);

        let documents = granted_project_documents(root.path(), &twice, &access).unwrap();

        assert_eq!(documents.len(), 1);
        let too_many = vec!["specs/a/spec.md".to_owned(); MAX_SCANNED_FILES + 1];
        assert_eq!(
            granted_project_documents(root.path(), &too_many, &access),
            Err(DocumentError::InvalidRequest)
        );
    }

    #[test]
    fn reads_yaml_json_and_rule_files() {
        let root = tempfile::tempdir().unwrap();
        write_files(
            root.path(),
            &[
                "openspec/config.yaml",
                ".specify/feature.json",
                ".cursor/rules/a.mdc",
            ],
        );
        let access = granted(root.path());

        for path in [
            "openspec/config.yaml",
            ".specify/feature.json",
            r".cursor\rules\a.mdc",
        ] {
            assert!(
                read_granted_project_file(root.path(), path, &access).is_ok(),
                "{path}"
            );
        }
    }

    #[test]
    fn refuses_paths_that_climb_out_or_name_a_drive() {
        let root = tempfile::tempdir().unwrap();
        let project = root.path().join("project");
        write_files(root.path(), &["secret.md", "project/specs/a.md"]);
        let access = granted(&project);

        for path in [
            "../secret.md",
            "specs/../../secret.md",
            "./specs/a.md",
            "/specs/a.md",
            "C:/secret.md",
            "specs//a.md",
            "specs/a.md:stream",
        ] {
            assert_eq!(
                read_granted_project_file(&project, path, &access).unwrap_err(),
                DocumentError::InvalidRequest,
                "{path}"
            );
        }
    }

    #[test]
    fn reads_instruction_files_named_without_an_extension() {
        let root = tempfile::tempdir().unwrap();
        write_files(root.path(), &[".cursorrules", "app/.windsurfrules"]);
        let access = granted(root.path());

        for path in [".cursorrules", "app/.windsurfrules"] {
            let file = read_granted_project_file(root.path(), path, &access).unwrap();
            assert_eq!(file.text, "# Text", "{path}");
        }
    }

    #[test]
    fn refuses_other_files_without_an_extension_and_large_instruction_files() {
        let root = tempfile::tempdir().unwrap();
        write_files(root.path(), &[".env", "LICENSE"]);
        let oversized = vec![b'x'; usize::try_from(MAX_SPEC_FILE_BYTES).unwrap() + 1];
        fs::write(root.path().join(".cursorrules"), oversized).unwrap();
        let access = granted(root.path());

        for path in [".env", "LICENSE"] {
            assert_eq!(
                read_granted_project_file(root.path(), path, &access).unwrap_err(),
                DocumentError::InvalidRequest,
                "{path}"
            );
        }
        assert_eq!(
            read_granted_project_file(root.path(), ".cursorrules", &access).unwrap_err(),
            DocumentError::TooLarge
        );
    }

    #[test]
    fn refuses_other_file_types() {
        let root = tempfile::tempdir().unwrap();
        write_files(root.path(), &["specs/run.ps1", "specs/notes.txt"]);
        let access = granted(root.path());

        for path in ["specs/run.ps1", "specs/notes.txt", "specs"] {
            assert_eq!(
                read_granted_project_file(root.path(), path, &access).unwrap_err(),
                DocumentError::InvalidRequest,
                "{path}"
            );
        }
    }

    #[test]
    fn refuses_files_over_five_megabytes() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("specs");
        fs::create_dir(&folder).unwrap();
        let oversized = vec![b'x'; usize::try_from(MAX_SPEC_FILE_BYTES).unwrap() + 1];
        fs::write(folder.join("huge.md"), oversized).unwrap();

        let result = read_granted_project_file(root.path(), "specs/huge.md", &granted(root.path()));

        assert_eq!(result.unwrap_err(), DocumentError::TooLarge);
    }

    #[test]
    fn refuses_a_root_the_user_has_not_chosen() {
        let root = tempfile::tempdir().unwrap();
        write_files(root.path(), &["specs/a.md"]);

        let result =
            read_granted_project_file(root.path(), "specs/a.md", &DocumentAccessList::default());

        assert_eq!(result.unwrap_err(), DocumentError::AccessDenied);
    }

    #[test]
    fn reads_nothing_through_a_link_to_an_ungranted_folder() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        write_files(outside.path(), &["specs/secret/spec.md"]);
        link_folder(&root.path().join("openspec"), outside.path());

        let result = read_granted_project_file(
            root.path(),
            "openspec/specs/secret/spec.md",
            &granted(root.path()),
        );

        assert_eq!(result.unwrap_err(), DocumentError::AccessDenied);
    }
}
