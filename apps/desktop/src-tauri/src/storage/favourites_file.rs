use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

use crate::documents::DocumentError;

pub const MAX_FAVOURITES_FILE_BYTES: u64 = 5 * 1024 * 1024;
pub const FAVOURITES_FILE_EXTENSION: &str = "json";

/// Reads an exported favourites file, refusing anything too large to be one.
pub fn read_favourites_file(path: &Path) -> Result<String, DocumentError> {
    if fs::metadata(path)?.len() > MAX_FAVOURITES_FILE_BYTES {
        return Err(DocumentError::TooLarge);
    }
    String::from_utf8(fs::read(path)?).map_err(|_| DocumentError::Unreadable)
}

/// Checks the frontend sent a JSON document small enough to be a favourites file.
pub fn validated_favourites_json(contents: &str) -> Result<&str, DocumentError> {
    let is_small =
        u64::try_from(contents.len()).is_ok_and(|length| length <= MAX_FAVOURITES_FILE_BYTES);
    if is_small && serde_json::from_str::<serde_json::Value>(contents).is_ok() {
        Ok(contents)
    } else {
        Err(DocumentError::InvalidRequest)
    }
}

pub fn with_json_extension(path: PathBuf) -> PathBuf {
    let has_extension = path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case(FAVOURITES_FILE_EXTENSION));
    if has_extension {
        return path;
    }
    let mut file_name = path.file_name().map(OsString::from).unwrap_or_default();
    file_name.push(format!(".{FAVOURITES_FILE_EXTENSION}"));
    path.with_file_name(file_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_favourites_file() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("favourites.json");
        fs::write(&path, r#"{"format":"mdx-favourites"}"#).unwrap();

        assert_eq!(
            read_favourites_file(&path),
            Ok(r#"{"format":"mdx-favourites"}"#.to_owned())
        );
    }

    #[test]
    fn refuses_files_that_are_too_large_or_not_text() {
        let folder = tempfile::tempdir().unwrap();
        let large = folder.path().join("large.json");
        let size = usize::try_from(MAX_FAVOURITES_FILE_BYTES).unwrap() + 1;
        fs::write(&large, vec![b' '; size]).unwrap();
        let binary = folder.path().join("binary.json");
        fs::write(&binary, [0xFF, 0xFE, 0x00]).unwrap();

        assert_eq!(read_favourites_file(&large), Err(DocumentError::TooLarge));
        assert_eq!(
            read_favourites_file(&binary),
            Err(DocumentError::Unreadable)
        );
    }

    #[test]
    fn accepts_only_json_from_the_frontend() {
        assert_eq!(validated_favourites_json("{}"), Ok("{}"));
        assert_eq!(
            validated_favourites_json("not json"),
            Err(DocumentError::InvalidRequest)
        );
    }

    #[test]
    fn adds_a_json_extension_when_missing() {
        assert_eq!(
            with_json_extension(PathBuf::from("favourites")),
            PathBuf::from("favourites.json")
        );
        assert_eq!(
            with_json_extension(PathBuf::from("favourites.JSON")),
            PathBuf::from("favourites.JSON")
        );
    }
}
