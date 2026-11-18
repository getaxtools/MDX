use super::*;
use crate::protected_notes::{KdfParameters, SlotKind, UnlockedSection, recovery_key_text};

const PASSWORD: &str = "correct horse battery";

struct BackedUp {
    _root: tempfile::TempDir,
    backup: PathBuf,
    recovery_key: String,
    note_id: String,
    restored: SectionFolder,
}

/// A section with one note, backed up, and a section folder elsewhere to restore it to.
fn backed_up() -> BackedUp {
    let root = tempfile::tempdir().unwrap();
    let folder = SectionFolder::new(root.path().join("first").join("protected"));
    let (mut section, recovery_key) = folder.set_up(PASSWORD, KdfParameters::FLOOR).unwrap();
    let note_id = section.create("Bank details", "Finance", 5).unwrap();
    section.save(&note_id, b"PIN 4821\r\n", 6).unwrap();
    drop(section);
    let backups = root.path().join("Backups");
    fs::create_dir(&backups).unwrap();
    let backup = folder.back_up(&backups).unwrap();
    let restored = SectionFolder::new(root.path().join("second").join("protected"));
    BackedUp {
        _root: root,
        backup,
        recovery_key: recovery_key_text(&recovery_key).to_string(),
        note_id,
        restored,
    }
}

/// The names in the folder that holds a section's folder.
fn entries_beside(section: &SectionFolder) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(section.as_ref().parent().unwrap())
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

#[test]
fn a_restored_backup_unlocks_with_the_password_and_the_recovery_key_and_keeps_its_notes() {
    let backed_up = backed_up();

    backed_up.restored.restore_from(&backed_up.backup).unwrap();
    let with_password =
        UnlockedSection::unlock_with_password(&backed_up.restored, PASSWORD).unwrap();
    let recovery_key =
        crate::protected_notes::recovery_key_from_text(&backed_up.recovery_key).unwrap();
    let with_recovery_key =
        UnlockedSection::unlock_with_key(&backed_up.restored, SlotKind::Recovery, &recovery_key);

    assert_eq!(
        with_password
            .open(&backed_up.note_id)
            .unwrap()
            .bytes
            .as_slice(),
        b"PIN 4821\r\n"
    );
    assert_eq!(with_password.notes()[0].title, "Bank details");
    assert!(with_recovery_key.is_ok());
    assert_eq!(entries_beside(&backed_up.restored), ["protected"]);
}

#[test]
fn a_backup_is_the_section_as_it_is_and_never_overwrites_another() {
    let backed_up = backed_up();
    let backups = backed_up.backup.parent().unwrap();

    let second = SectionFolder::new(backups.parent().unwrap().join("first").join("protected"))
        .back_up(backups)
        .unwrap();

    assert_eq!(second.file_name().unwrap(), "MDX protected notes backup 2");
    for name in [VAULT_FILE_NAME, MANIFEST_FILE_NAME] {
        assert_eq!(
            fs::read(backed_up.backup.join(name)).unwrap(),
            fs::read(second.join(name)).unwrap()
        );
    }
    let note_file = Path::new(NOTES_FOLDER).join(format!("{}.mdxp", backed_up.note_id));
    assert!(backed_up.backup.join(&note_file).is_file());
    assert!(
        !fs::read(backed_up.backup.join(&note_file))
            .unwrap()
            .windows(4)
            .any(|window| window == b"4821")
    );
}

#[test]
fn a_backup_is_never_restored_over_a_section_or_from_a_folder_without_a_vault() {
    let backed_up = backed_up();
    backed_up.restored.restore_from(&backed_up.backup).unwrap();
    let empty = backed_up.backup.parent().unwrap().join("empty");
    fs::create_dir(&empty).unwrap();
    let elsewhere = SectionFolder::new(empty.join("protected"));

    assert_eq!(
        backed_up.restored.restore_from(&backed_up.backup).err(),
        Some(ProtectedError::AlreadySetUp)
    );
    assert_eq!(
        elsewhere.restore_from(&empty).err(),
        Some(ProtectedError::NotSetUp)
    );
    assert!(!elsewhere.as_ref().exists());
}

#[test]
fn a_section_that_appears_while_a_backup_is_restored_is_kept() {
    let backed_up = backed_up();
    let target = backed_up.restored.as_ref().to_path_buf();

    let restored = backed_up.restored.restore_from_with(
        &backed_up.backup,
        || {
            fs::create_dir_all(target.join(NOTES_FOLDER)).unwrap();
            fs::write(target.join(VAULT_FILE_NAME), b"a section set up meanwhile").unwrap();
        },
        &|from, to| fs::rename(from, to),
    );

    assert_eq!(restored.err(), Some(ProtectedError::AlreadySetUp));
    assert_eq!(
        fs::read(target.join(VAULT_FILE_NAME)).unwrap(),
        b"a section set up meanwhile"
    );
    assert_eq!(entries_beside(&backed_up.restored), ["protected"]);
}

#[test]
fn a_folder_in_the_way_of_a_restore_is_set_aside_not_deleted() {
    let backed_up = backed_up();
    let target = backed_up.restored.as_ref().to_path_buf();
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("left here.txt"), b"kept").unwrap();

    backed_up.restored.restore_from(&backed_up.backup).unwrap();
    let aside = target.with_file_name("protected.replaced-1");

    assert_eq!(fs::read(aside.join("left here.txt")).unwrap(), b"kept");
    assert!(UnlockedSection::unlock_with_password(&backed_up.restored, PASSWORD).is_ok());
}

#[test]
fn a_backup_with_a_hard_linked_file_or_a_vault_too_large_to_be_one_is_refused() {
    let backed_up = backed_up();
    let note_file = backed_up
        .backup
        .join(NOTES_FOLDER)
        .join(format!("{}.mdxp", backed_up.note_id));
    fs::hard_link(&note_file, backed_up.backup.join("elsewhere.mdxp")).unwrap();

    let hard_linked = backed_up.restored.restore_from(&backed_up.backup);
    fs::remove_file(backed_up.backup.join("elsewhere.mdxp")).unwrap();
    fs::write(
        backed_up.backup.join(VAULT_FILE_NAME),
        vec![b' '; 1024 * 1024],
    )
    .unwrap();
    let too_large = backed_up.restored.restore_from(&backed_up.backup);

    assert_eq!(hard_linked.err(), Some(ProtectedError::Tampered));
    assert_eq!(too_large.err(), Some(ProtectedError::TooLarge));
    assert!(!backed_up.restored.as_ref().exists());
}

#[test]
fn a_backup_reached_through_a_symbolic_link_is_refused() {
    let backed_up = backed_up();
    let link = backed_up.backup.with_file_name("linked backup");
    // Creating a symbolic link needs Developer Mode or an administrator on Windows; without it the
    // link cannot exist, so there is nothing to refuse.
    if std::os::windows::fs::symlink_dir(&backed_up.backup, &link).is_err() {
        return;
    }

    let restored = backed_up.restored.restore_from(&link);

    assert_eq!(restored.err(), Some(ProtectedError::Tampered));
}

#[test]
fn a_copy_needs_twice_its_size_free() {
    assert!(has_room(10, 20));
    assert!(!has_room(10, 19));
    assert!(!has_room(u64::MAX, u64::MAX));
}

#[test]
fn a_folder_set_aside_goes_back_when_the_restored_one_cannot_take_its_place() {
    let backed_up = backed_up();
    let target = backed_up.restored.as_ref().to_path_buf();
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("left here.txt"), b"kept").unwrap();

    let restored = backed_up
        .restored
        .restore_from_with(&backed_up.backup, || {}, &|from, to| {
            if from
                .file_name()
                .unwrap()
                .to_string_lossy()
                .contains(".restoring-")
            {
                return Err(std::io::ErrorKind::PermissionDenied.into());
            }
            fs::rename(from, to)
        });

    assert_eq!(restored.err(), Some(ProtectedError::Storage));
    assert_eq!(fs::read(target.join("left here.txt")).unwrap(), b"kept");
    assert_eq!(entries_beside(&backed_up.restored), ["protected"]);
}
