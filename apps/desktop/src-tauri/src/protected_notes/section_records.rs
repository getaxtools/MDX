use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::ProtectedError;
use super::hex_text::{bytes_of_hex, hex_of};
use super::key_slots::{SlotKind, VAULT_ID_BYTES};
use super::vault_file::Vault;
use crate::documents::write_bytes_atomically;

/// A records file larger than this is not one MDX wrote.
const MAX_RECORDS_FILE_BYTES: u64 = 4 * 1_024 * 1_024;
const UNREADABLE_SUFFIX: &str = "unreadable";

/// What this PC last saw of a section: its manifest's revision, a hash of its password slots and the
/// ids of all its slots. Kept in the app's own data folder, never beside the section, so putting back
/// an older copy of the whole folder cannot put back these too.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SectionRecord {
    pub manifest_revision: u64,
    pub password_slots_hash: [u8; 32],
    pub slot_ids: BTreeSet<String>,
}

impl SectionRecord {
    pub fn of(vault: &Vault, manifest_revision: u64) -> Result<Self, ProtectedError> {
        let password_slots = Vault {
            vault_id: vault.vault_id,
            slots: vault
                .slots
                .iter()
                .filter(|slot| matches!(slot.kind, SlotKind::Password { .. }))
                .cloned()
                .collect(),
        };
        Ok(Self {
            manifest_revision,
            password_slots_hash: Sha256::digest(password_slots.to_json()?).into(),
            slot_ids: vault
                .slots
                .iter()
                .map(|slot| hex_of(&slot.slot_id))
                .collect(),
        })
    }
}

/// Why a section's folder may be older than this PC last saw it, or why that could not be told.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FolderWarning {
    /// The manifest is older: notes may have been put back to earlier versions, or lost.
    OlderNotes,
    /// The vault file has a different password or a slot this PC had not seen: it was changed on
    /// another PC or restored from a backup, which can bring back an old password.
    ChangedVault,
    /// What this PC saw before could not be read, so the folder could not be compared with it.
    CheckUnavailable,
}

/// The records file, one entry per vault id; one reader or writer at a time.
pub struct SectionRecords {
    path: PathBuf,
    one_at_a_time: Mutex<()>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedRecords {
    sections: BTreeMap<String, SavedRecord>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedRecord {
    manifest_revision: u64,
    password_slots_hash: String,
    slot_ids: BTreeSet<String>,
}

/// The records as read: none yet, the records, or a file that could not be read and was set aside.
enum LoadedRecords {
    Readable(SavedRecords),
    SetAside,
}

impl SectionRecords {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            one_at_a_time: Mutex::new(()),
        }
    }

    /// A warning when the folder is older than this PC last saw; none without a record, as on a PC
    /// that has not opened the section before. Removing a slot, such as forgetting another PC, is not
    /// a warning; a changed password slot or a slot this PC never saw is.
    pub fn warning_for(
        &self,
        vault_id: &[u8; VAULT_ID_BYTES],
        seen: &SectionRecord,
    ) -> Option<FolderWarning> {
        let _one_at_a_time = self
            .one_at_a_time
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let mut records = match self.load() {
            LoadedRecords::Readable(records) => records,
            LoadedRecords::SetAside => return Some(FolderWarning::CheckUnavailable),
        };
        let known = records.sections.remove(&hex_of(vault_id))?;
        let Ok(known_hash) = bytes_of_hex::<32>(&known.password_slots_hash) else {
            return Some(FolderWarning::CheckUnavailable);
        };
        let has_unseen_slot = !seen.slot_ids.is_subset(&known.slot_ids);
        if seen.manifest_revision < known.manifest_revision {
            Some(FolderWarning::OlderNotes)
        } else if seen.password_slots_hash != known_hash || has_unseen_slot {
            Some(FolderWarning::ChangedVault)
        } else {
            None
        }
    }

    /// Notes what this PC has now seen of the section; a failure to write leaves the old record.
    pub fn remember(&self, vault_id: &[u8; VAULT_ID_BYTES], seen: &SectionRecord) {
        let _one_at_a_time = self
            .one_at_a_time
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let mut records = match self.load() {
            LoadedRecords::Readable(records) => records,
            LoadedRecords::SetAside => SavedRecords::default(),
        };
        records.sections.insert(
            hex_of(vault_id),
            SavedRecord {
                manifest_revision: seen.manifest_revision,
                password_slots_hash: hex_of(&seen.password_slots_hash),
                slot_ids: seen.slot_ids.clone(),
            },
        );
        if let Ok(bytes) = serde_json::to_vec_pretty(&records) {
            let _ = write_bytes_atomically(&self.path, &bytes);
        }
    }

    /// The records; a file too big or not readable as records is renamed aside and kept, never
    /// written over.
    fn load(&self) -> LoadedRecords {
        let Ok(metadata) = fs::metadata(&self.path) else {
            return LoadedRecords::Readable(SavedRecords::default());
        };
        let records = (metadata.len() <= MAX_RECORDS_FILE_BYTES)
            .then(|| fs::read(&self.path).ok())
            .flatten()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok());
        match records {
            Some(records) => LoadedRecords::Readable(records),
            None => {
                let _ = fs::rename(&self.path, self.set_aside_path());
                LoadedRecords::SetAside
            }
        }
    }

    fn set_aside_path(&self) -> PathBuf {
        let mut name = self.path.file_name().unwrap_or_default().to_os_string();
        name.push(format!(".{UNREADABLE_SUFFIX}-{}", std::process::id()));
        self.path.with_file_name(name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VAULT: [u8; VAULT_ID_BYTES] = [7; VAULT_ID_BYTES];

    fn seen(manifest_revision: u64, hash: u8, slot_ids: &[&str]) -> SectionRecord {
        SectionRecord {
            manifest_revision,
            password_slots_hash: [hash; 32],
            slot_ids: slot_ids.iter().map(|id| (*id).to_owned()).collect(),
        }
    }

    fn records_in(folder: &tempfile::TempDir) -> SectionRecords {
        SectionRecords::new(folder.path().join("protected-sections.json"))
    }

    #[test]
    fn a_new_pc_has_no_warning_and_a_newer_folder_none_either() {
        let folder = tempfile::tempdir().unwrap();
        let records = records_in(&folder);

        assert_eq!(records.warning_for(&VAULT, &seen(5, 1, &["a"])), None);
        records.remember(&VAULT, &seen(5, 1, &["a"]));
        assert_eq!(records.warning_for(&VAULT, &seen(6, 1, &["a"])), None);
    }

    #[test]
    fn an_older_manifest_a_changed_password_or_a_slot_added_back_is_named() {
        let folder = tempfile::tempdir().unwrap();
        let records = records_in(&folder);
        records.remember(&VAULT, &seen(5, 1, &["a", "b"]));

        assert_eq!(
            records.warning_for(&VAULT, &seen(4, 1, &["a", "b"])),
            Some(FolderWarning::OlderNotes)
        );
        assert_eq!(
            records.warning_for(&VAULT, &seen(5, 2, &["a", "b"])),
            Some(FolderWarning::ChangedVault)
        );
        assert_eq!(
            records.warning_for(&VAULT, &seen(5, 1, &["a", "b", "c"])),
            Some(FolderWarning::ChangedVault)
        );
    }

    #[test]
    fn a_removed_slot_such_as_a_forgotten_pc_is_not_a_warning() {
        let folder = tempfile::tempdir().unwrap();
        let records = records_in(&folder);
        records.remember(&VAULT, &seen(5, 1, &["password", "device"]));

        assert_eq!(
            records.warning_for(&VAULT, &seen(5, 1, &["password"])),
            None
        );
    }

    #[test]
    fn an_unreadable_records_file_is_set_aside_kept_and_the_check_reported_unavailable() {
        let folder = tempfile::tempdir().unwrap();
        let records = records_in(&folder);
        let path = folder.path().join("protected-sections.json");
        fs::write(&path, b"not json").unwrap();

        assert_eq!(
            records.warning_for(&VAULT, &seen(5, 1, &["a"])),
            Some(FolderWarning::CheckUnavailable)
        );

        let kept: Vec<_> = fs::read_dir(folder.path())
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .contains(UNREADABLE_SUFFIX)
            })
            .collect();
        assert_eq!(kept.len(), 1);
        assert_eq!(fs::read(kept[0].path()).unwrap(), b"not json");
        assert!(!path.exists());
    }
}
