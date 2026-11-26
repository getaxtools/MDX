use std::sync::Mutex;

use super::*;
use crate::secrets::InMemoryDeviceSecrets;

const PASSWORD: &str = "correct horse battery";
const QUICK: KdfParameters = KdfParameters::FLOOR;
const BYTES: &[u8] = b"\xEF\xBB\xBFPIN 4821\r\nsecond line\r\n";

/// Deletes the plain notes it is given as the command does, or refuses them all, or has another
/// program change each one first; remembers what it was asked to delete.
#[derive(Default)]
struct Deletions {
    refuses: bool,
    changes_first: bool,
    asked: Mutex<Vec<PathBuf>>,
}

impl Deletions {
    fn delete(&self, path: &Path, sealed: &[u8]) -> std::io::Result<PlainDeletion> {
        self.asked.lock().unwrap().push(path.to_path_buf());
        if self.refuses {
            return Err(std::io::ErrorKind::PermissionDenied.into());
        }
        if self.changes_first {
            fs::write(path, b"PIN 9999, typed after the move started")?;
        }
        delete_if_unchanged(path, sealed)
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
fn a_moved_in_note_opens_with_its_exact_bytes_and_only_then_is_deleted_for_good() {
    let opened = opened();
    let plain = opened.notes_folder.join("Bank details.md");
    let deletions = Deletions::default();

    let answer = opened
        .notes
        .move_in(
            &opened.place,
            &move_in_request(&plain, true),
            &|path, sealed| deletions.delete(path, sealed),
        )
        .unwrap();
    let listed = opened.notes.list(&opened.place).unwrap();
    let text = opened.notes.open(&opened.place, &answer.note_id).unwrap();

    assert!(!answer.is_plain_copy_kept);
    assert_eq!(*deletions.asked.lock().unwrap(), vec![plain.clone()]);
    assert!(!plain.exists());
    assert_eq!(listed[0].title, "Bank details");
    assert_eq!(text.text, "PIN 4821\r\nsecond line\r\n");
    assert!(text.has_byte_order_mark);
}

#[test]
fn a_failed_encrypt_leaves_the_plain_note_and_never_deletes_it() {
    let opened = opened();
    let plain = opened.notes_folder.join("Bank details.md");
    let section_notes = opened.place.folder.as_ref().join("notes");
    fs::remove_dir_all(&section_notes).unwrap();
    fs::write(&section_notes, b"not a folder").unwrap();
    let deletions = Deletions::default();

    let failed = opened.notes.move_in(
        &opened.place,
        &move_in_request(&plain, true),
        &|path, sealed| deletions.delete(path, sealed),
    );
    let _ = opened.notes.lock(&opened.place);
    let locked = opened.notes.move_in(
        &opened.place,
        &move_in_request(&plain, true),
        &|path, sealed| deletions.delete(path, sealed),
    );

    assert_eq!(failed.err(), Some(ProtectedCommandError::Unavailable));
    assert_eq!(locked.err(), Some(ProtectedCommandError::Locked));
    assert!(deletions.asked.lock().unwrap().is_empty());
    assert_eq!(fs::read(&plain).unwrap(), BYTES);
}

#[test]
fn a_plain_note_that_cannot_be_deleted_is_kept_and_said_so() {
    let opened = opened();
    let plain = opened.notes_folder.join("Bank details.md");
    let deletions = Deletions {
        refuses: true,
        ..Deletions::default()
    };

    let answer = opened
        .notes
        .move_in(
            &opened.place,
            &move_in_request(&plain, true),
            &|path, sealed| deletions.delete(path, sealed),
        )
        .unwrap();

    assert!(answer.is_plain_copy_kept);
    assert!(plain.exists());
}

#[test]
fn moves_in_that_are_not_confirmed_or_not_plain_notes_of_the_location_are_refused() {
    let opened = opened();
    let deletions = Deletions::default();
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
                &|path, sealed| deletions.delete(path, sealed),
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
    assert!(deletions.asked.lock().unwrap().is_empty());
    assert!(opened.notes.list(&opened.place).unwrap().is_empty());
}

#[test]
fn a_moved_out_note_is_a_new_plain_note_with_the_same_bytes_and_leaves_the_section() {
    let opened = opened();
    let plain = opened.notes_folder.join("Bank details.md");
    let deletions = Deletions::default();
    let note_id = opened
        .notes
        .move_in(
            &opened.place,
            &move_in_request(&plain, true),
            &|path, sealed| deletions.delete(path, sealed),
        )
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

#[test]
fn a_plain_note_changed_before_its_delete_is_kept_and_the_move_undone() {
    let opened = opened();
    let plain = opened.notes_folder.join("Bank details.md");
    let deletions = Deletions {
        changes_first: true,
        ..Deletions::default()
    };

    let moved = opened.notes.move_in(
        &opened.place,
        &move_in_request(&plain, true),
        &|path, sealed| deletions.delete(path, sealed),
    );

    assert_eq!(moved.err(), Some(ProtectedCommandError::PlainNoteChanged));
    assert_eq!(
        fs::read(&plain).unwrap(),
        b"PIN 9999, typed after the move started"
    );
    assert!(opened.notes.list(&opened.place).unwrap().is_empty());
}

#[test]
fn nothing_moves_in_while_a_folder_warning_waits() {
    let opened = opened();
    let plain = opened.notes_folder.join("Bank details.md");
    let deletions = Deletions::default();
    opened
        .notes
        .awaiting()
        .insert(opened.place.location_key.clone());

    let moved = opened.notes.move_in(
        &opened.place,
        &move_in_request(&plain, true),
        &|path, sealed| deletions.delete(path, sealed),
    );

    assert_eq!(moved.err(), Some(ProtectedCommandError::InvalidRequest));
    assert_eq!(fs::read(&plain).unwrap(), BYTES);
}
