use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::{MAX_ATTACHMENT_BYTES, save_attachment_bytes};
use crate::documents::DocumentError;

/// What became of one picture the user chose in the picture dialog.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ChosenPictureOutcome {
    Saved {
        relative_path: String,
    },
    Failed {
        file_name: String,
        reason: DocumentError,
    },
}

/// Reads a picture file no larger than the attachment limit, refused before reading when it is
/// larger, or a folder.
pub fn read_picture_file(path: &Path) -> Result<Vec<u8>, DocumentError> {
    let file = File::open(path)?;
    check_picture_file(&file, MAX_ATTACHMENT_BYTES)?;
    read_at_most(file, MAX_ATTACHMENT_BYTES)
}

fn check_picture_file(file: &File, max_bytes: usize) -> Result<(), DocumentError> {
    let metadata = file.metadata()?;
    if !metadata.is_file() {
        return Err(DocumentError::NotAnImage);
    }
    if metadata.len() > u64::try_from(max_bytes).unwrap_or(u64::MAX) {
        return Err(DocumentError::TooLarge);
    }
    Ok(())
}

/// Reads one byte past the limit, so a file that grew after it was checked is refused, not cut.
fn read_at_most(file: File, max_bytes: usize) -> Result<Vec<u8>, DocumentError> {
    let mut bytes = Vec::new();
    file.take(
        u64::try_from(max_bytes)
            .unwrap_or(u64::MAX)
            .saturating_add(1),
    )
    .read_to_end(&mut bytes)?;
    if bytes.len() > max_bytes {
        return Err(DocumentError::TooLarge);
    }
    Ok(bytes)
}

/// Copies each picture the user chose into the attachment folder next to a document, in order.
pub fn copy_chosen_pictures(
    document_folder: &Path,
    attachment_folder: &str,
    chosen: &[PathBuf],
) -> Vec<ChosenPictureOutcome> {
    chosen
        .iter()
        .map(|path| {
            let file_name = path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default();
            let saved = read_picture_file(path).and_then(|bytes| {
                save_attachment_bytes(document_folder, attachment_folder, &file_name, &bytes)
            });
            match saved {
                Ok(saved) => ChosenPictureOutcome::Saved {
                    relative_path: saved.relative_path,
                },
                Err(reason) => ChosenPictureOutcome::Failed { file_name, reason },
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::fs::{self, OpenOptions};
    use std::io::Write;

    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\npicture";
    const SVG: &[u8] = b"<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"/>";

    #[test]
    fn copies_each_chosen_picture_and_says_why_the_others_failed() {
        let pictures = tempfile::tempdir().unwrap();
        let document_folder = tempfile::tempdir().unwrap();
        let chart = pictures.path().join("chart.png");
        let notes = pictures.path().join("notes.txt");
        fs::write(&chart, PNG).unwrap();
        fs::write(&notes, "not a picture").unwrap();

        let outcomes = copy_chosen_pictures(document_folder.path(), "assets", &[chart, notes]);

        assert_eq!(
            outcomes,
            vec![
                ChosenPictureOutcome::Saved {
                    relative_path: "assets/chart.png".to_owned()
                },
                ChosenPictureOutcome::Failed {
                    file_name: "notes.txt".to_owned(),
                    reason: DocumentError::NotAnImage,
                },
            ]
        );
    }

    #[test]
    fn a_chosen_svg_is_saved_as_svg() {
        let pictures = tempfile::tempdir().unwrap();
        let document_folder = tempfile::tempdir().unwrap();
        let diagram = pictures.path().join("diagram.svg");
        fs::write(&diagram, SVG).unwrap();

        let outcomes = copy_chosen_pictures(document_folder.path(), "assets", &[diagram]);

        assert_eq!(
            outcomes,
            vec![ChosenPictureOutcome::Saved {
                relative_path: "assets/diagram.svg".to_owned()
            }]
        );
    }

    #[test]
    fn refuses_a_picture_over_the_size_limit_without_reading_it() {
        let pictures = tempfile::tempdir().unwrap();
        let large = pictures.path().join("large.png");
        let file = File::create(&large).unwrap();
        file.set_len(u64::try_from(MAX_ATTACHMENT_BYTES).unwrap() + 1)
            .unwrap();

        assert_eq!(read_picture_file(&large), Err(DocumentError::TooLarge));
    }

    #[test]
    fn refuses_a_file_that_grows_past_the_limit_after_it_was_checked() {
        let pictures = tempfile::tempdir().unwrap();
        let growing = pictures.path().join("growing.png");
        fs::write(&growing, PNG).unwrap();
        let max_bytes = PNG.len() + 4;
        let file = File::open(&growing).unwrap();
        let is_small_enough_when_checked = check_picture_file(&file, max_bytes).is_ok();

        OpenOptions::new()
            .append(true)
            .open(&growing)
            .unwrap()
            .write_all(b"more bytes")
            .unwrap();

        assert!(is_small_enough_when_checked);
        assert_eq!(read_at_most(file, max_bytes), Err(DocumentError::TooLarge));
    }

    #[test]
    fn a_folder_is_not_a_picture() {
        let pictures = tempfile::tempdir().unwrap();

        let refusal = read_picture_file(pictures.path());

        assert!(refusal.is_err());
    }
}
