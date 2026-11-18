use std::sync::Mutex;

use super::*;
use crate::secrets::InMemoryDeviceSecrets;

const PASSWORD: &str = "correct horse battery";
const QUICK: KdfParameters = KdfParameters::FLOOR;
const BYTES: &[u8] = b"\xEF\xBB\xBFPIN 4821\r\nsecond line\r\n";

/// A Recycle Bin that takes the files it is given, or refuses them all, and remembers what it saw.
#[derive(Default)]
struct FakeRecycleBin {
    refuses: bool,
    recycled: Mutex<Vec<PathBuf>>,
}

impl RecycleBin for FakeRecycleBin {
    fn capacity_for(&self, _folder: &Path) -> Option<u64> {
        None
    }

    fn recycle(&self, paths: &[PathBuf]) -> std::io::Result<Vec<PathBuf>> {
        self.recycled.lock().unwrap().extend_from_slice(paths);
        if self.refuses {
            return Ok(paths.to_vec());
        }
        for path in paths {
            fs::remove_file(path)?;
        }
        Ok(Vec::new())
    }
}

struct Opened {
    folder: tempfile::TempDir,
    notes_folder: PathBuf,
    place: SectionPlace,
    notes: ProtectedNotes,
}

/// A notes location with a plain note `Bank details.md`, and its section set up and unlocked.
fn opened() -> Opened {
    let folder = tempfile::tempdir().unwrap();
    let notes_folder = dunce::canonicalize(folder.path()).unwrap();
    fs::write(notes_folder.join("Bank details.md"), BYTES).unwrap();
    let place = section_place_of(&notes_folder);
    let notes = ProtectedNotes::new(
        Box::new(InMemoryDeviceSecrets::default()),
        notes_folder.join("records.json"),
    );
    notes.set_up(&place, PASSWORD, QUICK).unwrap();
    Opened {
        folder,
        notes_folder,
        place,
        notes,
    }
}

fn move_in_request(note: &Path, confirmed: bool) -> ProtectedMoveIn {
    ProtectedMoveIn {
        note: note.to_string_lossy().into_owned(),
        into_folder: String::new(),
        confirmed,
    }
}

fn move_out_request(note_id: &str, into: &Path, confirmed: bool) -> ProtectedMoveOut {
    ProtectedMoveOut {
        note_id: note_id.to_owned(),
        into_folder: into.to_string_lossy().into_owned(),
        confirmed,
    }
}

#[test]
fn a_moved_in_note_opens_with_its_exact_bytes_and_only_then_goes_to_the_recycle_bin() {
    let opened = opened();
    let plain = opened.notes_folder.join("Bank details.md");
    let recycle_bin = FakeRecycleBin::default();

    let answer = opened
        .notes
        .move_in(&opened.place, &move_in_request(&plain, true), &recycle_bin)
        .unwrap();
    let listed = opened.notes.list(&opened.place).unwrap();
    let text = opened.notes.open(&opened.place, &answer.note_id).unwrap();

    assert!(!answer.is_plain_copy_kept);
    assert_eq!(*recycle_bin.recycled.lock().unwrap(), vec![plain.clone()]);
    assert!(!plain.exists());
    assert_eq!(listed[0].title, "Bank details");
    assert_eq!(text.text, "PIN 4821\r\nsecond line\r\n");
    assert!(text.has_byte_order_mark);
}

#[test]
fn a_failed_encrypt_leaves_the_plain_note_and_never_asks_the_recycle_bin() {
    let opened = opened();
    let plain = opened.notes_folder.join("Bank details.md");
    let section_notes = opened.place.folder.as_ref().join("notes");
    fs::remove_dir_all(&section_notes).unwrap();
    fs::write(&section_notes, b"not a folder").unwrap();
    let recycle_bin = FakeRecycleBin::default();

    let failed = opened
        .notes
        .move_in(&opened.place, &move_in_request(&plain, true), &recycle_bin);
    let _ = opened.notes.lock(&opened.place);
    let locked = opened
        .notes
        .move_in(&opened.place, &move_in_request(&plain, true), &recycle_bin);

    assert_eq!(failed.err(), Some(ProtectedCommandError::Unavailable));
    assert_eq!(locked.err(), Some(ProtectedCommandError::Locked));
    assert!(recycle_bin.recycled.lock().unwrap().is_empty());
    assert_eq!(fs::read(&plain).unwrap(), BYTES);
}

#[test]
fn a_plain_note_the_recycle_bin_refuses_is_kept_and_said_so() {
    let opened = opened();
    let plain = opened.notes_folder.join("Bank details.md");
    let recycle_bin = FakeRecycleBin {
        refuses: true,
        ..FakeRecycleBin::default()
    };

    let answer = opened
        .notes
        .move_in(&opened.place, &move_in_request(&plain, true), &recycle_bin)
        .unwrap();

    assert!(answer.is_plain_copy_kept);
    assert!(plain.exists());
}

#[test]
fn moves_in_that_are_not_confirmed_or_not_plain_notes_of_the_location_are_refused() {
    let opened = opened();
    let recycle_bin = FakeRecycleBin::default();
    let plain = opened.notes_folder.join("Bank details.md");
    fs::create_dir(opened.notes_folder.join("Bank details")).unwrap();
    let app_folder_note = opened.place.folder.as_ref().join("inside.md");
    fs::write(&app_folder_note, b"x").unwrap();
    let outside = tempfile::tempdir().unwrap();
    let outside_note = outside.path().join("elsewhere.md");
    fs::write(&outside_note, b"x").unwrap();
    let move_in = |note: &Path, confirmed: bool| {
        opened
            .notes
            .move_in(
                &opened.place,
                &move_in_request(note, confirmed),
                &recycle_bin,
            )
            .err()
    };

    assert_eq!(
        move_in(&plain, false),
        Some(ProtectedCommandError::InvalidRequest)
    );
    assert_eq!(
        move_in(&plain, true),
        Some(ProtectedCommandError::InvalidRequest)
    );
    assert_eq!(
        move_in(&app_folder_note, true),
        Some(ProtectedCommandError::AccessDenied)
    );
    assert_eq!(
        move_in(&outside_note, true),
        Some(ProtectedCommandError::AccessDenied)
    );
    assert!(recycle_bin.recycled.lock().unwrap().is_empty());
    assert!(opened.notes.list(&opened.place).unwrap().is_empty());
}

#[test]
fn a_moved_out_note_is_a_new_plain_note_with_the_same_bytes_and_leaves_the_section() {
    let opened = opened();
    let plain = opened.notes_folder.join("Bank details.md");
    let recycle_bin = FakeRecycleBin::default();
    let note_id = opened
        .notes
        .move_in(&opened.place, &move_in_request(&plain, true), &recycle_bin)
        .unwrap()
        .note_id;
    fs::write(&plain, b"a new note took the name").unwrap();

    let refused = opened.notes.move_out(
        &opened.place,
        &move_out_request(&note_id, &opened.notes_folder, false),
    );
    let written = opened
        .notes
        .move_out(
            &opened.place,
            &move_out_request(&note_id, &opened.notes_folder, true),
        )
        .unwrap();

    assert_eq!(refused.err(), Some(ProtectedCommandError::InvalidRequest));
    assert_eq!(written.file_name, "Bank details 2.md");
    assert_eq!(fs::read(&written.display_path).unwrap(), BYTES);
    assert_eq!(fs::read(&plain).unwrap(), b"a new note took the name");
    assert!(opened.notes.list(&opened.place).unwrap().is_empty());
    drop(opened.folder);
}
