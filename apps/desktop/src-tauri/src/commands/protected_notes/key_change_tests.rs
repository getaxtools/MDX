use std::path::Path;

use super::*;
use crate::secrets::InMemoryDeviceSecrets;

const OLD_PASSWORD: &str = "correct horse battery";
const NEW_PASSWORD: &str = "staple tuna lighthouse";
const QUICK: KdfParameters = KdfParameters::FLOOR;

/// One PC: its own secret store and its own records of what it saw, over a shared notes folder.
fn pc(notes_folder: &Path, name: &str) -> ProtectedNotes {
    ProtectedNotes::new(
        Box::new(InMemoryDeviceSecrets::default()),
        notes_folder.join(format!("records-of-{name}.json")),
    )
}

fn new_note(title: &str) -> NewProtectedNote {
    NewProtectedNote {
        title: title.to_owned(),
        folder: String::new(),
    }
}

fn edit(note_id: &str, text: &str) -> ProtectedNoteEdit {
    ProtectedNoteEdit {
        note_id: note_id.to_owned(),
        text: text.to_owned(),
        encoding: "utf-8".to_owned(),
        has_byte_order_mark: false,
    }
}

fn change(current: &str, new: &str, reencrypt: bool) -> PasswordChange {
    PasswordChange {
        current_password: Zeroizing::new(current.to_owned()),
        new_password: Zeroizing::new(new.to_owned()),
        reencrypt,
    }
}

fn recovery(recovery_key: &str, new_password: &str) -> RecoveryUnlock {
    RecoveryUnlock {
        recovery_key: Zeroizing::new(recovery_key.to_owned()),
        new_password: Zeroizing::new(new_password.to_owned()),
    }
}

/// A set-up section with notes saved, unlocked on the first PC.
fn section_with_notes(
    count: usize,
) -> (
    tempfile::TempDir,
    SectionPlace,
    ProtectedNotes,
    Vec<String>,
    String,
) {
    let notes_folder = tempfile::tempdir().unwrap();
    let place = section_place_of(notes_folder.path());
    let first_pc = pc(notes_folder.path(), "first");
    let recovery_key = first_pc
        .set_up(&place, OLD_PASSWORD, QUICK)
        .unwrap()
        .recovery_key;
    let notes = (0..count)
        .map(|index| {
            let note = first_pc
                .create(&place, &new_note(&format!("Note {index}")), 1)
                .unwrap();
            first_pc
                .save(&place, &edit(&note, &format!("text {index}")), 2)
                .unwrap();
            note
        })
        .collect();
    (notes_folder, place, first_pc, notes, recovery_key)
}

fn assert_notes_open(pc: &ProtectedNotes, place: &SectionPlace, notes: &[String]) {
    for (index, note) in notes.iter().enumerate() {
        assert_eq!(pc.open(place, note).unwrap().text, format!("text {index}"));
    }
}

#[test]
fn change_password_old_password_fails_notes_open_and_another_pc_must_use_the_password() {
    let (folder, place, first_pc, notes, _recovery) = section_with_notes(2);
    let second_pc = pc(folder.path(), "second");
    let _ = first_pc.lock(&place);
    first_pc.unlock(&place, OLD_PASSWORD, true).unwrap();
    second_pc.unlock(&place, OLD_PASSWORD, true).unwrap();
    let _ = second_pc.lock(&place);

    let answer = first_pc
        .change_password(&place, &change(OLD_PASSWORD, NEW_PASSWORD, false), QUICK)
        .unwrap();
    let _ = first_pc.lock(&place);

    assert!(answer.recovery_key.is_none());
    assert_eq!(
        second_pc.unlock_on_this_pc(&place).err(),
        Some(ProtectedCommandError::WrongPassword)
    );
    assert_eq!(
        first_pc.unlock(&place, OLD_PASSWORD, false).err(),
        Some(ProtectedCommandError::WrongPassword)
    );
    let reopened = first_pc.unlock_on_this_pc(&place).unwrap();
    assert_eq!(reopened.folder_warning, None);
    assert_notes_open(&first_pc, &place, &notes);
    let _ = first_pc.lock(&place);
    assert!(first_pc.unlock(&place, NEW_PASSWORD, false).is_ok());
}

#[test]
fn remembering_a_second_pc_keeps_the_first_and_forgetting_one_keeps_the_other() {
    let (folder, place, first_pc, _notes, _recovery) = section_with_notes(1);
    let second_pc = pc(folder.path(), "second");
    let _ = first_pc.lock(&place);
    first_pc.unlock(&place, OLD_PASSWORD, true).unwrap();
    second_pc.unlock(&place, OLD_PASSWORD, true).unwrap();
    let _ = first_pc.lock(&place);

    let first_while_both = first_pc.unlock_on_this_pc(&place).map(|_| ());
    second_pc.forget_this_pc(&place).unwrap();
    let _ = first_pc.lock(&place);
    let _ = second_pc.lock(&place);

    assert_eq!(first_while_both, Ok(()));
    assert!(first_pc.unlock_on_this_pc(&place).is_ok());
    assert_eq!(
        second_pc.unlock_on_this_pc(&place).err(),
        Some(ProtectedCommandError::NotRemembered)
    );
}

#[test]
fn a_wrong_current_password_changes_nothing() {
    let (_folder, place, first_pc, _notes, _recovery) = section_with_notes(1);

    let refused = first_pc.change_password(
        &place,
        &change("not the password", NEW_PASSWORD, false),
        QUICK,
    );
    let refused_reencryption = first_pc.change_password(
        &place,
        &change("not the password", NEW_PASSWORD, true),
        QUICK,
    );
    let refused_recovery_key = first_pc.new_recovery_key(&place, "not the password");
    let _ = first_pc.lock(&place);

    assert_eq!(refused.err(), Some(ProtectedCommandError::WrongPassword));
    assert_eq!(
        refused_reencryption.err(),
        Some(ProtectedCommandError::WrongPassword)
    );
    assert_eq!(
        refused_recovery_key.err(),
        Some(ProtectedCommandError::WrongPassword)
    );
    assert!(first_pc.unlock(&place, OLD_PASSWORD, false).is_ok());
    assert!(!first_pc.status(&place).is_reencrypting);
}

#[test]
fn a_password_change_stopped_halfway_is_finished_on_the_next_unlock() {
    let (_folder, place, first_pc, notes, _recovery) = section_with_notes(1);
    first_pc
        .with_section(&place, |section| {
            Ok(section.add_password_slot(NEW_PASSWORD, QUICK)?)
        })
        .unwrap();
    let _ = first_pc.lock(&place);

    first_pc.unlock(&place, NEW_PASSWORD, false).unwrap();
    let slots_after_unlock = first_pc
        .with_section(&place, |section| Ok(section.password_slot_count()))
        .unwrap();
    let _ = first_pc.lock(&place);

    assert_eq!(slots_after_unlock, 1);
    assert_eq!(
        first_pc.unlock(&place, OLD_PASSWORD, false).err(),
        Some(ProtectedCommandError::WrongPassword)
    );
    assert!(first_pc.unlock(&place, NEW_PASSWORD, false).is_ok());
    assert_notes_open(&first_pc, &place, &notes);
}

/// Calls the re-encryption until it reports no file left, as the window does in the background.
fn reencrypt_to_the_end(pc: &ProtectedNotes, place: &SectionPlace) -> ReencryptionProgress {
    let mut progress = pc.continue_reencryption(place).unwrap();
    while progress.remaining > 0 {
        progress = pc.continue_reencryption(place).unwrap();
    }
    progress
}

/// Whether a recovery key still unlocks the section, setting a new password when it does.
fn does_recovery_key_unlock(pc: &ProtectedNotes, place: &SectionPlace, recovery_key: &str) -> bool {
    pc.unlock_with_recovery(
        place,
        &recovery(recovery_key, "a third password here"),
        QUICK,
    )
    .is_ok()
}

#[test]
fn a_re_encryption_stopped_by_a_quit_resumes_after_unlocking_and_every_note_opens() {
    let note_count = REENCRYPTION_BATCH * 2 + 3;
    let (folder, place, first_pc, notes, old_recovery) = section_with_notes(note_count);

    let answer = first_pc
        .change_password(&place, &change(OLD_PASSWORD, NEW_PASSWORD, true), QUICK)
        .unwrap();
    let first_batch = first_pc.continue_reencryption(&place).unwrap();
    drop(first_pc);
    let restarted = pc(folder.path(), "first");
    let status_after_restart = restarted.status(&place);
    let unlocked = restarted.unlock(&place, NEW_PASSWORD, false).unwrap();
    let progress = reencrypt_to_the_end(&restarted, &place);
    assert_notes_open(&restarted, &place, &notes);
    let _ = restarted.lock(&place);

    let new_recovery = answer.recovery_key.unwrap();
    assert_eq!(first_batch.remaining, note_count - REENCRYPTION_BATCH);
    assert!(status_after_restart.is_reencrypting && !status_after_restart.is_unlocked);
    assert_eq!(unlocked.folder_warning, None);
    assert_eq!((progress.remaining, progress.damaged), (0, 0));
    assert!(!restarted.status(&place).is_reencrypting);
    assert!(restarted.unlock(&place, OLD_PASSWORD, false).is_err());
    assert!(!does_recovery_key_unlock(&restarted, &place, &old_recovery));
    assert!(does_recovery_key_unlock(&restarted, &place, &new_recovery));
}

#[test]
fn a_plain_password_change_waits_for_an_unfinished_re_encryption() {
    let (_folder, place, first_pc, _notes, _recovery) = section_with_notes(1);
    first_pc
        .change_password(&place, &change(OLD_PASSWORD, NEW_PASSWORD, true), QUICK)
        .unwrap();

    let plain = first_pc.change_password(
        &place,
        &change(NEW_PASSWORD, "a third password here", false),
        QUICK,
    );
    let second = first_pc.change_password(
        &place,
        &change(NEW_PASSWORD, "a third password here", true),
        QUICK,
    );

    assert_eq!(
        plain.err(),
        Some(ProtectedCommandError::ReencryptionPending)
    );
    assert_eq!(
        second.err(),
        Some(ProtectedCommandError::ReencryptionPending)
    );
}

#[test]
fn recover_with_the_recovery_key_sets_a_new_password_and_a_new_recovery_key_replaces_the_old() {
    let (_folder, place, first_pc, notes, old_recovery) = section_with_notes(1);
    let _ = first_pc.lock(&place);

    first_pc
        .unlock_with_recovery(&place, &recovery(&old_recovery, NEW_PASSWORD), QUICK)
        .unwrap();
    let new_recovery = first_pc
        .new_recovery_key(&place, NEW_PASSWORD)
        .unwrap()
        .recovery_key;
    assert_notes_open(&first_pc, &place, &notes);
    let _ = first_pc.lock(&place);

    assert_eq!(
        first_pc.unlock(&place, OLD_PASSWORD, false).err(),
        Some(ProtectedCommandError::WrongPassword)
    );
    assert_eq!(
        first_pc
            .unlock_with_recovery(
                &place,
                &recovery(&old_recovery, "a third password here"),
                QUICK
            )
            .err(),
        Some(ProtectedCommandError::WrongPassword)
    );
    assert!(
        first_pc
            .unlock_with_recovery(
                &place,
                &recovery(&new_recovery, "a third password here"),
                QUICK
            )
            .is_ok()
    );
}

#[test]
fn changes_wait_while_a_folder_warning_is_not_answered() {
    let (folder, place, first_pc, _notes, _recovery) = section_with_notes(1);
    let second_pc = pc(folder.path(), "second");
    second_pc.unlock(&place, OLD_PASSWORD, false).unwrap();
    let _ = second_pc.lock(&place);
    first_pc
        .change_password(&place, &change(OLD_PASSWORD, NEW_PASSWORD, false), QUICK)
        .unwrap();

    let warned = second_pc.unlock(&place, NEW_PASSWORD, false).unwrap();
    let refused = second_pc.change_password(
        &place,
        &change(NEW_PASSWORD, "a third password here", false),
        QUICK,
    );
    second_pc.accept_folder(&place).unwrap();
    let accepted = second_pc.change_password(
        &place,
        &change(NEW_PASSWORD, "a third password here", false),
        QUICK,
    );

    assert_eq!(warned.folder_warning, Some(FolderWarning::ChangedVault));
    assert_eq!(refused.err(), Some(ProtectedCommandError::InvalidRequest));
    assert!(accepted.is_ok());
}
