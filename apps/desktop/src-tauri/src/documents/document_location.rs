use std::path::{Path, PathBuf};

use serde::Serialize;

use super::DocumentError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentLocation {
    pub canonical_key: String,
    pub display_path: String,
    pub file_name: String,
}

impl DocumentLocation {
    pub fn path(&self) -> PathBuf {
        PathBuf::from(&self.display_path)
    }
}

pub fn locate_document(path: &Path) -> Result<DocumentLocation, DocumentError> {
    let resolved_path = dunce::canonicalize(path)?;
    Ok(location_of_resolved_path(&resolved_path))
}

pub fn canonical_key_of(display_path: &str) -> String {
    if cfg!(windows) {
        display_path.to_lowercase()
    } else {
        display_path.to_owned()
    }
}

fn location_of_resolved_path(resolved_path: &Path) -> DocumentLocation {
    let display_path = resolved_path.to_string_lossy().into_owned();
    let file_name = resolved_path.file_name().map_or_else(
        || display_path.clone(),
        |name| name.to_string_lossy().into_owned(),
    );
    DocumentLocation {
        canonical_key: canonical_key_of(&display_path),
        display_path,
        file_name,
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    #[test]
    fn resolves_relative_segments_to_one_location() {
        let folder = tempfile::tempdir().unwrap();
        fs::create_dir(folder.path().join("guides")).unwrap();
        fs::write(folder.path().join("Guide.md"), "# Guide").unwrap();

        let direct = locate_document(&folder.path().join("Guide.md")).unwrap();
        let indirect =
            locate_document(&folder.path().join("guides").join("..").join("Guide.md")).unwrap();

        assert_eq!(direct, indirect);
        assert_eq!(direct.file_name, "Guide.md");
    }

    #[cfg(windows)]
    #[test]
    fn treats_windows_paths_that_differ_only_by_case_as_one_document() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("Guide.md"), "# Guide").unwrap();

        let location = locate_document(&folder.path().join("GUIDE.MD")).unwrap();

        assert_eq!(location.file_name, "Guide.md");
        assert_eq!(location.canonical_key, location.display_path.to_lowercase());
        assert!(!location.display_path.starts_with(r"\\?\"));
    }

    #[test]
    fn keeps_unicode_file_names() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("నమస్తే-こんにちは.md"), "# Hello").unwrap();

        let location = locate_document(&folder.path().join("నమస్తే-こんにちは.md")).unwrap();

        assert_eq!(location.file_name, "నమస్తే-こんにちは.md");
    }

    #[test]
    fn reports_a_missing_document_as_not_found() {
        let folder = tempfile::tempdir().unwrap();

        let result = locate_document(&folder.path().join("missing.md"));

        assert_eq!(result, Err(DocumentError::NotFound));
    }
}
