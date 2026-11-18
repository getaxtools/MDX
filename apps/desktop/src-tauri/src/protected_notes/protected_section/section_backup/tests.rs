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
    assert!(!backed_up.restored.restoring_folder().exists());
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
