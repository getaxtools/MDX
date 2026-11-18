use std::fs;
use std::path::{Path, PathBuf};

use super::*;
use crate::commands::protected_notes::section_place_of;
use crate::protected_notes::KdfParameters;
use crate::secrets::InMemoryDeviceSecrets;

const PASSWORD: &str = "correct horse battery";
const SECRET: &[u8] = b"secret chart 4821";

fn picture() -> Vec<u8> {
    [b"\x89PNG\r\n\x1a\n".as_slice(), SECRET].concat()
}

struct Opened {
    _folder: tempfile::TempDir,
    notes_folder: PathBuf,
    place: SectionPlace,
    notes: ProtectedNotes,
}

fn opened() -> Opened {
    let folder = tempfile::tempdir().unwrap();
    let notes_folder = dunce::canonicalize(folder.path()).unwrap();
    fs::write(notes_folder.join("Plain.md"), b"plain").unwrap();
    let place = section_place_of(&notes_folder);
    let notes = ProtectedNotes::new(
        Box::new(InMemoryDeviceSecrets::default()),
        notes_folder.join("records.json"),
    );
    notes
        .set_up(&place, PASSWORD, KdfParameters::FLOOR)
        .unwrap();
    Opened {
        _folder: folder,
        notes_folder,
        place,
        notes,
    }
}

fn pasted(name: &str, bytes: Vec<u8>) -> ProtectedAttachmentRequest {
    ProtectedAttachmentRequest {
        suggested_name: name.to_owned(),
        source: AttachmentSource::PastedBytes { bytes },
    }
}

fn dropped_file(path: &Path) -> ProtectedAttachmentRequest {
    ProtectedAttachmentRequest {
        suggested_name: "dropped.png".to_owned(),
        source: AttachmentSource::DroppedFile {
            path: path.to_string_lossy().into_owned(),
        },
    }
}

fn every_file_in(folder: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for entry in fs::read_dir(folder).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            files.extend(every_file_in(&path));
        } else {
            files.push(path);
        }
    }
    files
}

fn holds(path: &Path, needle: &[u8]) -> bool {
    fs::read(path)
        .unwrap()
        .windows(needle.len())
        .any(|window| window == needle)
}

#[test]
fn a_pasted_picture_is_sealed_in_the_section_and_no_file_outside_it_appears() {
    let opened = opened();
    let before = every_file_in(&opened.notes_folder);

    let added = opened
        .notes
        .add_attachment(
            &opened.place,
            pasted("Chart.png", picture()),
            &DroppedImages::default(),
        )
        .unwrap();
    let after = every_file_in(&opened.notes_folder);
    let shown = opened
        .notes
        .open_attachment(&opened.place, &added.note_id)
        .unwrap();

    assert_eq!(added.file_name, "Chart.png");
    assert_eq!(shown.as_slice(), picture());
    let new_files: Vec<&PathBuf> = after.iter().filter(|file| !before.contains(file)).collect();
    assert!(!new_files.is_empty());
    assert!(
        new_files
            .iter()
            .all(|file| file.starts_with(opened.place.folder.as_ref()))
    );
    assert!(after.iter().all(|file| !holds(file, SECRET)));
}

#[test]
fn a_dropped_picture_is_taken_only_when_the_window_saw_it_dropped() {
    let opened = opened();
    let elsewhere = tempfile::tempdir().unwrap();
    let dropped_path = elsewhere.path().join("dropped.png");
    fs::write(&dropped_path, picture()).unwrap();
    let dropped = DroppedImages::default();

    let unseen = opened
        .notes
        .add_attachment(&opened.place, dropped_file(&dropped_path), &dropped);
    dropped.remember([dropped_path.clone()]);
    let added = opened
        .notes
        .add_attachment(&opened.place, dropped_file(&dropped_path), &dropped)
        .unwrap();

    assert_eq!(unseen.err(), Some(ProtectedCommandError::AccessDenied));
    assert_eq!(
        opened
            .notes
            .open_attachment(&opened.place, &added.note_id)
            .unwrap()
            .as_slice(),
        picture()
    );
}

#[test]
fn what_is_not_a_picture_too_large_or_sent_while_locked_is_refused() {
    let opened = opened();
    let none = DroppedImages::default();
    let too_large = [picture(), vec![0; MAX_ATTACHMENT_BYTES]].concat();
    let add = |request| {
        opened
            .notes
            .add_attachment(&opened.place, request, &none)
            .err()
    };

    assert_eq!(
        add(pasted("notes.txt", b"plain text".to_vec())),
        Some(ProtectedCommandError::InvalidRequest)
    );
    assert_eq!(
        add(pasted("big.png", too_large)),
        Some(ProtectedCommandError::TooLarge)
    );
    let _ = opened.notes.lock(&opened.place);
    assert_eq!(
        add(pasted("Chart.png", picture())),
        Some(ProtectedCommandError::Locked)
    );
}

#[test]
fn a_note_is_never_served_as_a_picture() {
    let opened = opened();
    let note_id = opened
        .notes
        .with_section(&opened.place, |section| {
            Ok(section.create("Bank details", "", 1)?)
        })
        .unwrap();

    assert_eq!(
        opened.notes.open_attachment(&opened.place, &note_id).err(),
        Some(ProtectedCommandError::NotFound)
    );
    assert_eq!(
        opened
            .notes
            .open_attachment(&opened.place, "../vault")
            .err(),
        Some(ProtectedCommandError::InvalidRequest)
    );
}
