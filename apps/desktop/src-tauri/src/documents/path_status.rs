use std::fs;
use std::path::Path;

use serde::Serialize;

use super::DocumentError;
use crate::platform;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PathStatus {
    Available,
    Missing,
    Unreachable,
    CloudOnly,
}

pub fn status_of_path(path: &Path) -> PathStatus {
    match fs::metadata(path) {
        Ok(metadata) if platform::is_cloud_only(&metadata) => PathStatus::CloudOnly,
        Ok(_) => PathStatus::Available,
        Err(error) => match DocumentError::from(error) {
            DocumentError::NotFound => PathStatus::Missing,
            _ => PathStatus::Unreachable,
        },
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    #[test]
    fn reports_existing_files_and_folders_as_available() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("a.md"), "#").unwrap();

        assert_eq!(
            status_of_path(&folder.path().join("a.md")),
            PathStatus::Available
        );
        assert_eq!(status_of_path(folder.path()), PathStatus::Available);
    }

    #[test]
    fn reports_missing_paths() {
        let folder = tempfile::tempdir().unwrap();

        assert_eq!(
            status_of_path(&folder.path().join("gone.md")),
            PathStatus::Missing
        );
    }
}
