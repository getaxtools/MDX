//! Changing what unlocks a section: a new password, a new recovery key, and a re-encryption of every
//! file with a new data key. Every change is written with the vault file's atomic replace, so a stop
//! at any point leaves a vault that opens with the old or the new keys.

use std::fs;
use std::io::Read;
use std::path::Path;

use zeroize::Zeroizing;

use super::UnlockedSection;
use crate::documents::write_bytes_atomically;
use crate::protected_notes::encrypted_file::{
    ExpectedFile, FileHeader, HEADER_BYTES, open_file, seal_file,
};
use crate::protected_notes::hex_text::hex_of;
use crate::protected_notes::key_derivation::{KdfParameters, derive_password_key};
use crate::protected_notes::key_slots::{
    DataKey, SlotKind, is_same_in_constant_time, is_slot_for_key, wrap_data_key,
};
use crate::protected_notes::random::{random_bytes, random_key};
use crate::protected_notes::vault_file::Vault;
use crate::protected_notes::{KEY_BYTES, ProtectedError};

/// How far a re-encryption has got.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Reencryption {
    /// Files still sealed with the key being replaced; none once the re-encryption is over.
    pub remaining: usize,
    /// Files that no longer open with that key, left as they were: they were unreadable already.
    pub damaged: usize,
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

    /// A password slot for this section's data key, with a new salt and the settings given, which are
    /// measured anew for every change and never taken from the slot being replaced.
    fn new_password_slot(
        &self,
        password: &str,
        parameters: KdfParameters,
        data_key: &DataKey,
    ) -> Result<crate::protected_notes::KeySlot, ProtectedError> {
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
        slots.push(slot);
        self.write_vault(Vault {
            vault_id: self.vault.vault_id,
            slots,
        })
    }

    /// Second step of a password change, also run on unlock after a change that stopped halfway: every
    /// password slot but the newest is removed, and every device slot but this PC's, so other PCs need
    /// the new password. Returns whether the vault changed.
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
        self.vault
            .slots
            .iter()
            .any(|slot| slot.kind == SlotKind::PreviousKey)
    }

    /// Starts a re-encryption with a new data key and a new password. One vault write replaces every
    /// slot: the new password's, a new recovery key's, this PC's device slot when it is remembered,
    /// and the previous key wrapped by the new one. The old password, the old recovery key and other
    /// PCs no longer open the section from then on. Returns the new recovery key to show once.
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
        let vault_id = self.vault.vault_id;
        let mut slots = vec![
            self.new_password_slot(password, parameters, &new_key)?,
            wrap_data_key(&new_key, &recovery_key, &vault_id, SlotKind::Recovery)?,
        ];
        if let Some(device_key) = self.remembered_device_key(this_pc_key) {
            slots.push(wrap_data_key(
                &new_key,
                device_key,
                &vault_id,
                SlotKind::Device,
            )?);
        }
        slots.push(wrap_data_key(
            &self.data_key,
            new_key.bytes(),
            &vault_id,
            SlotKind::PreviousKey,
        )?);
        self.write_vault(Vault { vault_id, slots })?;
        let previous_key = std::mem::replace(&mut self.data_key, new_key);
        self.previous_key = Some(previous_key);
        self.damaged_during_reencryption.clear();
        // From here the manifest, sealed with the new key, says which files sealed with the previous
        // key are notes. Should this write fail, the next step writes it before anything else; the
        // new recovery key is returned either way, as the vault already holds it.
        let _ = self.write_manifest();
        Ok(recovery_key)
    }

    /// This PC's device key, when the vault has a device slot for it.
    fn remembered_device_key<'key>(
        &self,
        this_pc_key: Option<&'key [u8; KEY_BYTES]>,
    ) -> Option<&'key [u8; KEY_BYTES]> {
        this_pc_key.filter(|key| {
            self.vault
                .slots
                .iter()
                .any(|slot| slot.kind == SlotKind::Device && is_slot_for_key(slot, key))
        })
    }

    /// Re-encrypts up to `batch` of the notes the manifest lists that are still sealed with the
    /// previous key. Once none is left, the previous-key slot is removed and the re-encryption is
    /// over. Each file is replaced atomically and named by its own header, so a stop anywhere resumes
    /// where it was. Only the manifest says which files are notes, so files put in the folder by
    /// anyone else are never sealed again or waited for. A note that no longer opens with the previous
    /// key, or is not the revision the manifest lists, is left as it was; one that cannot be read is
    /// an error, so the key is not dropped while a note is only out of reach.
    pub fn continue_reencryption(&mut self, batch: usize) -> Result<Reencryption, ProtectedError> {
        let Some(previous_id) = self.previous_key.as_ref().map(|key| key.id) else {
            self.end_reencryption()?;
            return Ok(Reencryption {
                remaining: 0,
                damaged: 0,
            });
        };
        if self.sealed_key_id(&self.folder.manifest_path())? != Some(self.data_key.id) {
            self.write_manifest()?;
        }
        let pending = self.notes_sealed_with(previous_id)?;
        for note_id in pending.iter().take(batch) {
            self.reseal(note_id)?;
        }
        let remaining = pending.len().saturating_sub(batch);
        if remaining == 0 {
            self.end_reencryption()?;
        }
        Ok(Reencryption {
            remaining,
            damaged: self.damaged_during_reencryption.len(),
        })
    }

    fn write_manifest(&self) -> Result<(), ProtectedError> {
        let sealed = self.manifest.seal(&self.vault.vault_id, &self.data_key)?;
        write_bytes_atomically(&self.folder.manifest_path(), &sealed)
            .map_err(|_| ProtectedError::Storage)
    }

    /// The previous-key slot goes, and the previous key with it.
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

    /// The notes the manifest lists whose file is still sealed with this key, except those found
    /// damaged in this session. Something other than a file in a note's place counts as damaged.
    fn notes_sealed_with(&mut self, key_id: u32) -> Result<Vec<String>, ProtectedError> {
        let mut pending = Vec::new();
        let note_ids: Vec<String> = self
            .manifest
            .entries
            .iter()
            .map(|entry| hex_of(&entry.note_id))
            .collect();
        for note_id in note_ids {
            if self.damaged_during_reencryption.contains(&note_id) {
                continue;
            }
            let path = self.folder.note_path(&note_id);
            if path.exists() && !path.is_file() {
                self.damaged_during_reencryption.insert(note_id);
            } else if self.sealed_key_id(&path)? == Some(key_id) {
                pending.push(note_id);
            }
        }
        pending.sort();
        Ok(pending)
    }

    /// One note sealed again with the current key: same note id, revision, metadata and bytes. Only
    /// the revision the manifest lists is sealed again, so a file put in its place with the previous
    /// key by someone who knows it is not carried over.
    fn reseal(&mut self, note_id: &str) -> Result<(), ProtectedError> {
        let path = self.folder.note_path(note_id);
        let bytes = fs::read(&path).map_err(|_| ProtectedError::Storage)?;
        let entry = self.entry(note_id)?;
        let (listed_id, listed_revision) = (entry.note_id, entry.revision);
        let Some(previous_key) = &self.previous_key else {
            return Ok(());
        };
        let opened = match open_file(
            &bytes,
            previous_key,
            &self.vault.vault_id,
            &ExpectedFile::note(listed_id),
        ) {
            Ok(opened) if opened.header.revision == listed_revision => opened,
            Ok(_) | Err(ProtectedError::Tampered | ProtectedError::WrongKey) => {
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
