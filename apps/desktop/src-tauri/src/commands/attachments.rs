use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::attachments::{
    ChosenPictureOutcome, DroppedImages, IMAGE_EXTENSIONS, copy_chosen_pictures, read_picture_file,
    save_attachment_bytes,
};
use crate::commands::documents::{run_blocking, validated_path};
use crate::documents::{DocumentAccessList, DocumentError, DocumentLocation, locate_document};

const MAX_FILTER_NAME_CHARACTERS: usize = 200;

/// Where the picture comes from: a file the user dropped on the window, or pasted bytes.
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AttachmentSource {
    DroppedFile { path: String },
    PastedBytes { bytes: Vec<u8> },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentRequest {
    document_path: String,
    /// A folder below the document's folder, such as `assets`, or below the notes folder.
    attachment_folder: String,
    suggested_name: String,
    source: AttachmentSource,
    /// A Notes workspace's folder: the attachment folder lies in it, and the link is relative to the note.
    #[serde(default)]
    notes_folder: Option<String>,
}

/// Which document the pictures chosen in the picture dialog are added to.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PictureFilesRequest {
    document_path: String,
    /// A folder below the document's folder, such as `assets`.
    attachment_folder: String,
    /// The translated name of the dialog's picture filter, such as "Pictures".
    filter_name: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedAttachmentReply {
    relative_path: String,
}

/// Copies a dropped or pasted picture next to an open document and returns its relative path.
#[tauri::command]
pub async fn save_attachment(
    request: AttachmentRequest,
    access: State<'_, Arc<DocumentAccessList>>,
    dropped: State<'_, Arc<DroppedImages>>,
) -> Result<SavedAttachmentReply, DocumentError> {
    let access = Arc::clone(&access);
    let dropped = Arc::clone(&dropped);
    tauri::async_runtime::spawn_blocking(move || {
        save_requested_attachment(request, &access, &dropped)
    })
    .await
    .map_err(|_| DocumentError::Unreadable)?
}

/// Shows the picture dialog and copies each picture chosen there next to an open document; the page
/// never names a file to copy.
#[tauri::command]
pub async fn add_picture_files(
    request: PictureFilesRequest,
    app: AppHandle,
    window: WebviewWindow,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<Vec<ChosenPictureOutcome>, DocumentError> {
    let access = Arc::clone(&access);
    run_blocking(move || {
        add_chosen_pictures(&request, &access, |filter_name| {
            // Owned by the window, so the dialog is modal and the document cannot change meanwhile.
            app.dialog()
                .file()
                .set_parent(&window)
                .add_filter(filter_name, &IMAGE_EXTENSIONS)
                .blocking_pick_files()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|file| file.into_path().ok())
                .collect()
        })
    })
    .await?
}

/// Checks the document before anything is shown, then copies only what `choose_pictures` returns.
fn add_chosen_pictures(
    request: &PictureFilesRequest,
    access: &DocumentAccessList,
    choose_pictures: impl FnOnce(&str) -> Vec<PathBuf>,
) -> Result<Vec<ChosenPictureOutcome>, DocumentError> {
    let folder = opened_document_folder(&request.document_path, access)?;
    let filter_name = validated_filter_name(&request.filter_name)?;
    let chosen = choose_pictures(filter_name);
    Ok(copy_chosen_pictures(
        &folder,
        &request.attachment_folder,
        &chosen,
    ))
}

fn validated_filter_name(filter_name: &str) -> Result<&str, DocumentError> {
    let is_valid = !filter_name.trim().is_empty()
        && filter_name.chars().count() <= MAX_FILTER_NAME_CHARACTERS
        && !filter_name
            .chars()
            .any(|character| character.is_control() || is_format_character(character));
    if is_valid {
        Ok(filter_name)
    } else {
        Err(DocumentError::InvalidRequest)
    }
}

/// Unicode format characters (general category Cf), such as bidirectional overrides and
/// zero-width characters, which could make the dialog's filter read differently from what it is.
fn is_format_character(character: char) -> bool {
    matches!(
        character,
        '\u{00AD}'
            | '\u{0600}'..='\u{0605}'
            | '\u{061C}'
            | '\u{06DD}'
            | '\u{070F}'
            | '\u{0890}'..='\u{0891}'
            | '\u{08E2}'
            | '\u{180E}'
            | '\u{200B}'..='\u{200F}'
            | '\u{202A}'..='\u{202E}'
            | '\u{2060}'..='\u{2064}'
            | '\u{2066}'..='\u{206F}'
            | '\u{FEFF}'
            | '\u{FFF9}'..='\u{FFFB}'
            | '\u{110BD}'
            | '\u{110CD}'
            | '\u{13430}'..='\u{1343F}'
            | '\u{1BCA0}'..='\u{1BCA3}'
            | '\u{1D173}'..='\u{1D17A}'
            | '\u{E0001}'
            | '\u{E0020}'..='\u{E007F}'
    )
}

/// The folder of a document the app opened from an allowed place; any other document is refused.
fn opened_document_folder(
    document_path: &str,
    access: &DocumentAccessList,
) -> Result<PathBuf, DocumentError> {
    let location = locate_document(&validated_path(document_path)?)?;
    if !access.is_allowed(&location) || !access.was_opened(&location) {
        return Err(DocumentError::AccessDenied);
    }
    location
        .path()
        .parent()
        .map(PathBuf::from)
        .ok_or(DocumentError::InvalidRequest)
}

fn save_requested_attachment(
    request: AttachmentRequest,
    access: &DocumentAccessList,
    dropped: &DroppedImages,
) -> Result<SavedAttachmentReply, DocumentError> {
    let location = locate_document(&validated_path(&request.document_path)?)?;
    if !access.is_allowed(&location)
        || !access.was_opened(&location)
        || access.is_read_only(&location)
    {
        return Err(DocumentError::AccessDenied);
    }
    let document = location.path();
    let note_folder = document.parent().ok_or(DocumentError::InvalidRequest)?;
    let base = match &request.notes_folder {
        Some(notes_folder) => notes_folder_holding(&location, notes_folder, access)?,
        None => note_folder.to_path_buf(),
    };
    let bytes = source_bytes(request.source, dropped)?;
    let saved = save_attachment_bytes(
        &base,
        &request.attachment_folder,
        &request.suggested_name,
        &bytes,
    )?;
    Ok(SavedAttachmentReply {
        relative_path: link_from(note_folder, &base, &saved.relative_path)?,
    })
}

/// The notes folder must be granted and hold the note, so a picture never lands anywhere else.
fn notes_folder_holding(
    note: &DocumentLocation,
    notes_folder: &str,
    access: &DocumentAccessList,
) -> Result<PathBuf, DocumentError> {
    let folder = locate_document(&validated_path(notes_folder)?)?;
    let is_inside = note
        .canonical_key
        .strip_prefix(&folder.canonical_key)
        .is_some_and(|rest| rest.starts_with(std::path::MAIN_SEPARATOR));
    if !access.is_folder_allowed(&folder) || !is_inside {
        return Err(DocumentError::AccessDenied);
    }
    Ok(folder.path())
}

/// The saved path, relative to `base`, as a link from the note's folder: `../Attachments/a.png`.
fn link_from(note_folder: &Path, base: &Path, saved: &str) -> Result<String, DocumentError> {
    let note_folder = dunce::canonicalize(note_folder)?;
    let base = dunce::canonicalize(base)?;
    let depth = note_folder
        .strip_prefix(&base)
        .map_err(|_| DocumentError::AccessDenied)?
        .components()
        .filter(|component| matches!(component, Component::Normal(_)))
        .count();
    Ok(format!("{}{saved}", "../".repeat(depth)))
}

fn source_bytes(
    source: AttachmentSource,
    dropped: &DroppedImages,
) -> Result<Vec<u8>, DocumentError> {
    match source {
        AttachmentSource::PastedBytes { bytes } => Ok(bytes),
        AttachmentSource::DroppedFile { path } => {
            let path = PathBuf::from(path);
            if !dropped.take(&path) {
                return Err(DocumentError::AccessDenied);
            }
            read_picture_file(&path)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\npicture";

    fn opened_document() -> (tempfile::TempDir, String, DocumentAccessList) {
        let folder = tempfile::tempdir().unwrap();
        let document = folder.path().join("guide.md");
        fs::write(&document, "# Guide").unwrap();
        let access = DocumentAccessList::default();
        let location = access.grant_folder_of(&document).unwrap();
        access.remember_opened(&location);
        (folder, location.display_path, access)
    }

    fn request(document_path: &str, source: AttachmentSource) -> AttachmentRequest {
        AttachmentRequest {
            document_path: document_path.to_owned(),
            attachment_folder: "assets".to_owned(),
            suggested_name: "chart.png".to_owned(),
            source,
            notes_folder: None,
        }
    }

    /// A note in `Projects` of a notes folder the window was granted and opened the note from.
    fn opened_note() -> (tempfile::TempDir, String, DocumentAccessList) {
        let folder = tempfile::tempdir().unwrap();
        fs::create_dir(folder.path().join("Projects")).unwrap();
        let note = folder.path().join("Projects").join("Plan.md");
        fs::write(&note, "# Plan").unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(folder.path()).unwrap();
        access.remember_opened(&locate_document(&note).unwrap());
        (folder, note.to_string_lossy().into_owned(), access)
    }

    fn pasted_into_notes(note: &str, notes_folder: &Path, bytes: &[u8]) -> AttachmentRequest {
        AttachmentRequest {
            attachment_folder: "Attachments".to_owned(),
            notes_folder: Some(notes_folder.to_string_lossy().into_owned()),
            ..request(
                note,
                AttachmentSource::PastedBytes {
                    bytes: bytes.to_vec(),
                },
            )
        }
    }

    #[test]
    fn the_inserted_link_is_relative_to_the_note() {
        let (folder, note, access) = opened_note();

        let saved = save_requested_attachment(
            pasted_into_notes(&note, folder.path(), PNG),
            &access,
            &DroppedImages::default(),
        )
        .unwrap();

        assert_eq!(saved.relative_path, "../Attachments/chart.png");
        assert_eq!(
            fs::read(folder.path().join("Attachments").join("chart.png")).unwrap(),
            PNG
        );
    }

    #[test]
    fn the_attachments_folder_is_made_only_when_the_first_picture_comes() {
        let (folder, note, access) = opened_note();
        assert!(!folder.path().join("Attachments").exists());

        save_requested_attachment(
            pasted_into_notes(&note, folder.path(), PNG),
            &access,
            &DroppedImages::default(),
        )
        .unwrap();

        assert!(folder.path().join("Attachments").is_dir());
    }

    #[test]
    fn unique_names_never_overwrite_in_the_attachments_folder() {
        let (folder, note, access) = opened_note();
        let dropped = DroppedImages::default();
        let other = b"\x89PNG\r\n\x1a\nanother picture";
        save_requested_attachment(
            pasted_into_notes(&note, folder.path(), PNG),
            &access,
            &dropped,
        )
        .unwrap();

        let second = save_requested_attachment(
            pasted_into_notes(&note, folder.path(), other),
            &access,
            &dropped,
        )
        .unwrap();

        assert_eq!(second.relative_path, "../Attachments/chart-2.png");
        assert_eq!(
            fs::read(folder.path().join("Attachments").join("chart.png")).unwrap(),
            PNG
        );
    }

    #[test]
    fn a_notes_folder_that_does_not_hold_the_note_is_refused() {
        let (_folder, note, access) = opened_note();
        let elsewhere = tempfile::tempdir().unwrap();
        access.grant_folder(elsewhere.path()).unwrap();

        let refusal = save_requested_attachment(
            pasted_into_notes(&note, elsewhere.path(), PNG),
            &access,
            &DroppedImages::default(),
        );

        assert_eq!(refusal, Err(DocumentError::AccessDenied));
        assert!(!elsewhere.path().join("Attachments").exists());
    }

    #[test]
    fn copies_a_dropped_picture_next_to_the_document() {
        let (folder, document, access) = opened_document();
        let picture = folder.path().join("chart.png");
        fs::write(&picture, PNG).unwrap();
        let dropped = DroppedImages::default();
        dropped.remember([picture.clone()]);
        let source = AttachmentSource::DroppedFile {
            path: picture.to_string_lossy().into_owned(),
        };

        let saved =
            save_requested_attachment(request(&document, source), &access, &dropped).unwrap();

        assert_eq!(saved.relative_path, "assets/chart.png");
    }

    #[test]
    fn refuses_a_file_that_was_not_dropped() {
        let (folder, document, access) = opened_document();
        let picture = folder.path().join("chart.png");
        fs::write(&picture, PNG).unwrap();
        let source = AttachmentSource::DroppedFile {
            path: picture.to_string_lossy().into_owned(),
        };

        let refusal = save_requested_attachment(
            request(&document, source),
            &access,
            &DroppedImages::default(),
        );

        assert_eq!(refusal, Err(DocumentError::AccessDenied));
    }

    #[test]
    fn refuses_a_document_the_app_did_not_open() {
        let folder = tempfile::tempdir().unwrap();
        let document = folder.path().join("other.md");
        fs::write(&document, "#").unwrap();
        let source = AttachmentSource::PastedBytes {
            bytes: PNG.to_vec(),
        };

        let refusal = save_requested_attachment(
            request(&document.to_string_lossy(), source),
            &DocumentAccessList::default(),
            &DroppedImages::default(),
        );

        assert_eq!(refusal, Err(DocumentError::AccessDenied));
    }

    #[test]
    fn saves_pasted_bytes() {
        let (_folder, document, access) = opened_document();
        let source = AttachmentSource::PastedBytes {
            bytes: PNG.to_vec(),
        };

        let saved = save_requested_attachment(
            request(&document, source),
            &access,
            &DroppedImages::default(),
        );

        assert_eq!(
            saved,
            Ok(SavedAttachmentReply {
                relative_path: "assets/chart.png".to_owned()
            })
        );
    }

    fn picture_files_request(document_path: &str) -> PictureFilesRequest {
        PictureFilesRequest {
            document_path: document_path.to_owned(),
            attachment_folder: "assets".to_owned(),
            filter_name: "Pictures".to_owned(),
        }
    }

    #[test]
    fn only_files_chosen_in_the_dialog_are_copied() {
        let (folder, document, access) = opened_document();
        let pictures = tempfile::tempdir().unwrap();
        let chosen = pictures.path().join("chosen.png");
        fs::write(&chosen, PNG).unwrap();
        fs::write(pictures.path().join("other.png"), PNG).unwrap();

        let outcomes = add_chosen_pictures(&picture_files_request(&document), &access, |_| {
            vec![chosen.clone()]
        })
        .unwrap();

        let copied: Vec<String> = fs::read_dir(folder.path().join("assets"))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            outcomes,
            vec![ChosenPictureOutcome::Saved {
                relative_path: "assets/chosen.png".to_owned()
            }]
        );
        assert_eq!(copied, vec!["chosen.png".to_owned()]);
    }

    #[test]
    fn an_unknown_document_key_is_refused_before_the_dialog_shows() {
        let folder = tempfile::tempdir().unwrap();
        let document = folder.path().join("other.md");
        fs::write(&document, "#").unwrap();
        let mut was_dialog_shown = false;

        let refusal = add_chosen_pictures(
            &picture_files_request(&document.to_string_lossy()),
            &DocumentAccessList::default(),
            |_| {
                was_dialog_shown = true;
                Vec::new()
            },
        );

        assert_eq!(refusal, Err(DocumentError::AccessDenied));
        assert!(!was_dialog_shown);
    }

    #[test]
    fn names_the_dialog_filter_with_the_translated_name() {
        let (_folder, document, access) = opened_document();
        let mut shown_filter = String::new();

        let outcomes = add_chosen_pictures(&picture_files_request(&document), &access, |name| {
            name.clone_into(&mut shown_filter);
            Vec::new()
        });

        assert_eq!(outcomes, Ok(Vec::new()));
        assert_eq!(shown_filter, "Pictures");
    }

    #[test]
    fn refuses_an_empty_overlong_control_or_format_character_filter_name() {
        let longest = "P".repeat(MAX_FILTER_NAME_CHARACTERS);
        let overlong = "P".repeat(MAX_FILTER_NAME_CHARACTERS + 1);

        assert_eq!(validated_filter_name(&longest), Ok(longest.as_str()));
        for refused in [
            " ",
            overlong.as_str(),
            "Pictures\n",
            "Pic\0tures",
            "Pictures\u{202E}gnp.exe",
            "Pic\u{200B}tures",
            "\u{FEFF}Pictures",
        ] {
            assert_eq!(
                validated_filter_name(refused),
                Err(DocumentError::InvalidRequest),
                "{refused:?}"
            );
        }
    }

    #[test]
    fn an_invalid_filter_name_stops_the_dialog_from_showing() {
        let (_folder, document, access) = opened_document();
        let mut was_dialog_shown = false;
        let request = PictureFilesRequest {
            filter_name: "Pictures\u{202E}".to_owned(),
            ..picture_files_request(&document)
        };

        let refusal = add_chosen_pictures(&request, &access, |_| {
            was_dialog_shown = true;
            Vec::new()
        });

        assert_eq!(refusal, Err(DocumentError::InvalidRequest));
        assert!(!was_dialog_shown);
    }

    #[test]
    fn an_allowed_document_that_was_never_opened_is_refused() {
        let folder = tempfile::tempdir().unwrap();
        let document = folder.path().join("guide.md");
        fs::write(&document, "# Guide").unwrap();
        let access = DocumentAccessList::default();
        let location = access.grant_folder_of(&document).unwrap();
        let mut was_dialog_shown = false;

        let refusal = add_chosen_pictures(
            &picture_files_request(&location.display_path),
            &access,
            |_| {
                was_dialog_shown = true;
                Vec::new()
            },
        );

        assert_eq!(refusal, Err(DocumentError::AccessDenied));
        assert!(!was_dialog_shown);
    }

    #[cfg(windows)]
    #[test]
    fn copies_a_chosen_picture_reached_through_a_junction() {
        let (folder, document, access) = opened_document();
        let pictures = tempfile::tempdir().unwrap();
        fs::write(pictures.path().join("chart.png"), PNG).unwrap();
        let shortcut_folder = tempfile::tempdir().unwrap();
        let junction = shortcut_folder.path().join("linked");
        // Junctions need no administrator rights, unlike symbolic links.
        let created = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&junction)
            .arg(pictures.path())
            .output()
            .unwrap();
        assert!(created.status.success());

        let outcomes = add_chosen_pictures(&picture_files_request(&document), &access, |_| {
            vec![junction.join("chart.png")]
        })
        .unwrap();

        assert_eq!(
            outcomes,
            vec![ChosenPictureOutcome::Saved {
                relative_path: "assets/chart.png".to_owned()
            }]
        );
        assert_eq!(
            fs::read(folder.path().join("assets").join("chart.png")).unwrap(),
            PNG
        );
    }
}
