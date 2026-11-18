use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use super::hex_text::{bytes_of_hex, bytes_of_hex_text, hex_of};
use super::key_derivation::{KdfParameters, PASSWORD_SALT_BYTES, derive_password_key};
use super::key_slots::{
    COMMITMENT_BYTES, DataKey, FORMAT_VERSION, KeySlot, NONCE_BYTES, SLOT_ID_BYTES, SlotKind,
    TAG_BYTES, VAULT_ID_BYTES, unwrap_data_key, wrap_data_key,
};
use super::random::{random_bytes, random_key};
use super::{KEY_BYTES, ProtectedError};

pub const VAULT_FILE_NAME: &str = "vault.json";
const FORMAT_NAME: &str = "mdx-protected-vault";
const KDF_ALGORITHM: &str = "argon2id";
const ARGON2_VERSION: u32 = 0x13;
/// A vault file is a few slots; anything larger is not one of ours.
pub const MAX_VAULT_FILE_BYTES: usize = 64 * 1_024;
const MAX_SLOTS: usize = 32;
/// One password slot never asks for more than four times the default memory when read from a file.
const MAX_SLOT_MEMORY_KIB: u32 = 4 * 64 * 1_024;
/// Two password slots at most: change password may hold the old and the new one for a moment.
const MAX_PASSWORD_SLOTS: usize = 2;
/// The most key derivation work a vault file may ask for across its password slots, in KiB times
/// passes: four times the default for each of two slots, so a crafted file cannot make unlocking take
/// minutes.
const MAX_TOTAL_KDF_COST: u64 = 2 * 4 * (64 * 1_024) * 3;

/// The vault file: which vault this is, and the slots that unwrap its data key. Nothing in it is
/// secret on its own.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Vault {
    pub vault_id: [u8; VAULT_ID_BYTES],
    pub slots: Vec<KeySlot>,
}

/// A new vault with its keys: the data key, the recovery key to show once, and the vault itself.
pub struct NewVault {
    pub vault: Vault,
    pub data_key: DataKey,
    pub recovery_key: Zeroizing<[u8; KEY_BYTES]>,
}

impl Vault {
    /// A vault with a new data key, a password slot with these settings and a recovery slot.
    pub fn create(password: &str, parameters: KdfParameters) -> Result<NewVault, ProtectedError> {
        let parameters = parameters.checked_for_writing()?;
        let vault_id = random_bytes()?;
        let data_key = DataKey::generate(1)?;
        let recovery_key = random_key()?;
        let salt = random_bytes()?;
        let password_key = derive_password_key(password, &salt, parameters)?;
        let slots = vec![
            wrap_data_key(
                &data_key,
                &password_key,
                &vault_id,
                SlotKind::Password { parameters, salt },
            )?,
            wrap_data_key(&data_key, &recovery_key, &vault_id, SlotKind::Recovery)?,
        ];
        Ok(NewVault {
            vault: Self { vault_id, slots },
            data_key,
            recovery_key,
        })
    }

    /// The data key from the password; every password slot is tried, and a wrong password says only so.
    /// Any other failure, such as too little memory, is passed on as itself.
    pub fn unlock_with_password(&self, password: &str) -> Result<DataKey, ProtectedError> {
        let mut first_failure = None;
        for slot in &self.slots {
            let SlotKind::Password { parameters, salt } = slot.kind else {
                continue;
            };
            let opened = derive_password_key(password, &salt, parameters)
                .and_then(|key| unwrap_data_key(slot, &key, &self.vault_id));
            match opened {
                Ok(data_key) => return Ok(data_key),
                Err(ProtectedError::WrongKey) => {}
                Err(failure) => {
                    first_failure.get_or_insert(failure);
                }
            }
        }
        Err(first_failure.unwrap_or(ProtectedError::WrongKey))
    }

    /// The data key from the recovery key or this PC's remembered key.
    pub fn unlock_with_key(
        &self,
        kind: SlotKind,
        key: &[u8; KEY_BYTES],
    ) -> Result<DataKey, ProtectedError> {
        for slot in self.slots.iter().filter(|slot| slot.kind == kind) {
            match unwrap_data_key(slot, key, &self.vault_id) {
                Err(ProtectedError::WrongKey) => {}
                result => return result,
            }
        }
        Err(ProtectedError::WrongKey)
    }

    pub fn to_json(&self) -> Result<Vec<u8>, ProtectedError> {
        let saved = SavedVault {
            format: FORMAT_NAME.to_owned(),
            format_version: FORMAT_VERSION,
            vault_id: hex_of(&self.vault_id),
            slots: self.slots.iter().map(SavedSlot::of).collect(),
        };
        serde_json::to_vec_pretty(&saved).map_err(|_| ProtectedError::TooLarge)
    }

    /// Reads a vault file; one of a later version is refused as such, anything malformed as damage,
    /// and key derivation settings above the ceiling as too costly to read.
    pub fn from_json(bytes: &[u8]) -> Result<Self, ProtectedError> {
        if bytes.len() > MAX_VAULT_FILE_BYTES {
            return Err(ProtectedError::TooLarge);
        }
        let saved: SavedVault =
            serde_json::from_slice(bytes).map_err(|_| ProtectedError::Tampered)?;
        if saved.format != FORMAT_NAME {
            return Err(ProtectedError::Tampered);
        }
        if saved.format_version > FORMAT_VERSION {
            return Err(ProtectedError::UnsupportedVersion);
        }
        if saved.format_version != FORMAT_VERSION
            || saved.slots.is_empty()
            || saved.slots.len() > MAX_SLOTS
        {
            return Err(ProtectedError::Tampered);
        }
        let slots: Vec<KeySlot> = saved
            .slots
            .iter()
            .map(SavedSlot::to_slot)
            .collect::<Result<_, _>>()?;
        if !is_affordable(&slots) || !has_at_most_one_previous_key(&slots) {
            return Err(ProtectedError::Tampered);
        }
        Ok(Self {
            vault_id: bytes_of_hex(&saved.vault_id)?,
            slots,
        })
    }
}

/// One re-encryption at a time: a vault holds at most one previous data key.
fn has_at_most_one_previous_key(slots: &[KeySlot]) -> bool {
    slots
        .iter()
        .filter(|slot| slot.kind == SlotKind::PreviousKey)
        .count()
        <= 1
}

/// At most two password slots, and no more key derivation work across them than unlocking should take.
fn is_affordable(slots: &[KeySlot]) -> bool {
    let costs: Vec<u64> = slots
        .iter()
        .filter_map(|slot| match slot.kind {
            SlotKind::Password { parameters, .. } => {
                Some(u64::from(parameters.memory_kib) * u64::from(parameters.iterations))
            }
            _ => None,
        })
        .collect();
    costs.len() <= MAX_PASSWORD_SLOTS && costs.iter().sum::<u64>() <= MAX_TOTAL_KDF_COST
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SavedVault {
    format: String,
    format_version: u8,
    vault_id: String,
    slots: Vec<SavedSlot>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SavedSlot {
    kind: SavedSlotKind,
    slot_id: String,
    data_key_id: u32,
    nonce: String,
    wrapped_key: String,
    commitment: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    kdf: Option<SavedKdf>,
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum SavedSlotKind {
    Password,
    Recovery,
    Device,
    PreviousKey,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SavedKdf {
    algorithm: String,
    version: u32,
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
    salt: String,
}

impl SavedSlot {
    fn of(slot: &KeySlot) -> Self {
        let (kind, kdf) = match slot.kind {
            SlotKind::Password { parameters, salt } => (
                SavedSlotKind::Password,
                Some(SavedKdf {
                    algorithm: KDF_ALGORITHM.to_owned(),
                    version: ARGON2_VERSION,
                    memory_kib: parameters.memory_kib,
                    iterations: parameters.iterations,
                    parallelism: parameters.parallelism,
                    salt: hex_of(&salt),
                }),
            ),
            SlotKind::Recovery => (SavedSlotKind::Recovery, None),
            SlotKind::Device => (SavedSlotKind::Device, None),
            SlotKind::PreviousKey => (SavedSlotKind::PreviousKey, None),
        };
        Self {
            kind,
            slot_id: hex_of(&slot.slot_id),
            data_key_id: slot.data_key_id,
            nonce: hex_of(&slot.nonce),
            wrapped_key: hex_of(&slot.wrapped_key),
            commitment: hex_of(&slot.commitment),
            kdf,
        }
    }

    fn to_slot(&self) -> Result<KeySlot, ProtectedError> {
        let kind = match (self.kind, &self.kdf) {
            (SavedSlotKind::Password, Some(kdf)) => kdf.to_kind()?,
            (SavedSlotKind::Recovery, None) => SlotKind::Recovery,
            (SavedSlotKind::Device, None) => SlotKind::Device,
            (SavedSlotKind::PreviousKey, None) => SlotKind::PreviousKey,
            _ => return Err(ProtectedError::Tampered),
        };
        let wrapped_key = bytes_of_hex_text(&self.wrapped_key, KEY_BYTES + TAG_BYTES)?;
        if wrapped_key.len() != KEY_BYTES + TAG_BYTES {
            return Err(ProtectedError::Tampered);
        }
        Ok(KeySlot {
            kind,
            slot_id: bytes_of_hex::<SLOT_ID_BYTES>(&self.slot_id)?,
            data_key_id: self.data_key_id,
            nonce: bytes_of_hex::<NONCE_BYTES>(&self.nonce)?,
            wrapped_key,
            commitment: bytes_of_hex::<COMMITMENT_BYTES>(&self.commitment)?,
        })
    }
}

impl SavedKdf {
    fn to_kind(&self) -> Result<SlotKind, ProtectedError> {
        if self.algorithm != KDF_ALGORITHM || self.version != ARGON2_VERSION {
            return Err(ProtectedError::Tampered);
        }
        let parameters = KdfParameters {
            memory_kib: self.memory_kib,
            iterations: self.iterations,
            parallelism: self.parallelism,
        }
        .checked_for_reading()?;
        let is_usable = argon2::Params::new(
            parameters.memory_kib,
            parameters.iterations,
            parameters.parallelism,
            Some(KEY_BYTES),
        )
        .is_ok();
        if !is_usable || parameters.memory_kib > MAX_SLOT_MEMORY_KIB {
            return Err(ProtectedError::Tampered);
        }
        Ok(SlotKind::Password {
            parameters,
            salt: bytes_of_hex::<PASSWORD_SALT_BYTES>(&self.salt)?,
        })
    }
}

/// What is in a protected folder before a vault is set up there.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SetUpRefusal {
    /// The folder has a vault already.
    AlreadySetUp,
    /// Protected files are there without their vault file: a new vault would strand them, so the
    /// vault file has to be restored instead.
    VaultFileMissing,
}

/// Whether a vault may be set up in a folder holding files with these names (its own and those of its
/// note and draft folders).
pub fn set_up_refusal<'name>(
    file_names: impl IntoIterator<Item = &'name str>,
) -> Option<SetUpRefusal> {
    let mut has_protected_files = false;
    for name in file_names {
        if name.eq_ignore_ascii_case(VAULT_FILE_NAME) {
            return Some(SetUpRefusal::AlreadySetUp);
        }
        has_protected_files |= name.to_ascii_lowercase().ends_with(".mdxp");
    }
    has_protected_files.then_some(SetUpRefusal::VaultFileMissing)
}

#[cfg(test)]
mod tests {
    use super::*;

    const QUICK: KdfParameters = KdfParameters::FLOOR;

    #[test]
    fn a_new_vault_opens_with_its_password_and_its_recovery_key_and_round_trips() {
        let created = Vault::create("correct horse battery", QUICK).unwrap();

        let read = Vault::from_json(&created.vault.to_json().unwrap()).unwrap();

        assert_eq!(read, created.vault);
        assert_eq!(
            read.unlock_with_password("correct horse battery")
                .unwrap()
                .bytes(),
            created.data_key.bytes()
        );
        assert_eq!(
            read.unlock_with_key(SlotKind::Recovery, &created.recovery_key)
                .unwrap()
                .bytes(),
            created.data_key.bytes()
        );
        assert!(matches!(
            read.unlock_with_password("wrong password"),
            Err(ProtectedError::WrongKey)
        ));
        assert!(matches!(
            read.unlock_with_key(SlotKind::Device, &created.recovery_key),
            Err(ProtectedError::WrongKey)
        ));
    }

    #[test]
    fn the_vault_file_holds_no_key_or_password() {
        let created = Vault::create("correct horse battery", QUICK).unwrap();

        let json = String::from_utf8(created.vault.to_json().unwrap()).unwrap();

        assert!(!json.contains("correct horse"));
        assert!(!json.contains(&hex_of(created.data_key.bytes())));
        assert!(!json.contains(&hex_of(created.recovery_key.as_slice())));
    }

    #[test]
    fn weakened_settings_in_the_file_no_longer_open_the_vault() {
        let created = Vault::create("correct horse battery", QUICK).unwrap();
        let json = String::from_utf8(created.vault.to_json().unwrap()).unwrap();
        let weakened = json.replacen("\"iterations\": 2", "\"iterations\": 1", 1);

        let read = Vault::from_json(weakened.as_bytes()).unwrap();

        assert!(matches!(
            read.unlock_with_password("correct horse battery"),
            Err(ProtectedError::WrongKey)
        ));
    }

    #[test]
    fn refuses_a_malformed_oversized_or_later_vault_file() {
        let created = Vault::create("correct horse battery", QUICK).unwrap();
        let json = String::from_utf8(created.vault.to_json().unwrap()).unwrap();

        assert_eq!(
            Vault::from_json(
                json.replacen("\"formatVersion\": 1", "\"formatVersion\": 2", 1)
                    .as_bytes()
            ),
            Err(ProtectedError::UnsupportedVersion)
        );
        assert_eq!(
            Vault::from_json(
                json.replacen("\"memoryKib\": 19456", "\"memoryKib\": 99999999", 1)
                    .as_bytes()
            ),
            Err(ProtectedError::ExcessiveKeyDerivation)
        );
        assert_eq!(Vault::from_json(b"{}"), Err(ProtectedError::Tampered));
        assert_eq!(
            Vault::from_json(&vec![b' '; MAX_VAULT_FILE_BYTES + 1]),
            Err(ProtectedError::TooLarge)
        );
    }

    #[test]
    fn a_vault_file_asking_for_too_much_key_derivation_work_is_refused_as_tampered() {
        let created = Vault::create("correct horse battery", QUICK).unwrap();
        let password_slot = created.vault.slots[0].clone();
        let costly = KeySlot {
            kind: SlotKind::Password {
                parameters: KdfParameters::CEILING,
                salt: [1; PASSWORD_SALT_BYTES],
            },
            ..password_slot.clone()
        };
        let three_slots = Vault {
            slots: vec![password_slot.clone(), password_slot.clone(), password_slot],
            ..created.vault.clone()
        };
        let one_costly = Vault {
            slots: vec![costly],
            ..created.vault.clone()
        };

        for vault in [three_slots, one_costly] {
            assert_eq!(
                Vault::from_json(&vault.to_json().unwrap()),
                Err(ProtectedError::Tampered)
            );
        }
        assert!(Vault::from_json(&created.vault.to_json().unwrap()).is_ok());
    }

    #[test]
    fn a_slot_that_cannot_run_before_the_real_one_does_not_block_the_password() {
        let created = Vault::create("correct horse battery", QUICK).unwrap();
        let real = created.vault.slots[0].clone();
        let unusable = KeySlot {
            kind: SlotKind::Password {
                parameters: KdfParameters {
                    memory_kib: 64,
                    iterations: 1,
                    parallelism: 0,
                },
                salt: [1; PASSWORD_SALT_BYTES],
            },
            ..real.clone()
        };
        let vault = Vault {
            slots: vec![unusable, real],
            ..created.vault.clone()
        };

        assert!(vault.unlock_with_password("correct horse battery").is_ok());
        assert_eq!(
            vault.unlock_with_password("wrong password").map(|_| ()),
            Err(ProtectedError::KeyDerivationFailed)
        );
    }

    #[test]
    fn unusable_or_memory_heavy_settings_in_a_slot_are_refused_on_read() {
        let created = Vault::create("correct horse battery", QUICK).unwrap();
        let real = created.vault.slots[0].clone();
        let with_settings = |memory_kib, parallelism| KeySlot {
            kind: SlotKind::Password {
                parameters: KdfParameters {
                    memory_kib,
                    iterations: 1,
                    parallelism,
                },
                salt: [1; PASSWORD_SALT_BYTES],
            },
            ..real.clone()
        };

        for bad in [
            with_settings(64, 0),
            with_settings(32, 8),
            with_settings(MAX_SLOT_MEMORY_KIB + 1, 1),
        ] {
            let vault = Vault {
                slots: vec![bad, real.clone()],
                ..created.vault.clone()
            };
            assert_eq!(
                Vault::from_json(&vault.to_json().unwrap()),
                Err(ProtectedError::Tampered)
            );
        }
    }

    #[test]
    fn key_file_missing_refuses_set_up() {
        assert_eq!(
            set_up_refusal(["a1.mdxp", "manifest.mdxp"]),
            Some(SetUpRefusal::VaultFileMissing)
        );
        assert_eq!(
            set_up_refusal(["vault.json", "a1.mdxp"]),
            Some(SetUpRefusal::AlreadySetUp)
        );
        assert_eq!(set_up_refusal(["readme.txt"]), None);
        assert_eq!(set_up_refusal([]), None);
    }
}
