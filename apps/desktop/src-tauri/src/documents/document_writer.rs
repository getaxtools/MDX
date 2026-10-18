use std::ffi::OsString;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use super::{DocumentError, is_markdown_path};

const PENDING_SUFFIX: &str = ".mdx-saving";
const MAX_FILE_NAME_CHARACTERS: usize = 255;
const DEFAULT_EXTENSION: &str = "md";

/// Keeps a chosen name that is not Markdown openable later, by adding `.md`.
pub fn with_markdown_extension(path: PathBuf) -> PathBuf {
    if is_markdown_path(&path) {
        return path;
    }
    let mut file_name = path.file_name().map(OsString::from).unwrap_or_default();
    file_name.push(format!(".{DEFAULT_EXTENSION}"));
    path.with_file_name(file_name)
}

/// A file name suggested by the frontend, accepted only if it cannot point anywhere else.
pub fn validated_file_name(file_name: &str) -> Result<&str, DocumentError> {
    let is_plain_name = !file_name.trim().is_empty()
        && file_name.chars().count() <= MAX_FILE_NAME_CHARACTERS
        && !file_name.contains(['/', '\\', ':', '\0'])
        && file_name != "."
        && file_name != "..";
    if is_plain_name {
        Ok(file_name)
    } else {
        Err(DocumentError::InvalidRequest)
    }
}

/// Writes the whole text or nothing: a failed save never leaves a half-written document.
pub fn write_document_text(destination: &Path, text: &str) -> Result<(), DocumentError> {
    let pending = pending_path_of(destination);
    let result = (|| {
        let mut file = File::create(&pending)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        fs::rename(&pending, destination)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&pending);
    }
    Ok(result?)
}

/// Saves a copy with exactly the original bytes, so encoding, BOM and line endings are kept.
pub fn copy_document(source: &Path, destination: &Path) -> Result<(), DocumentError> {
    if is_same_file(source, destination) {
        return Ok(());
    }
    let pending = pending_path_of(destination);
    let result = fs::copy(source, &pending).and_then(|_| fs::rename(&pending, destination));
    if result.is_err() {
        let _ = fs::remove_file(&pending);
    }
    Ok(result?)
}

fn is_same_file(first: &Path, second: &Path) -> bool {
    match (dunce::canonicalize(first), dunce::canonicalize(second)) {
        (Ok(first), Ok(second)) => first == second,
        _ => false,
    }
}

fn pending_path_of(destination: &Path) -> PathBuf {
    let mut file_name = destination
        .file_name()
        .map(OsString::from)
        .unwrap_or_default();
    file_name.push(PENDING_SUFFIX);
    destination.with_file_name(file_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_a_markdown_extension_and_adds_one_otherwise() {
        assert_eq!(
            with_markdown_extension(PathBuf::from("notes.markdown")),
            PathBuf::from("notes.markdown")
        );
        assert_eq!(
            with_markdown_extension(PathBuf::from("notes")),
            PathBuf::from("notes.md")
        );
        assert_eq!(
            with_markdown_extension(PathBuf::from("notes.txt")),
            PathBuf::from("notes.txt.md")
        );
    }

    #[test]
    fn accepts_only_plain_file_names() {
        assert_eq!(validated_file_name("Untitled-1.md"), Ok("Untitled-1.md"));
        for unsafe_name in ["", "  ", "..", r"..\x.md", "a/b.md", "C:x.md", "a\0.md"] {
            assert_eq!(
                validated_file_name(unsafe_name),
                Err(DocumentError::InvalidRequest),
                "{unsafe_name}"
            );
        }
    }

    #[test]
    fn writes_the_text_and_leaves_no_pending_file() {
        let folder = tempfile::tempdir().unwrap();
        let destination = folder.path().join("table.md");

        write_document_text(&destination, "| a |\n|---|\n").unwrap();

        assert_eq!(fs::read_to_string(&destination).unwrap(), "| a |\n|---|\n");
        assert_eq!(fs::read_dir(folder.path()).unwrap().count(), 1);
    }

    #[test]
    fn replaces_an_existing_file() {
        let folder = tempfile::tempdir().unwrap();
        let destination = folder.path().join("table.md");
        fs::write(&destination, "old").unwrap();

        write_document_text(&destination, "new").unwrap();

        assert_eq!(fs::read_to_string(&destination).unwrap(), "new");
    }

    #[test]
    fn fails_without_leaving_a_pending_file_when_the_folder_is_missing() {
        let folder = tempfile::tempdir().unwrap();
        let destination = folder.path().join("missing").join("table.md");

        assert_eq!(
            write_document_text(&destination, "text"),
            Err(DocumentError::NotFound)
        );
        assert_eq!(fs::read_dir(folder.path()).unwrap().count(), 0);
    }

    #[test]
    fn copies_the_original_bytes() {
        let folder = tempfile::tempdir().unwrap();
        let source = folder.path().join("source.md");
        let original = b"\xEF\xBB\xBF# Title\r\nText\r\n";
        fs::write(&source, original).unwrap();
        let destination = folder.path().join("copy.md");

        copy_document(&source, &destination).unwrap();

        assert_eq!(fs::read(&destination).unwrap(), original);
    }

    #[test]
    fn copying_a_document_onto_itself_changes_nothing() {
        let folder = tempfile::tempdir().unwrap();
        let source = folder.path().join("source.md");
        fs::write(&source, "# Title").unwrap();

        copy_document(&source, &source).unwrap();

        assert_eq!(fs::read_to_string(&source).unwrap(), "# Title");
    }
}
