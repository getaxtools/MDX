use std::path::{Path, PathBuf};

use super::*;
use crate::protected_notes::{KdfParameters, SectionFolder};

const PASSWORD: &str = "correct horse battery";
const PNG: &[u8] = b"\x89PNG\r\n\x1a\nsecret chart";

fn section() -> (tempfile::TempDir, SectionFolder, UnlockedSection) {
    let root = tempfile::tempdir().unwrap();
    let folder = SectionFolder::new(root.path().join("protected"));
    let (section, _recovery) = folder.set_up(PASSWORD, KdfParameters::FLOOR).unwrap();
    (root, folder, section)
}

fn chart(bytes: &[u8]) -> NewAttachment<'_> {
    NewAttachment {
        stem: "Chart",
        extension: "png",
        media_type: "image/png",
        bytes,
        now_ms: 7,
    }
}

fn every_file_in(folder: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for entry in std::fs::read_dir(folder).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            files.extend(every_file_in(&path));
        } else {
            files.push(path);
        }
    }
    files
}

#[test]
fn an_attachment_reopens_after_a_lock_and_no_file_outside_the_section_holds_it() {
    let (root, folder, mut section) = section();

    let added = section.add_attachment(&chart(PNG)).unwrap();
    drop(section);
    let reopened = UnlockedSection::unlock_with_password(&folder, PASSWORD).unwrap();
    let files = every_file_in(root.path());

    assert_eq!(added.file_name, "Chart.png");
    assert_eq!(
        reopened.open_attachment(&added.note_id).unwrap().as_slice(),
        PNG
    );
    assert!(files.iter().all(|file| file.starts_with(folder.as_ref())));
    assert!(files.iter().all(|file| {
        let bytes = std::fs::read(file).unwrap();
        !bytes
            .windows(b"secret chart".len())
            .any(|window| window == b"secret chart")
            && !bytes
                .windows(b"Chart".len())
                .any(|window| window == b"Chart")
    }));
}

#[test]
fn attachments_are_listed_under_a_free_name_in_the_attachments_folder() {
    let (_root, _folder, mut section) = section();

    let first = section.add_attachment(&chart(PNG)).unwrap();
    let mut lower_case = chart(b"\x89PNG\r\n\x1a\nother");
    lower_case.stem = "chart";
    let second = section.add_attachment(&lower_case).unwrap();
    let listed = section.notes();

    assert_eq!(first.file_name, "Chart.png");
    assert_eq!(second.file_name, "chart-2.png");
    assert!(listed.iter().all(|note| note.kind == FileKind::Attachment));
    assert!(listed.iter().all(|note| note.folder == ATTACHMENT_FOLDER));
}

#[test]
fn a_note_is_never_opened_as_a_picture_nor_a_picture_as_a_note() {
    let (_root, _folder, mut section) = section();
    let note = section.create("Bank details", "", 5).unwrap();
    let picture = section.add_attachment(&chart(PNG)).unwrap().note_id;

    assert_eq!(
        section.open_attachment(&note).err(),
        Some(ProtectedError::NoteNotFound)
    );
    assert_eq!(
        section.open(&picture).err(),
        Some(ProtectedError::NoteNotFound)
    );
    assert_eq!(
        section.save(&picture, b"text", 9).err(),
        Some(ProtectedError::NoteNotFound)
    );
    assert_eq!(section.open_attachment(&picture).unwrap().as_slice(), PNG);
}
