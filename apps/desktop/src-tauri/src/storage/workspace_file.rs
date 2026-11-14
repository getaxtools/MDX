use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use serde::Serialize;

use crate::documents::DocumentError;

/// A definition is small, so anything larger is not one.
pub const MAX_WORKSPACE_FILE_BYTES: u64 = 1024 * 1024;
pub const WORKSPACE_FILE_EXTENSION: &str = "mdxworkspace";

/// A workspace file as the webview reads it: the core resolves relative paths against `folder`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileContents {
    pub path: String,
    pub folder: String,
    pub text: String,
}

/// The place the user chose in the save dialog, kept until the export is written there.
#[derive(Debug, Default)]
pub struct PendingWorkspaceExport(Mutex<Option<PathBuf>>);

impl PendingWorkspaceExport {
    pub fn remember(&self, path: PathBuf) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = Some(path);
    }

    /// The chosen place, once: a second write needs a new choice.
    pub fn take(&self) -> Option<PathBuf> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner).take()
    }
}

pub fn is_workspace_file_path(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case(WORKSPACE_FILE_EXTENSION))
}

/// Reads a workspace file, refusing anything too large or not text; nothing is granted by reading it.
pub fn read_workspace_file(path: &Path) -> Result<WorkspaceFileContents, DocumentError> {
    if fs::metadata(path)?.len() > MAX_WORKSPACE_FILE_BYTES {
        return Err(DocumentError::TooLarge);
    }
    let text = String::from_utf8(fs::read(path)?).map_err(|_| DocumentError::Unreadable)?;
    let folder = path
        .parent()
        .map(|folder| folder.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(WorkspaceFileContents {
        path: path.to_string_lossy().into_owned(),
        folder,
        text,
    })
}

/// Checks the webview sent a JSON document small enough to be a workspace file.
pub fn validated_workspace_json(contents: &str) -> Result<&str, DocumentError> {
    let is_small =
        u64::try_from(contents.len()).is_ok_and(|length| length <= MAX_WORKSPACE_FILE_BYTES);
    if is_small && serde_json::from_str::<serde_json::Value>(contents).is_ok() {
        Ok(contents)
    } else {
        Err(DocumentError::InvalidRequest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_workspace_file_with_its_folder() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("handbook.mdxworkspace");
        fs::write(&path, r#"{"format":"mdx-workspace"}"#).unwrap();

        let contents = read_workspace_file(&path).unwrap();

        assert_eq!(contents.text, r#"{"format":"mdx-workspace"}"#);
        assert_eq!(PathBuf::from(&contents.folder), folder.path());
    }

    #[test]
    fn refuses_a_file_larger_than_1_mb_or_not_text() {
        let folder = tempfile::tempdir().unwrap();
        let large = folder.path().join("large.mdxworkspace");
        let size = usize::try_from(MAX_WORKSPACE_FILE_BYTES).unwrap() + 1;
        fs::write(&large, vec![b' '; size]).unwrap();
        let binary = folder.path().join("binary.mdxworkspace");
        fs::write(&binary, [0xFF, 0xFE, 0x00]).unwrap();

        assert_eq!(read_workspace_file(&large), Err(DocumentError::TooLarge));
        assert_eq!(read_workspace_file(&binary), Err(DocumentError::Unreadable));
    }

    #[test]
    fn accepts_only_small_json_from_the_webview() {
        let oversized = format!(
            "\"{}\"",
            "a".repeat(usize::try_from(MAX_WORKSPACE_FILE_BYTES).unwrap())
        );

        assert!(validated_workspace_json("{}").is_ok());
        assert_eq!(
            validated_workspace_json("not json"),
            Err(DocumentError::InvalidRequest)
        );
        assert_eq!(
            validated_workspace_json(&oversized),
            Err(DocumentError::InvalidRequest)
        );
    }

    #[test]
    fn a_chosen_place_is_used_once() {
        let pending = PendingWorkspaceExport::default();
        pending.remember(PathBuf::from(r"D:\team\handbook.mdxworkspace"));

        assert!(pending.take().is_some());
        assert_eq!(pending.take(), None);
    }

    #[test]
    fn recognizes_workspace_files_by_extension() {
        assert!(is_workspace_file_path(Path::new(
            r"D:\team\Handbook.MDXWORKSPACE"
        )));
        assert!(!is_workspace_file_path(Path::new(r"D:\team\guide.md")));
    }
}
