use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::ProtectedError;
use super::hex_text::{bytes_of_hex, hex_of};
use super::key_slots::VAULT_ID_BYTES;
use super::vault_file::Vault;
use crate::documents::write_bytes_atomically;

/// A records file larger than this is not one MDX wrote.
const MAX_RECORDS_FILE_BYTES: u64 = 4 * 1_024 * 1_024;

/// What this PC last saw of a section: its manifest's revision and a hash of its vault file. Kept in
/// the app's own data folder, never beside the section, so putting back an older copy of the whole
/// folder cannot put back these too.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SectionRecord {
    pub manifest_revision: u64,
    pub vault_hash: [u8; 32],
}

impl SectionRecord {
    pub fn of(vault: &Vault, manifest_revision: u64) -> Result<Self, ProtectedError> {
        Ok(Self {
            manifest_revision,
            vault_hash: Sha256::digest(vault.to_json()?).into(),
        })
    }
}

/// Why a section's folder looks older than this PC last saw it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FolderWarning {
    /// The manifest is older: notes may have been put back to earlier versions, or lost.
    OlderNotes,
    /// The vault file changed outside MDX on this PC, as putting back an older copy would change it,
    /// bringing back an old password.
    ChangedVault,
}

/// The records file, one entry per vault id.
pub struct SectionRecords {
    path: PathBuf,
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
    vault_hash: String,
}

impl SectionRecords {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    /// A warning when the folder is older than this PC last saw; none without a record, as on a PC
    /// that has not opened the section before.
    pub fn warning_for(
        &self,
        vault_id: &[u8; VAULT_ID_BYTES],
        seen: &SectionRecord,
    ) -> Option<FolderWarning> {
        let known = self.load().sections.remove(&hex_of(vault_id))?;
        let known_hash: [u8; 32] = bytes_of_hex(&known.vault_hash).ok()?;
        if seen.manifest_revision < known.manifest_revision {
            Some(FolderWarning::OlderNotes)
        } else if seen.vault_hash != known_hash {
            Some(FolderWarning::ChangedVault)
        } else {
            None
        }
    }

    /// Notes what this PC has now seen of the section; a failure to write leaves the old record.
    pub fn remember(&self, vault_id: &[u8; VAULT_ID_BYTES], seen: &SectionRecord) {
        let mut records = self.load();
        records.sections.insert(
            hex_of(vault_id),
            SavedRecord {
                manifest_revision: seen.manifest_revision,
                vault_hash: hex_of(&seen.vault_hash),
            },
        );
        if let Ok(bytes) = serde_json::to_vec_pretty(&records) {
            let _ = write_bytes_atomically(&self.path, &bytes);
        }
    }

    fn load(&self) -> SavedRecords {
        let is_readable =
            fs::metadata(&self.path).is_ok_and(|metadata| metadata.len() <= MAX_RECORDS_FILE_BYTES);
        if !is_readable {
            return SavedRecords::default();
        }
        fs::read(&self.path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VAULT: [u8; VAULT_ID_BYTES] = [7; VAULT_ID_BYTES];

    fn seen(manifest_revision: u64, hash: u8) -> SectionRecord {
        SectionRecord {
            manifest_revision,
            vault_hash: [hash; 32],
        }
    }

    #[test]
    fn a_new_pc_has_no_warning_and_a_newer_folder_none_either() {
        let folder = tempfile::tempdir().unwrap();
        let records = SectionRecords::new(folder.path().join("protected-sections.json"));

        assert_eq!(records.warning_for(&VAULT, &seen(5, 1)), None);
        records.remember(&VAULT, &seen(5, 1));
        assert_eq!(records.warning_for(&VAULT, &seen(6, 1)), None);
        assert_eq!(records.warning_for(&VAULT, &seen(5, 1)), None);
    }

    #[test]
    fn an_older_manifest_or_a_changed_vault_file_is_named() {
        let folder = tempfile::tempdir().unwrap();
        let records = SectionRecords::new(folder.path().join("protected-sections.json"));
        records.remember(&VAULT, &seen(5, 1));

        assert_eq!(
            records.warning_for(&VAULT, &seen(4, 1)),
            Some(FolderWarning::OlderNotes)
        );
        assert_eq!(
            records.warning_for(&VAULT, &seen(5, 2)),
            Some(FolderWarning::ChangedVault)
        );
        records.remember(&VAULT, &seen(4, 1));
        assert_eq!(records.warning_for(&VAULT, &seen(4, 1)), None);
    }
}
