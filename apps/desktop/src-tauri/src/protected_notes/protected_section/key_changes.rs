//! Changing what unlocks a section: a new password, a new recovery key, and a re-encryption of every
//! file with a new data key. Every change is written with the vault file's atomic replace, so a stop
//! at any point leaves a vault that opens with the old or the new keys.

use std::fs;
use std::io::Read;
use std::path::Path;

use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

use super::{UnlockedSection, has_previous_key_slot, note_id_of_file_name};
use crate::documents::write_bytes_atomically;
use crate::protected_notes::encrypted_file::{
    ExpectedFile, FileHeader, HEADER_BYTES, open_file, seal_file,
};
use crate::protected_notes::hex_text::hex_of;
use crate::protected_notes::key_derivation::{KdfParameters, derive_password_key};
use crate::protected_notes::key_slots::{
    DataKey, KeySlot, SlotKind, is_same_in_constant_time, is_slot_for_key,
    previous_key_wrapping_key, wrap_data_key,
};
use crate::protected_notes::manifest::PreviousKeyFile;
use crate::protected_notes::random::{random_bytes, random_key};
use crate::protected_notes::vault_file::Vault;
use crate::protected_notes::{KEY_BYTES, ProtectedError};

/// How far a re-encryption has got.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Reencryption {
    /// Files still to seal again; none once every recorded file is done.
    pub remaining: usize,
    /// Recorded files that no longer open with the previous key, left as they were: they were
    /// unreadable already.
    pub damaged: usize,
    /// Files sealed with the previous key that the re-encryption did not record, or that changed since
    /// it started, such as an older copy a sync tool put back. While there are any, the previous key
    /// is kept, so the user can decide; `finish_reencryption` ends it without them.
    pub held_back: usize,
}

/// What unlocks the section after a re-encryption: a new password with its measured settings, a new
/// recovery key, and this PC's device key when it remembers the section.
pub struct NewUnlocks<'unlocks> {
    pub password: &'unlocks str,
    pub parameters: KdfParameters,
    pub recovery_key: &'unlocks [u8; KEY_BYTES],
    pub this_pc_key: Option<&'unlocks [u8; KEY_BYTES]>,
}

/// The previous-key files on disk, as a re-encryption step finds them.
struct PreviousKeyScan {
    /// Recorded notes still to seal again, by note id.
    pending: Vec<String>,
    held_back: usize,
}

fn is_password(kind: SlotKind) -> bool {
    matches!(kind, SlotKind::Password { .. })
}

impl UnlockedSection {
    /// Whether this password opens the section's current data key, asked before what unlocks it changes.
    pub fn is_current_password(&self, password: &str) -> Result<bool, ProtectedError> {
        match self.vault.unlock_with_password(password) {
            Ok(key) => Ok(key.id == self.data_key.id
                && is_same_in_constant_time(key.bytes(), self.data_key.bytes())),
            Err(ProtectedError::WrongKey) => Ok(false),
            Err(failure) => Err(failure),
        }
    }

    pub fn password_slot_count(&self) -> usize {
        self.vault
            .slots
            .iter()
            .filter(|slot| is_password(slot.kind))
            .count()
    }

    /// Whether the section was unlocked with the password of its newest password slot, the only
    /// unlock after which a password change that stopped halfway is finished: the user then knows
    /// the new password, and an old or made-up slot added after it can never push it out.
    pub fn was_opened_with_newest_password(&self) -> bool {
        let newest = self
            .vault
            .slots
            .iter()
            .rev()
            .find(|slot| is_password(slot.kind));
        newest.is_some_and(|slot| self.opened_with_password_slot == Some(slot.slot_id))
    }

    /// A password slot for a data key, with a new salt and the settings given, which are measured
    /// anew for every change and never taken from the slot being replaced.
    fn new_password_slot(
        &self,
        password: &str,
        parameters: KdfParameters,
        data_key: &DataKey,
    ) -> Result<KeySlot, ProtectedError> {
        let parameters = parameters.checked_for_writing()?;
        let salt = random_bytes()?;
        let key = derive_password_key(password, &salt, parameters)?;
        wrap_data_key(
            data_key,
            &key,
            &self.vault.vault_id,
            SlotKind::Password { parameters, salt },
        )
    }

    /// First step of a password change: the new password's slot is written beside the newest old
    /// one, so a stop before the second step leaves both passwords opening the section.
    pub fn add_password_slot(
        &mut self,
        password: &str,
        parameters: KdfParameters,
    ) -> Result<(), ProtectedError> {
        let slot = self.new_password_slot(password, parameters, &self.data_key)?;
        let newest_password = self
            .vault
            .slots
            .iter()
            .rposition(|slot| is_password(slot.kind));
        let mut slots: Vec<_> = self
            .vault
            .slots
            .iter()
            .enumerate()
            .filter(|(index, slot)| !is_password(slot.kind) || Some(*index) == newest_password)
            .map(|(_, slot)| slot.clone())
            .collect();
        let slot_id = slot.slot_id;
        slots.push(slot);
        self.write_vault(Vault {
            vault_id: self.vault.vault_id,
            slots,
        })?;
        self.opened_with_password_slot = Some(slot_id);
        Ok(())
    }

    /// Second step of a password change: every password slot but the newest is removed, and every
    /// device slot but this PC's, so other PCs need the new password. Returns whether the vault changed.
    pub fn finish_password_change(
        &mut self,
        this_pc_key: Option<&[u8; KEY_BYTES]>,
    ) -> Result<bool, ProtectedError> {
        let newest_password = self
            .vault
            .slots
            .iter()
            .rposition(|slot| is_password(slot.kind));
        let slots: Vec<_> = self
            .vault
            .slots
            .iter()
            .enumerate()
            .filter(|(index, slot)| match slot.kind {
                SlotKind::Password { .. } => Some(*index) == newest_password,
                SlotKind::Device => this_pc_key.is_some_and(|key| is_slot_for_key(slot, key)),
                SlotKind::Recovery | SlotKind::PreviousKey => true,
            })
            .map(|(_, slot)| slot.clone())
            .collect();
        if slots.len() == self.vault.slots.len() {
            return Ok(false);
        }
        self.write_vault(Vault {
            vault_id: self.vault.vault_id,
            slots,
        })?;
        Ok(true)
    }

    /// A new recovery key in place of the old one, in one write; returns the key to show once.
    pub fn replace_recovery_key(&mut self) -> Result<Zeroizing<[u8; KEY_BYTES]>, ProtectedError> {
        let recovery_key = random_key()?;
        let slot = wrap_data_key(
            &self.data_key,
            &recovery_key,
            &self.vault.vault_id,
            SlotKind::Recovery,
        )?;
        let mut slots: Vec<_> = self
            .vault
            .slots
            .iter()
            .filter(|slot| slot.kind != SlotKind::Recovery)
            .cloned()
            .collect();
        slots.push(slot);
        self.write_vault(Vault {
            vault_id: self.vault.vault_id,
            slots,
        })?;
        Ok(recovery_key)
    }

    pub fn is_reencrypting(&self) -> bool {
        has_previous_key_slot(&self.vault)
    }

    /// The slots after a re-encryption starts: the new password's, the new recovery key's, this PC's
    /// device slot when the vault has one for its key, and the previous data key, wrapped with a key
    /// derived from the new one.
    fn slots_for_new_key(
        &self,
        new_key: &DataKey,
        unlocks: &NewUnlocks<'_>,
    ) -> Result<Vec<KeySlot>, ProtectedError> {
        let vault_id = self.vault.vault_id;
        let mut slots = vec![
            self.new_password_slot(unlocks.password, unlocks.parameters, new_key)?,
            wrap_data_key(new_key, unlocks.recovery_key, &vault_id, SlotKind::Recovery)?,
        ];
        let remembered_key = unlocks.this_pc_key.filter(|key| {
            self.vault
                .slots
                .iter()
                .any(|slot| slot.kind == SlotKind::Device && is_slot_for_key(slot, key))
        });
        if let Some(device_key) = remembered_key {
            slots.push(wrap_data_key(
                new_key,
                device_key,
                &vault_id,
                SlotKind::Device,
            )?);
        }
        slots.push(wrap_data_key(
            &self.data_key,
            &previous_key_wrapping_key(new_key),
            &vault_id,
            SlotKind::PreviousKey,
        )?);
        Ok(slots)
    }

    /// Starts a re-encryption with a new data key. First the manifest, sealed with the new key and
    /// recording the hash of every note file to seal again, is staged; then one vault write replaces
    /// every slot, so the old password, the old recovery key and other PCs no longer open the section;
    /// then the staged manifest takes the manifest's place. A failure before the vault write changes
    /// nothing. Returns the new recovery key to show once.
    pub fn start_reencryption(
        &mut self,
        password: &str,
        parameters: KdfParameters,
        this_pc_key: Option<&[u8; KEY_BYTES]>,
    ) -> Result<Zeroizing<[u8; KEY_BYTES]>, ProtectedError> {
        if self.is_reencrypting() {
            return Err(ProtectedError::ReencryptionPending);
        }
        let next_id = self
            .data_key
            .id
            .checked_add(1)
            .ok_or(ProtectedError::TooLarge)?;
        let new_key = DataKey::generate(next_id)?;
        let recovery_key = random_key()?;
        let unlocks = NewUnlocks {
            password,
            parameters,
            recovery_key: &recovery_key,
            this_pc_key,
        };
        let slots = self.slots_for_new_key(&new_key, &unlocks)?;
        let mut manifest = self.manifest.clone();
        manifest.revision += 1;
        manifest.previous_key_files = Some(self.files_to_reencrypt()?);
        let staged_path = self.folder.staged_manifest_path();
        write_bytes_atomically(
            &staged_path,
            &manifest.seal(&self.vault.vault_id, &new_key)?,
        )
        .map_err(|_| ProtectedError::Storage)?;
        let vault_id = self.vault.vault_id;
        if let Err(failure) = self.write_vault(Vault { vault_id, slots }) {
            let _ = fs::remove_file(&staged_path);
            return Err(failure);
        }
        self.previous_key = Some(std::mem::replace(&mut self.data_key, new_key));
        self.manifest = manifest;
        self.damaged_during_reencryption.clear();
        // Should the rename fail, the next unlock puts the staged manifest in place.
        let _ = fs::rename(&staged_path, self.folder.manifest_path());
        Ok(recovery_key)
    }

    /// The note files the manifest lists at their listed revision, sealed with the current key, with
    /// the hash of their bytes. A file that is not, such as an older copy, is not recorded and will
    /// hold the previous key back for the user to decide.
    fn files_to_reencrypt(&self) -> Result<Vec<PreviousKeyFile>, ProtectedError> {
        let mut files = Vec::new();
        for entry in &self.manifest.entries {
            let bytes = match fs::read(self.folder.note_path(&hex_of(&entry.note_id))) {
                Ok(bytes) => bytes,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(_) => return Err(ProtectedError::Storage),
            };
            let is_listed_file = FileHeader::parse(&bytes).is_ok_and(|header| {
                header.data_key_id == self.data_key.id
                    && header.note_id == entry.note_id
                    && header.revision == entry.revision
            });
            if is_listed_file {
                files.push(PreviousKeyFile {
                    note_id: entry.note_id,
                    sha256: Sha256::digest(&bytes).into(),
                });
            }
        }
        Ok(files)
    }

    /// Seals up to `batch` of the recorded files again with the current key. Once none is left and
    /// no other file sealed with the previous key is there, the previous-key slot is removed and the
    /// re-encryption is over. Each file is replaced atomically, so a stop anywhere resumes where it
    /// was. The re-encryption cannot go on without a manifest that records its files, nor without a
    /// previous-key slot that opens: both are refused as damage and the slot is kept. A file that
    /// cannot be read is an error, so the key is not dropped while a note is only out of reach.
    pub fn continue_reencryption(&mut self, batch: usize) -> Result<Reencryption, ProtectedError> {
        if !self.is_reencrypting() {
            return Ok(Reencryption {
                remaining: 0,
                damaged: 0,
                held_back: 0,
            });
        }
        let previous_id = self
            .previous_key
            .as_ref()
            .map(|key| key.id)
            .ok_or(ProtectedError::Tampered)?;
        if self.manifest.previous_key_files.is_none() {
            return Err(ProtectedError::Tampered);
        }
        if self.sealed_key_id(&self.folder.manifest_path())? != Some(self.data_key.id) {
            self.write_manifest()?;
        }
        let scan = self.scan_previous_key_files(previous_id)?;
        for note_id in scan.pending.iter().take(batch) {
            self.reseal(note_id)?;
        }
        let remaining = scan.pending.len().saturating_sub(batch);
        if remaining == 0 && scan.held_back == 0 {
            self.end_reencryption()?;
        }
        Ok(Reencryption {
            remaining,
            damaged: self.damaged_during_reencryption.len(),
            held_back: scan.held_back,
        })
    }

    /// Ends a re-encryption whose recorded files are all done, leaving the held-back files sealed
    /// with the previous key, which then no longer open; or one whose previous-key slot or record is
    /// damaged. Only on the user's say, after the password is confirmed.
    pub fn finish_reencryption(&mut self) -> Result<(), ProtectedError> {
        if let Some(previous_id) = self.previous_key.as_ref().map(|key| key.id)
            && self.manifest.previous_key_files.is_some()
            && !self
                .scan_previous_key_files(previous_id)?
                .pending
                .is_empty()
        {
            return Err(ProtectedError::ReencryptionPending);
        }
        self.end_reencryption()
    }

    fn write_manifest(&self) -> Result<(), ProtectedError> {
        let sealed = self.manifest.seal(&self.vault.vault_id, &self.data_key)?;
        write_bytes_atomically(&self.folder.manifest_path(), &sealed)
            .map_err(|_| ProtectedError::Storage)
    }

    /// The previous-key slot goes, and the previous key with it; then the manifest drops its record.
    fn end_reencryption(&mut self) -> Result<(), ProtectedError> {
        if self.is_reencrypting() {
            let slots = self
                .vault
                .slots
                .iter()
                .filter(|slot| slot.kind != SlotKind::PreviousKey)
                .cloned()
                .collect();
            self.write_vault(Vault {
                vault_id: self.vault.vault_id,
                slots,
            })?;
        }
        self.previous_key = None;
        self.manifest.previous_key_files = None;
        // A record left in a manifest after the slot is gone is never read; the next save drops it.
        let _ = self.write_manifest();
        Ok(())
    }

    /// The data key id in a file's header, read from its first bytes only; `None` when it is not there.
    fn sealed_key_id(&self, path: &Path) -> Result<Option<u32>, ProtectedError> {
        let mut file = match fs::File::open(path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(ProtectedError::Storage),
        };
        let mut header = [0_u8; HEADER_BYTES];
        if file.read_exact(&mut header).is_err() {
            return Ok(None);
        }
        Ok(FileHeader::parse(&header)
            .ok()
            .map(|header| header.data_key_id))
    }

    /// Every file of the notes folder sealed with the previous key: a recorded file still as it was
    /// is pending, any other holds the key back. Something other than a file is no note and is skipped.
    fn scan_previous_key_files(&self, previous_id: u32) -> Result<PreviousKeyScan, ProtectedError> {
        let mut scan = PreviousKeyScan {
            pending: Vec::new(),
            held_back: 0,
        };
        for name in self.folder.note_file_names()? {
            let path = self.folder.notes_folder().join(&name);
            if path.is_dir() || self.sealed_key_id(&path)? != Some(previous_id) {
                continue;
            }
            let bytes = fs::read(&path).map_err(|_| ProtectedError::Storage)?;
            let recorded = note_id_of_file_name(&name).filter(|note_id| {
                super::is_recorded_previous_key_file(&self.manifest, note_id, &bytes)
            });
            match recorded {
                Some(note_id) if self.damaged_during_reencryption.contains(&hex_of(&note_id)) => {}
                Some(note_id) => scan.pending.push(hex_of(&note_id)),
                None => scan.held_back += 1,
            }
        }
        scan.pending.sort();
        Ok(scan)
    }

    /// One recorded file sealed again with the current key: same note id, revision, metadata and
    /// bytes. A recorded file that does not open was damaged before the re-encryption and stays so.
    fn reseal(&mut self, note_id: &str) -> Result<(), ProtectedError> {
        let path = self.folder.note_path(note_id);
        let bytes = fs::read(&path).map_err(|_| ProtectedError::Storage)?;
        let (Some(previous_key), Ok(id)) = (&self.previous_key, super::bytes_of_hex(note_id))
        else {
            return Ok(());
        };
        let opened = match open_file(
            &bytes,
            previous_key,
            &self.vault.vault_id,
            &ExpectedFile::note(id),
        ) {
            Ok(opened) => opened,
            Err(ProtectedError::Tampered | ProtectedError::WrongKey) => {
                self.damaged_during_reencryption.insert(note_id.to_owned());
                return Ok(());
            }
            Err(failure) => return Err(failure),
        };
        let header = FileHeader {
            data_key_id: self.data_key.id,
            ..opened.header
        };
        let sealed = seal_file(&header, &opened.metadata, &opened.content, &self.data_key)?;
        write_bytes_atomically(&path, &sealed).map_err(|_| ProtectedError::Storage)
    }
}

#[cfg(test)]
mod tests;
