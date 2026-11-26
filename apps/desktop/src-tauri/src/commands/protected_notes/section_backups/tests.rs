use std::fs;
use std::path::Path;

use super::*;
use crate::commands::protected_notes::section_place_of;
use crate::protected_notes::KdfParameters;
use crate::secrets::InMemoryDeviceSecrets;

const PASSWORD: &str = "correct horse battery";

fn notes_at(records: &Path) -> ProtectedNotes {
    ProtectedNotes::new(
        Box::new(InMemoryDeviceSecrets::default()),
        records.join("records.json"),
    )
}

fn notes_location(root: &Path, name: &str) -> SectionPlace {
    let folder = root.join(name);
    fs::create_dir_all(&folder).unwrap();
    section_place_of(&dunce::canonicalize(folder).unwrap())
}

#[test]
fn a_backup_restored_on_another_location_unlocks_and_opens_its_notes() {
    let root = tempfile::tempdir().unwrap();
    let backups = root.path().join("Backups");
    fs::create_dir(&backups).unwrap();
    let notes = notes_at(root.path());
    let first = notes_location(root.path(), "First");
    notes
        .set_up(&first, PASSWORD, KdfParameters::FLOOR)
        .unwrap();
    let note_id = notes
        .with_section(&first, |section| {
            Ok(section.create("Bank details", "", 1)?)
        })
        .unwrap();

    let backup = notes.back_up(&first, || Some(backups.clone())).unwrap();
    let second = notes_location(root.path(), "Second");
    let restored = notes.restore(&second, || backup.as_deref().map(PathBuf::from));
    notes.unlock(&second, PASSWORD, false).unwrap();

    assert!(backup.unwrap().ends_with("MDX protected notes backup"));
    assert_eq!(restored, Ok(true));
    assert!(notes.open(&second, &note_id).is_ok());
}

#[test]
fn cancelled_dialogs_change_nothing_and_a_backup_never_goes_inside_the_section() {
    let root = tempfile::tempdir().unwrap();
    let notes = notes_at(root.path());
    let first = notes_location(root.path(), "First");
    let empty = notes_location(root.path(), "Empty");

    assert_eq!(
        notes.back_up(&first, || None),
        Err(ProtectedCommandError::NotSetUp)
    );
    notes
        .set_up(&first, PASSWORD, KdfParameters::FLOOR)
        .unwrap();
    let inside = first.folder.as_ref().join("notes");

    assert_eq!(notes.back_up(&first, || None), Ok(None));
    assert_eq!(
        notes.back_up(&first, || Some(inside)),
        Err(ProtectedCommandError::AccessDenied)
    );
    assert_eq!(notes.restore(&empty, || None), Ok(false));
    assert_eq!(
        notes.restore(&first, || Some(root.path().to_path_buf())),
        Err(ProtectedCommandError::AlreadySetUp)
    );
    assert!(!empty.folder.is_set_up());
}

#[test]
fn locking_never_waits_for_a_backup_in_progress() {
    let root = tempfile::tempdir().unwrap();
    let notes = notes_at(root.path());
    let first = notes_location(root.path(), "First");
    notes
        .set_up(&first, PASSWORD, KdfParameters::FLOOR)
        .unwrap();
    let copying = notes.copying_files();

    let locked = notes.lock_all();

    assert_eq!(locked.len(), 1);
    assert!(!notes.status(&first).is_unlocked);
    drop(copying);
}

#[test]
fn a_save_waits_for_the_backup_and_lands_after_it() {
    let root = tempfile::tempdir().unwrap();
    let backups = root.path().join("Backups");
    fs::create_dir(&backups).unwrap();
    let notes = std::sync::Arc::new(notes_at(root.path()));
    let first = notes_location(root.path(), "First");
    notes
        .set_up(&first, PASSWORD, KdfParameters::FLOOR)
        .unwrap();
    let copying = notes.copying_files();
    let saving = {
        let notes = std::sync::Arc::clone(&notes);
        let first = section_place_of(&first.notes_folder);
        std::thread::spawn(move || {
            notes.with_section(&first, |section| Ok(section.create("Later", "", 2)?))
        })
    };

    std::thread::sleep(std::time::Duration::from_millis(100));
    assert!(!saving.is_finished());
    drop(copying);

    assert!(saving.join().unwrap().is_ok());
}
