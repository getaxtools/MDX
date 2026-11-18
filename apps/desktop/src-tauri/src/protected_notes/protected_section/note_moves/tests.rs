use super::*;
use crate::protected_notes::{KdfParameters, SectionFolder};

const PASSWORD: &str = "correct horse battery";
const BYTES: &[u8] = b"\xEF\xBB\xBFPIN 4821\r\nsecond line\r\n";

fn section() -> (tempfile::TempDir, SectionFolder, UnlockedSection) {
    let root = tempfile::tempdir().unwrap();
    let folder = SectionFolder::new(root.path().join("protected"));
    let (section, _recovery) = folder.set_up(PASSWORD, KdfParameters::FLOOR).unwrap();
    (root, folder, section)
}

fn moved_in<'note>(title: &'note str, bytes: &'note [u8]) -> NoteMovedIn<'note> {
    NoteMovedIn {
        title,
        folder: "Finance",
        bytes,
        now_ms: 5,
    }
}

#[test]
fn a_moved_in_note_keeps_its_exact_bytes_and_title_and_survives_a_lock() {
    let (_root, folder, mut section) = section();

    let note_id = section.move_in(&moved_in("Bank details", BYTES)).unwrap();
    drop(section);
    let reopened = UnlockedSection::unlock_with_password(&folder, PASSWORD).unwrap();
    let taken = reopened.take_out(&note_id).unwrap();

    assert_eq!(taken.bytes.as_slice(), BYTES);
    assert_eq!(taken.title, "Bank details");
    assert_eq!(reopened.notes()[0].folder, "Finance");
}

#[test]
fn a_removed_note_leaves_the_list_and_its_file_is_gone() {
    let (_root, folder, mut section) = section();
    let note_id = section.move_in(&moved_in("Gone", b"text")).unwrap();

    section.remove(&note_id).unwrap();
    drop(section);
    let reopened = UnlockedSection::unlock_with_password(&folder, PASSWORD).unwrap();

    assert!(reopened.notes().is_empty());
    assert!(!folder.note_path(&note_id).exists());
}

#[test]
fn a_note_removed_during_a_re_encryption_does_not_hold_the_old_key_back() {
    let (_root, _folder, mut section) = section();
    let kept = section.move_in(&moved_in("Kept", b"kept")).unwrap();
    let removed = section.move_in(&moved_in("Removed", b"removed")).unwrap();
    section
        .start_reencryption("staple tuna lighthouse", KdfParameters::FLOOR, None)
        .unwrap();

    section.remove(&removed).unwrap();
    let progress = section.continue_reencryption(100).unwrap();

    assert_eq!((progress.remaining, progress.held_back), (0, 0));
    assert!(!section.is_reencrypting());
    assert_eq!(section.take_out(&kept).unwrap().bytes.as_slice(), b"kept");
}
