use std::path::Path;

use super::*;
use crate::protected_notes::SectionFolder;
use crate::protected_notes::hex_text::hex_of;
use crate::protected_notes::protected_section::note_id_of_file_name;
use crate::secrets::{DeviceSecretStore, InMemoryDeviceSecrets, SecretName};

const OLD_PASSWORD: &str = "correct horse battery";
const NEW_PASSWORD: &str = "staple tuna lighthouse";
const QUICK: KdfParameters = KdfParameters::FLOOR;
/// Above the floor, so a slot written with it is told apart from one written with the floor.
const MEASURED: KdfParameters = KdfParameters {
    memory_kib: 20 * 1_024,
    iterations: 2,
    parallelism: 1,
};

struct Section {
    _root: tempfile::TempDir,
    folder: SectionFolder,
    section: UnlockedSection,
    recovery_key: Zeroizing<[u8; KEY_BYTES]>,
    notes: Vec<(String, Vec<u8>)>,
}

/// A section with three saved notes, one with a byte order mark and CRLF line breaks.
fn section_with_notes() -> Section {
    let root = tempfile::tempdir().unwrap();
    let folder = SectionFolder::new(root.path().join("protected"));
    let (mut section, recovery_key) = folder.set_up(OLD_PASSWORD, QUICK).unwrap();
    let texts: [&[u8]; 3] = [b"\xEF\xBB\xBFPIN 4821\r\n", b"plain", b"third note"];
    let notes = texts
        .iter()
        .enumerate()
        .map(|(index, text)| {
            let note = section.create(&format!("Note {index}"), "", 1).unwrap();
            section.save(&note, text, 2).unwrap();
            (note, text.to_vec())
        })
        .collect();
    Section {
        _root: root,
        folder,
        section,
        recovery_key,
        notes,
    }
}

fn device_key_of(store: &InMemoryDeviceSecrets, section: &UnlockedSection) -> [u8; KEY_BYTES] {
    let secret = store
        .load(&SecretName::for_vault(&section.vault_id()))
        .unwrap()
        .unwrap();
    secret.as_slice().try_into().unwrap()
}

fn assert_notes_open(section: &UnlockedSection, notes: &[(String, Vec<u8>)]) {
    for (note, text) in notes {
        assert_eq!(
            section.open(note).unwrap().bytes.as_slice(),
            text.as_slice()
        );
    }
}

fn header_key_ids(notes_folder: &Path) -> Vec<u32> {
    let mut ids: Vec<u32> = fs::read_dir(notes_folder)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().ends_with(".mdxp"))
        .map(|entry| {
            FileHeader::parse(&fs::read(entry.path()).unwrap())
                .unwrap()
                .data_key_id
        })
        .collect();
    ids.sort_unstable();
    ids
}

fn password_parameters(vault: &Vault) -> Vec<KdfParameters> {
    vault
        .slots
        .iter()
        .filter_map(|slot| match slot.kind {
            SlotKind::Password { parameters, .. } => Some(parameters),
            _ => None,
        })
        .collect()
}

/// A device slot for another PC, made with a key only that PC would hold; returns that key.
fn add_other_pc_slot(section: &mut UnlockedSection) -> Zeroizing<[u8; KEY_BYTES]> {
    let other_pc_key = random_key().unwrap();
    let slot = wrap_data_key(
        &section.data_key,
        &other_pc_key,
        &section.vault.vault_id,
        SlotKind::Device,
    )
    .unwrap();
    let mut vault = section.vault.clone();
    vault.slots.push(slot);
    section.write_vault(vault).unwrap();
    other_pc_key
}

/// Which of these keys open the vault from the file, in the order given.
fn opening_keys(folder: &SectionFolder, keys: &[(SlotKind, &[u8; KEY_BYTES])]) -> Vec<bool> {
    let vault = folder.read_vault().unwrap();
    keys.iter()
        .map(|(kind, key)| vault.unlock_with_key(*kind, key).is_ok())
        .collect()
}

/// Whether any note file still opens with this key.
fn any_note_opens_with(folder: &SectionFolder, notes: &[(String, Vec<u8>)], key: &DataKey) -> bool {
    let vault_id = folder.read_vault().unwrap().vault_id;
    notes.iter().any(|(note, _)| {
        let bytes = fs::read(folder.note_path(note)).unwrap();
        let note_id = note_id_of_file_name(&format!("{note}.mdxp")).unwrap();
        open_file(&bytes, key, &vault_id, &ExpectedFile::note(note_id)).is_ok()
    })
}

fn start_reencryption(opened: &mut Section) {
    opened
        .section
        .start_reencryption(NEW_PASSWORD, QUICK, None)
        .unwrap();
}

#[test]
fn change_password_old_password_fails_notes_open_and_other_device_slots_are_gone() {
    let mut opened = section_with_notes();
    let store = InMemoryDeviceSecrets::default();
    opened.section.remember_on_this_pc(&store).unwrap();
    let this_pc_key = device_key_of(&store, &opened.section);
    let other_pc_key = add_other_pc_slot(&mut opened.section);

    opened
        .section
        .add_password_slot(NEW_PASSWORD, QUICK)
        .unwrap();
    let halfway = opened.folder.read_vault().unwrap();
    opened
        .section
        .finish_password_change(Some(&this_pc_key))
        .unwrap();
    drop(opened.section);

    assert!(halfway.unlock_with_password(OLD_PASSWORD).is_ok());
    assert!(halfway.unlock_with_password(NEW_PASSWORD).is_ok());
    assert_eq!(
        UnlockedSection::unlock_with_password(&opened.folder, OLD_PASSWORD).err(),
        Some(ProtectedError::WrongKey)
    );
    let reopened = UnlockedSection::unlock_with_password(&opened.folder, NEW_PASSWORD).unwrap();
    assert_notes_open(&reopened, &opened.notes);
    let keys = [
        (SlotKind::Device, &this_pc_key),
        (SlotKind::Device, &*other_pc_key),
        (SlotKind::Recovery, &*opened.recovery_key),
    ];
    assert_eq!(opening_keys(&opened.folder, &keys), vec![true, false, true]);
}

#[test]
fn the_new_password_slot_uses_the_settings_given_never_those_of_the_slot_it_replaces() {
    let mut opened = section_with_notes();
    let weak = KdfParameters {
        memory_kib: 8 * 1_024,
        iterations: 1,
        parallelism: 1,
    };

    let refused = opened.section.add_password_slot(NEW_PASSWORD, weak);
    let unchanged = opened.folder.read_vault().unwrap();
    opened
        .section
        .add_password_slot(NEW_PASSWORD, MEASURED)
        .unwrap();
    opened.section.finish_password_change(None).unwrap();

    assert_eq!(refused, Err(ProtectedError::WeakKeyDerivation));
    assert_eq!(password_parameters(&unchanged), vec![QUICK]);
    assert_eq!(
        password_parameters(&opened.folder.read_vault().unwrap()),
        vec![MEASURED]
    );
}

#[test]
fn a_change_stopped_after_its_first_step_is_finished_later_and_never_holds_more_than_two() {
    let mut opened = section_with_notes();

    opened
        .section
        .add_password_slot("first new password", QUICK)
        .unwrap();
    opened
        .section
        .add_password_slot(NEW_PASSWORD, QUICK)
        .unwrap();
    let count_while_stopped = opened.section.password_slot_count();
    let did_change = opened.section.finish_password_change(None).unwrap();
    let did_change_again = opened.section.finish_password_change(None).unwrap();

    assert_eq!(count_while_stopped, 2);
    assert!(did_change);
    assert!(!did_change_again);
    let vault = opened.folder.read_vault().unwrap();
    assert!(vault.unlock_with_password(NEW_PASSWORD).is_ok());
    for old in ["first new password", OLD_PASSWORD] {
        assert_eq!(
            vault.unlock_with_password(old).err(),
            Some(ProtectedError::WrongKey)
        );
    }
}

#[test]
fn is_current_password_tells_the_password_apart() {
    let opened = section_with_notes();

    assert_eq!(opened.section.is_current_password(OLD_PASSWORD), Ok(true));
    assert_eq!(
        opened.section.is_current_password("not the password"),
        Ok(false)
    );
}

#[test]
fn a_new_recovery_key_opens_the_section_and_the_old_one_no_longer_does() {
    let mut opened = section_with_notes();

    let new_recovery_key = opened.section.replace_recovery_key().unwrap();

    let vault = opened.folder.read_vault().unwrap();
    assert_eq!(
        vault
            .unlock_with_key(SlotKind::Recovery, &opened.recovery_key)
            .err(),
        Some(ProtectedError::WrongKey)
    );
    assert!(
        vault
            .unlock_with_key(SlotKind::Recovery, &new_recovery_key)
            .is_ok()
    );
    assert!(vault.unlock_with_password(OLD_PASSWORD).is_ok());
}

#[test]
fn a_finished_re_encryption_leaves_every_note_readable_under_the_new_key_only() {
    let mut opened = section_with_notes();
    let store = InMemoryDeviceSecrets::default();
    opened.section.remember_on_this_pc(&store).unwrap();
    let this_pc_key = device_key_of(&store, &opened.section);
    let old_key = DataKey::with_bytes_for_tests(1, *opened.section.data_key.bytes());

    let new_recovery_key = opened
        .section
        .start_reencryption(NEW_PASSWORD, QUICK, Some(&this_pc_key))
        .unwrap();
    let progress = opened.section.continue_reencryption(100).unwrap();
    drop(opened.section);

    let expected_progress = Reencryption {
        remaining: 0,
        damaged: 0,
    };
    assert_eq!(progress, expected_progress);
    assert_eq!(header_key_ids(&opened.folder.notes_folder()), vec![2, 2, 2]);
    let vault = opened.folder.read_vault().unwrap();
    let is_new_key_only = vault
        .slots
        .iter()
        .all(|slot| slot.kind != SlotKind::PreviousKey && slot.data_key_id == 2);
    assert!(is_new_key_only);
    assert!(vault.unlock_with_password(OLD_PASSWORD).is_err());
    let keys = [
        (SlotKind::Recovery, &*opened.recovery_key),
        (SlotKind::Recovery, &*new_recovery_key),
        (SlotKind::Device, &this_pc_key),
    ];
    assert_eq!(opening_keys(&opened.folder, &keys), vec![false, true, true]);
    let reopened = UnlockedSection::unlock_with_password(&opened.folder, NEW_PASSWORD).unwrap();
    assert_notes_open(&reopened, &opened.notes);
    assert!(!any_note_opens_with(
        &opened.folder,
        &opened.notes,
        &old_key
    ));
}

#[test]
fn a_stopped_re_encryption_resumes_and_leaves_every_note_readable_under_the_new_key_only() {
    let mut opened = section_with_notes();
    start_reencryption(&mut opened);

    let first_batch = opened.section.continue_reencryption(1).unwrap();
    drop(opened.section);
    let notes_folder = opened.folder.notes_folder();
    let key_ids_while_stopped = header_key_ids(&notes_folder);
    let mut resumed = UnlockedSection::unlock_with_password(&opened.folder, NEW_PASSWORD).unwrap();
    assert_notes_open(&resumed, &opened.notes);
    let rest = resumed.continue_reencryption(100).unwrap();
    drop(resumed);

    assert_eq!(first_batch.remaining, 2);
    assert_eq!(key_ids_while_stopped, vec![1, 1, 2]);
    assert_eq!(rest.remaining, 0);
    assert_eq!(header_key_ids(&notes_folder), vec![2, 2, 2]);
    let reopened = UnlockedSection::unlock_with_password(&opened.folder, NEW_PASSWORD).unwrap();
    assert_notes_open(&reopened, &opened.notes);
    assert!(!reopened.is_reencrypting());
    assert_eq!(
        UnlockedSection::unlock_with_password(&opened.folder, OLD_PASSWORD).err(),
        Some(ProtectedError::WrongKey)
    );
}

#[test]
fn a_crash_right_after_the_new_keys_were_written_opens_with_the_new_password_only() {
    let mut opened = section_with_notes();
    start_reencryption(&mut opened);
    drop(opened.section);

    assert_eq!(
        UnlockedSection::unlock_with_password(&opened.folder, OLD_PASSWORD).err(),
        Some(ProtectedError::WrongKey)
    );
    let mut resumed = UnlockedSection::unlock_with_password(&opened.folder, NEW_PASSWORD).unwrap();
    assert_notes_open(&resumed, &opened.notes);
    assert_eq!(resumed.notes().len(), 3);
    assert!(resumed.is_reencrypting());
    assert_eq!(resumed.continue_reencryption(100).unwrap().remaining, 0);
    assert_notes_open(&resumed, &opened.notes);
}

#[test]
fn a_crash_after_the_manifest_was_sealed_again_resumes_with_the_notes() {
    let mut opened = section_with_notes();
    start_reencryption(&mut opened);
    opened.section.continue_reencryption(0).unwrap();
    drop(opened.section);

    let mut resumed = UnlockedSection::unlock_with_password(&opened.folder, NEW_PASSWORD).unwrap();

    assert_eq!(resumed.notes().len(), 3);
    assert_notes_open(&resumed, &opened.notes);
    assert_eq!(resumed.continue_reencryption(100).unwrap().remaining, 0);
}

#[test]
fn a_crash_while_a_file_was_being_written_leaves_its_old_copy_and_the_re_encryption_resumes() {
    let mut opened = section_with_notes();
    start_reencryption(&mut opened);
    let notes_folder = opened.folder.notes_folder();
    let (first_note, _) = &opened.notes[0];
    // The atomic write stopped before its rename: a half-written pending file beside the old copy.
    fs::write(
        notes_folder.join(format!("{first_note}.mdxp.mdx-saving")),
        b"half written",
    )
    .unwrap();
    drop(opened.section);

    let mut resumed = UnlockedSection::unlock_with_password(&opened.folder, NEW_PASSWORD).unwrap();
    let progress = resumed.continue_reencryption(100).unwrap();

    assert_eq!(
        progress,
        Reencryption {
            remaining: 0,
            damaged: 0
        }
    );
    assert_notes_open(&resumed, &opened.notes);
    assert_eq!(header_key_ids(&notes_folder), vec![2, 2, 2]);
}

#[cfg(windows)]
#[test]
fn a_note_that_cannot_be_read_stops_the_batch_and_keeps_the_previous_key() {
    use std::os::windows::fs::OpenOptionsExt;

    let mut opened = section_with_notes();
    start_reencryption(&mut opened);
    let (unreadable_note, _) = &opened.notes[1];
    // Another program holding the file without sharing it, as a sync tool can for a moment.
    let held = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(opened.folder.note_path(unreadable_note))
        .unwrap();

    let stopped = opened.section.continue_reencryption(100);
    let is_still_reencrypting = opened.section.is_reencrypting();
    drop(held);
    let resumed = opened.section.continue_reencryption(100).unwrap();

    assert_eq!(stopped.err(), Some(ProtectedError::Storage));
    assert!(is_still_reencrypting);
    assert_eq!(resumed.remaining, 0);
    assert_notes_open(&opened.section, &opened.notes);
}

#[test]
fn a_damaged_file_is_left_aside_and_the_re_encryption_still_ends() {
    let mut opened = section_with_notes();
    start_reencryption(&mut opened);
    let mut sorted_notes = opened.notes.clone();
    sorted_notes.sort();
    let (damaged_note, _) = &sorted_notes[0];
    let damaged = opened.folder.note_path(damaged_note);
    let mut bytes = fs::read(&damaged).unwrap();
    let last = bytes.len() - 1;
    bytes[last] ^= 1;
    fs::write(&damaged, bytes).unwrap();

    let first = opened.section.continue_reencryption(1).unwrap();
    let rest = opened.section.continue_reencryption(100).unwrap();

    assert_eq!(first.remaining, 2);
    assert_eq!(
        rest,
        Reencryption {
            remaining: 0,
            damaged: 1
        }
    );
    assert!(!opened.section.is_reencrypting());
    assert_notes_open(&opened.section, &sorted_notes[1..]);
}

#[test]
fn a_note_saved_during_a_re_encryption_is_sealed_with_the_new_key() {
    let mut opened = section_with_notes();
    start_reencryption(&mut opened);
    let (note, _) = opened.notes[0].clone();

    opened.section.save(&note, b"changed meanwhile", 3).unwrap();
    opened.section.continue_reencryption(100).unwrap();

    assert_eq!(
        opened.section.open(&note).unwrap().bytes.as_slice(),
        b"changed meanwhile"
    );
    assert_eq!(header_key_ids(&opened.folder.notes_folder()), vec![2, 2, 2]);
}

#[test]
fn a_second_re_encryption_waits_for_the_first() {
    let mut opened = section_with_notes();
    start_reencryption(&mut opened);

    let second = opened
        .section
        .start_reencryption("yet another password", QUICK, None);

    assert_eq!(second.err(), Some(ProtectedError::ReencryptionPending));
    assert!(
        opened
            .folder
            .read_vault()
            .unwrap()
            .unlock_with_password(NEW_PASSWORD)
            .is_ok()
    );
}

/// A note file sealed with the previous key by someone who knows it, as the section's own files are.
fn forge_with_previous_key(
    opened: &Section,
    previous_key: &DataKey,
    (note_id, revision): ([u8; 16], u64),
    text: &[u8],
) {
    let vault_id = opened.folder.read_vault().unwrap().vault_id;
    let header = FileHeader {
        vault_id,
        data_key_id: previous_key.id,
        note_id,
        revision,
    };
    let metadata = crate::protected_notes::FileMetadata {
        kind: crate::protected_notes::FileKind::Note,
        title: "Planted".to_owned(),
        folder: String::new(),
        created_ms: 1,
        modified_ms: 1,
        content_length: 0,
        file_name: None,
        media_type: None,
    };
    let sealed = seal_file(&header, &metadata, text, previous_key).unwrap();
    fs::write(opened.folder.note_path(&hex_of(&note_id)), sealed).unwrap();
}

fn previous_key_copy(opened: &Section) -> DataKey {
    let previous = opened.section.previous_key.as_ref().unwrap();
    DataKey::with_bytes_for_tests(previous.id, *previous.bytes())
}

#[test]
fn a_file_sealed_with_the_previous_key_that_the_manifest_does_not_list_is_neither_listed_nor_carried_over()
 {
    let mut opened = section_with_notes();
    start_reencryption(&mut opened);
    let previous_key = previous_key_copy(&opened);
    let planted = [0xAB; 16];
    forge_with_previous_key(&opened, &previous_key, (planted, 1), b"planted text");
    drop(opened.section);

    let mut resumed = UnlockedSection::unlock_with_password(&opened.folder, NEW_PASSWORD).unwrap();
    let listed: Vec<String> = resumed
        .notes()
        .into_iter()
        .map(|note| note.note_id)
        .collect();
    let progress = resumed.continue_reencryption(100).unwrap();

    assert_eq!(listed.len(), 3);
    assert!(!listed.contains(&hex_of(&planted)));
    assert_eq!(progress.remaining, 0);
    assert!(!resumed.is_reencrypting());
    let planted_file = fs::read(opened.folder.note_path(&hex_of(&planted))).unwrap();
    assert_eq!(
        FileHeader::parse(&planted_file).unwrap().data_key_id,
        previous_key.id
    );
    assert_notes_open(&resumed, &opened.notes);
}

#[test]
fn a_previous_key_file_at_another_revision_than_the_manifest_lists_is_refused_and_not_carried_over()
{
    let mut opened = section_with_notes();
    start_reencryption(&mut opened);
    let previous_key = previous_key_copy(&opened);
    let (replaced, _) = opened.notes[0].clone();
    let replaced_id: [u8; 16] = note_id_of_file_name(&format!("{replaced}.mdxp")).unwrap();
    forge_with_previous_key(&opened, &previous_key, (replaced_id, 9), b"replaced text");

    let refused = opened.section.open(&replaced).err();
    let progress = opened.section.continue_reencryption(100).unwrap();

    assert_eq!(refused, Some(ProtectedError::Tampered));
    assert_eq!(
        progress,
        Reencryption {
            remaining: 0,
            damaged: 1
        }
    );
    assert_eq!(
        opened.section.open(&replaced).err(),
        Some(ProtectedError::WrongKey)
    );
    assert_notes_open(&opened.section, &opened.notes[1..]);
}

#[test]
fn files_that_are_not_listed_notes_cannot_stall_a_re_encryption() {
    let mut opened = section_with_notes();
    start_reencryption(&mut opened);
    let notes_folder = opened.folder.notes_folder();
    let (listed_note, _) = &opened.notes[0];
    let old_header =
        fs::read(opened.folder.note_path(listed_note)).unwrap()[..HEADER_BYTES].to_vec();
    for name in ["zz01.mdxp", "x.MDXP", "not-a-note.mdxp"] {
        fs::write(notes_folder.join(name), &old_header).unwrap();
    }
    fs::create_dir(notes_folder.join("a.mdxp")).unwrap();
    let (displaced_note, _) = &opened.notes[1];
    fs::remove_file(opened.folder.note_path(displaced_note)).unwrap();
    fs::create_dir(opened.folder.note_path(displaced_note)).unwrap();

    let progress = opened.section.continue_reencryption(1).unwrap();
    let end = opened.section.continue_reencryption(1).unwrap();

    assert_eq!(progress.remaining, 1);
    assert_eq!(
        end,
        Reencryption {
            remaining: 0,
            damaged: 1
        }
    );
    assert!(!opened.section.is_reencrypting());
    assert_notes_open(
        &opened.section,
        &[opened.notes[0].clone(), opened.notes[2].clone()],
    );
}
