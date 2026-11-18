//! Changing what unlocks a section: a new password, a new recovery key, and a re-encryption of every
//! file with a new data key. Every change is written with the vault file's atomic replace, so a stop
//! at any point leaves a vault that opens with the old or the new keys.

use std::fs;
use std::io::Read;
use std::path::Path;

use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

use super::{UnlockedSection, has_previous_key_slot};
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
    /// Files the previous key is kept for, so the user can decide: a recorded note whose file
    /// changed since the start, is gone or is cut short, and an unrecorded file that opens with the
    /// previous key, such as an older copy a sync tool put back. When the re-encryption cannot be
    /// checked, every file whose header names the previous key. `finish_reencryption` ends it
    /// without them once given this count.
    pub held_back: usize,
    /// The manifest that records the files is lost, or the previous-key slot does not open, so which
    /// files are notes cannot be told; the user restores `manifest.mdxp` or `vault.json` from history
    /// first, or finishes, which leaves the held-back files unreadable.
    pub is_unverifiable: bool,
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
    /// Unrecorded files that do not open with the previous key; they hold nothing back.
    damaged: usize,
}

/// What became of one recorded note in a step: sealed again, found damaged, or changed after the
/// scan checked it, which holds the previous key back.
enum Resealed {
    Done,
    Damaged,
    Changed,
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
        let wrapping_key = previous_key_wrapping_key(new_key)?;
        slots.push(wrap_data_key(
            &self.data_key,
            &wrapping_key,
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
    /// nothing holds the previous key back, the previous-key slot is removed and the re-encryption is
    /// over. Each file is replaced atomically, so a stop anywhere resumes where it was. Without a
    /// manifest that records the files, or a previous-key slot that opens, nothing is sealed again:
    /// the step reports every file whose header names the previous key and keeps the slot. A file
    /// that cannot be read is an error, so the key is not dropped while a note is only out of reach.
    pub fn continue_reencryption(&mut self, batch: usize) -> Result<Reencryption, ProtectedError> {
        if !self.is_reencrypting() {
            return Ok(Reencryption {
                remaining: 0,
                damaged: 0,
                held_back: 0,
                is_unverifiable: false,
            });
        }
        let Some(previous_id) = self.verifiable_previous_key_id() else {
            return Ok(Reencryption {
                remaining: 0,
                damaged: 0,
                held_back: self.previous_key_header_count()?,
                is_unverifiable: true,
            });
        };
        if self.sealed_key_id(&self.folder.manifest_path())? != Some(self.data_key.id) {
            self.write_manifest()?;
        }
        let scan = self.scan_previous_key_files(previous_id)?;
        let mut changed = 0;
        for note_id in scan.pending.iter().take(batch) {
            if matches!(self.reseal(note_id)?, Resealed::Changed) {
                changed += 1;
            }
        }
        let remaining = scan.pending.len().saturating_sub(batch);
        let held_back = scan.held_back + changed;
        if remaining == 0 && held_back == 0 {
            self.end_reencryption()?;
        }
        Ok(Reencryption {
            remaining,
            damaged: scan.damaged + self.damaged_during_reencryption.len(),
            held_back,
            is_unverifiable: false,
        })
    }

    /// The previous key's id, when its slot opens and the manifest records the files to seal again.
    fn verifiable_previous_key_id(&self) -> Option<u32> {
        let previous_id = self.previous_key.as_ref()?.id;
        self.manifest.previous_key_files.as_ref()?;
        Some(previous_id)
    }

    /// Ends a re-encryption on the user's word, after the password is confirmed. Refused while
    /// recorded files are still to seal again, and refused unless `discard_count` is the number of
    /// files it would leave unreadable, as the last step reported, so nothing is dropped unseen.
    pub fn finish_reencryption(
        &mut self,
        discard_count: Option<usize>,
    ) -> Result<(), ProtectedError> {
        if !self.is_reencrypting() {
            return Ok(());
        }
        let left_behind = match self.verifiable_previous_key_id() {
            Some(previous_id) => {
                let scan = self.scan_previous_key_files(previous_id)?;
                if !scan.pending.is_empty() {
                    return Err(ProtectedError::ReencryptionPending);
                }
                scan.held_back
            }
            None => self.previous_key_header_count()?,
        };
        if left_behind > 0 && discard_count != Some(left_behind) {
            return Err(ProtectedError::ReencryptionUnverifiable);
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

    /// The data key id in a file's header, read from its first bytes only; `None` when it is not
    /// there, as for a file cut short.
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

    /// How many files of the notes folder have a header naming the previous key, as the vault's
    /// previous-key slot names it; read without the key, which may not open.
    fn previous_key_header_count(&self) -> Result<usize, ProtectedError> {
        let Some(previous_id) = self
            .vault
            .slots
            .iter()
            .find(|slot| slot.kind == SlotKind::PreviousKey)
            .map(|slot| slot.data_key_id)
        else {
            return Ok(0);
        };
        let mut count = 0;
        for name in self.folder.note_file_names()? {
            let path = self.folder.notes_folder().join(&name);
            if !path.is_dir() && self.sealed_key_id(&path)? == Some(previous_id) {
                count += 1;
            }
        }
        Ok(count)
    }

    /// Each recorded note, then every other file of the notes folder. A recorded note still as it
    /// was is pending; one that changed, is gone or is cut short holds the key back, unless it has a
    /// file sealed with the current key. Another file holds the key back only when it opens with the
    /// previous key; one that does not is damaged and holds nothing back.
    fn scan_previous_key_files(&self, previous_id: u32) -> Result<PreviousKeyScan, ProtectedError> {
        let mut scan = PreviousKeyScan {
            pending: Vec::new(),
            held_back: 0,
            damaged: 0,
        };
        let recorded: Vec<String> = self
            .manifest
            .previous_key_files
            .iter()
            .flatten()
            .map(|file| hex_of(&file.note_id))
            .collect();
        self.scan_recorded_notes(previous_id, &recorded, &mut scan)?;
        self.scan_other_files(previous_id, &recorded, &mut scan)?;
        scan.pending.sort();
        Ok(scan)
    }

    fn scan_recorded_notes(
        &self,
        previous_id: u32,
        recorded: &[String],
        scan: &mut PreviousKeyScan,
    ) -> Result<(), ProtectedError> {
        for note_id in recorded {
            if self.damaged_during_reencryption.contains(note_id) {
                continue;
            }
            let path = self.folder.note_path(note_id);
            let key_id = if path.is_dir() {
                None
            } else {
                self.sealed_key_id(&path)?
            };
            match key_id {
                Some(id) if id == self.data_key.id => {}
                Some(id)
                    if id == previous_id && self.is_as_recorded(note_id, &fs::read(&path)?) =>
                {
                    scan.pending.push(note_id.clone());
                }
                _ => scan.held_back += 1,
            }
        }
        Ok(())
    }

    fn scan_other_files(
        &self,
        previous_id: u32,
        recorded: &[String],
        scan: &mut PreviousKeyScan,
    ) -> Result<(), ProtectedError> {
        for name in self.folder.note_file_names()? {
            let is_recorded = name
                .strip_suffix(".mdxp")
                .is_some_and(|stem| recorded.iter().any(|note_id| note_id == stem));
            let path = self.folder.notes_folder().join(&name);
            if is_recorded || path.is_dir() || self.sealed_key_id(&path)? != Some(previous_id) {
                continue;
            }
            if self.opens_with_previous_key(&fs::read(&path)?) {
                scan.held_back += 1;
            } else {
                scan.damaged += 1;
            }
        }
        Ok(())
    }

    /// Whether a note's file is, byte for byte, the one the re-encryption recorded at its start.
    fn is_as_recorded(&self, note_id: &str, bytes: &[u8]) -> bool {
        super::bytes_of_hex(note_id)
            .is_ok_and(|id| super::is_recorded_previous_key_file(&self.manifest, &id, bytes))
    }

    fn opens_with_previous_key(&self, bytes: &[u8]) -> bool {
        let (Some(previous_key), Ok(header)) = (&self.previous_key, FileHeader::parse(bytes))
        else {
            return false;
        };
        open_file(
            bytes,
            previous_key,
            &self.vault.vault_id,
            &ExpectedFile::note(header.note_id),
        )
        .is_ok()
    }

    /// One recorded note sealed again with the current key: same note id, revision, metadata and
    /// bytes. The bytes read here are checked against the record again, so a file changed after the
    /// scan is not carried over. A recorded file that does not open was damaged before the
    /// re-encryption and stays so.
    fn reseal(&mut self, note_id: &str) -> Result<Resealed, ProtectedError> {
        let path = self.folder.note_path(note_id);
        let bytes = fs::read(&path).map_err(|_| ProtectedError::Storage)?;
        if !self.is_as_recorded(note_id, &bytes) {
            return Ok(Resealed::Changed);
        }
        let (Some(previous_key), Ok(id)) = (&self.previous_key, super::bytes_of_hex(note_id))
        else {
            return Ok(Resealed::Changed);
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
                return Ok(Resealed::Damaged);
            }
            Err(failure) => return Err(failure),
        };
        let header = FileHeader {
            data_key_id: self.data_key.id,
            ..opened.header
        };
        let sealed = seal_file(&header, &opened.metadata, &opened.content, &self.data_key)?;
        write_bytes_atomically(&path, &sealed).map_err(|_| ProtectedError::Storage)?;
        Ok(Resealed::Done)
    }
}

#[cfg(test)]
mod tests;
