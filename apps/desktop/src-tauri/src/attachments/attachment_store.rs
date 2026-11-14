use std::fs::{self, OpenOptions};
use std::io;
use std::path::{Component, Path, PathBuf};

use super::ImageKind;
use crate::documents::{DocumentError, validated_file_name, write_bytes_atomically};

pub const MAX_ATTACHMENT_BYTES: usize = 25 * 1024 * 1024;
/// Gives up rather than trying names forever in a folder full of same-named pictures.
const MAX_NAME_SUFFIX: u32 = 10_000;
const DEFAULT_STEM: &str = "image";

/// Where an attachment was saved, relative to the document's folder with forward slashes.
#[derive(Debug, PartialEq, Eq)]
pub struct SavedAttachment {
    pub relative_path: String,
}

/// Copies picture bytes into a folder next to a document: never outside it, never over another
/// file, and reusing a file that already holds exactly these bytes.
pub fn save_attachment_bytes(
    document_folder: &Path,
    attachment_folder: &str,
    suggested_name: &str,
    bytes: &[u8],
) -> Result<SavedAttachment, DocumentError> {
    if bytes.len() > MAX_ATTACHMENT_BYTES {
        return Err(DocumentError::TooLarge);
    }
    let kind = ImageKind::of(bytes).ok_or(DocumentError::NotAnImage)?;
    let relative_folder = validated_relative_folder(attachment_folder)?;
    let folder = contained_folder(document_folder, &relative_folder)?;
    let stem = stem_of(suggested_name)?;
    let file_name = place_bytes(&folder, &stem, kind.extension(), bytes)?;
    Ok(SavedAttachment {
        relative_path: relative_link_path(&relative_folder, &file_name),
    })
}

/// Only plain folder names below the document; `..`, roots and drive letters are refused.
fn validated_relative_folder(attachment_folder: &str) -> Result<PathBuf, DocumentError> {
    let folder = Path::new(attachment_folder);
    let is_plain = !attachment_folder.trim().is_empty()
        && folder
            .components()
            .all(|component| matches!(component, Component::Normal(_)));
    if is_plain {
        Ok(folder.to_path_buf())
    } else {
        Err(DocumentError::InvalidRequest)
    }
}

/// Creates the folder, then checks that it still lies inside the document's folder once links are
/// followed, so a symbolic link cannot send the copy elsewhere.
fn contained_folder(
    document_folder: &Path,
    relative_folder: &Path,
) -> Result<PathBuf, DocumentError> {
    let base = dunce::canonicalize(document_folder)?;
    let folder = base.join(relative_folder);
    fs::create_dir_all(&folder)?;
    let resolved = dunce::canonicalize(&folder)?;
    if resolved.starts_with(&base) {
        Ok(resolved)
    } else {
        Err(DocumentError::AccessDenied)
    }
}

fn stem_of(suggested_name: &str) -> Result<String, DocumentError> {
    let name = validated_file_name(suggested_name.trim())?;
    let stem = Path::new(name)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or_default()
        .trim();
    Ok(if stem.is_empty() {
        DEFAULT_STEM.to_owned()
    } else {
        stem.to_owned()
    })
}

/// Tries `name.png`, `name-2.png`, `name-3.png` ...; an existing file with the same bytes is reused.
fn place_bytes(
    folder: &Path,
    stem: &str,
    extension: &str,
    bytes: &[u8],
) -> Result<String, DocumentError> {
    for number in 1..=MAX_NAME_SUFFIX {
        let file_name = if number == 1 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem}-{number}.{extension}")
        };
        let path = folder.join(&file_name);
        if path.exists() {
            if fs::read(&path).is_ok_and(|existing| existing == bytes) {
                return Ok(file_name);
            }
            continue;
        }
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(_) => {
                write_bytes_atomically(&path, bytes)?;
                return Ok(file_name);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.into()),
        }
    }
    Err(DocumentError::InvalidRequest)
}

fn relative_link_path(relative_folder: &Path, file_name: &str) -> String {
    let folder_parts: Vec<String> = relative_folder
        .components()
        .map(|component| component.as_os_str().to_string_lossy().into_owned())
        .collect();
    [folder_parts, vec![file_name.to_owned()]]
        .concat()
        .join("/")
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nfirst picture";
    const OTHER_PNG: &[u8] = b"\x89PNG\r\n\x1a\nsecond picture";

    #[test]
    fn copies_a_picture_into_the_folder_next_to_the_document() {
        let folder = tempfile::tempdir().unwrap();

        let saved = save_attachment_bytes(folder.path(), "assets", "Chart 1.png", PNG).unwrap();

        assert_eq!(saved.relative_path, "assets/Chart 1.png");
        assert_eq!(
            fs::read(folder.path().join("assets").join("Chart 1.png")).unwrap(),
            PNG
        );
    }

    #[test]
    fn an_existing_file_is_never_overwritten() {
        let folder = tempfile::tempdir().unwrap();
        save_attachment_bytes(folder.path(), "assets", "chart.png", PNG).unwrap();

        let second =
            save_attachment_bytes(folder.path(), "assets", "chart.png", OTHER_PNG).unwrap();

        assert_eq!(second.relative_path, "assets/chart-2.png");
        assert_eq!(
            fs::read(folder.path().join("assets").join("chart.png")).unwrap(),
            PNG
        );
    }

    #[test]
    fn identical_content_is_reused() {
        let folder = tempfile::tempdir().unwrap();
        save_attachment_bytes(folder.path(), "assets", "chart.png", PNG).unwrap();

        let again = save_attachment_bytes(folder.path(), "assets", "chart.png", PNG).unwrap();

        assert_eq!(again.relative_path, "assets/chart.png");
        assert!(!folder.path().join("assets").join("chart-2.png").exists());
    }

    #[test]
    fn the_extension_follows_the_content() {
        let folder = tempfile::tempdir().unwrap();

        let saved = save_attachment_bytes(folder.path(), "assets", "photo.gif", PNG).unwrap();

        assert_eq!(saved.relative_path, "assets/photo.png");
    }

    #[test]
    fn path_outside_the_attachment_folder_is_refused() {
        let folder = tempfile::tempdir().unwrap();

        for attachment_folder in ["..", "../elsewhere", "/root", "C:\\Windows"] {
            assert_eq!(
                save_attachment_bytes(folder.path(), attachment_folder, "a.png", PNG),
                Err(DocumentError::InvalidRequest),
                "{attachment_folder}"
            );
        }
        assert_eq!(
            save_attachment_bytes(folder.path(), "assets", "../a.png", PNG),
            Err(DocumentError::InvalidRequest)
        );
    }

    #[cfg(unix)]
    #[test]
    fn symlink_escape_is_refused() {
        let folder = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), folder.path().join("assets")).unwrap();

        assert_eq!(
            save_attachment_bytes(folder.path(), "assets", "a.png", PNG),
            Err(DocumentError::AccessDenied)
        );
    }

    #[cfg(windows)]
    #[test]
    fn symlink_escape_is_refused() {
        let folder = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        // Junctions need no administrator rights, unlike symbolic links.
        let created = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(folder.path().join("assets"))
            .arg(outside.path())
            .output()
            .unwrap();
        assert!(created.status.success());

        assert_eq!(
            save_attachment_bytes(folder.path(), "assets", "a.png", PNG),
            Err(DocumentError::AccessDenied)
        );
    }

    #[test]
    fn renamed_executable_is_refused() {
        let folder = tempfile::tempdir().unwrap();

        assert_eq!(
            save_attachment_bytes(
                folder.path(),
                "assets",
                "picture.png",
                b"MZ\x90\0\x03\0\0\0"
            ),
            Err(DocumentError::NotAnImage)
        );
    }

    #[test]
    fn more_than_25_mb_is_refused() {
        let folder = tempfile::tempdir().unwrap();
        let mut bytes = PNG.to_vec();
        bytes.resize(MAX_ATTACHMENT_BYTES + 1, 0);

        assert_eq!(
            save_attachment_bytes(folder.path(), "assets", "big.png", &bytes),
            Err(DocumentError::TooLarge)
        );
    }

    #[test]
    fn non_ascii_names_and_nested_folders_are_kept() {
        let folder = tempfile::tempdir().unwrap();

        let saved = save_attachment_bytes(folder.path(), "media/2026", "Größe.png", PNG).unwrap();

        assert_eq!(saved.relative_path, "media/2026/Größe.png");
    }
}
