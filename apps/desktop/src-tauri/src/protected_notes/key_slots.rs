use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use ctutils::CtEq;
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

use super::random::{random_bytes, random_key};
use super::{KEY_BYTES, KdfParameters, PASSWORD_SALT_BYTES, ProtectedError};

/// Version 1 of the protected section's formats, bound into every slot and file.
pub const FORMAT_VERSION: u8 = 1;
pub const VAULT_ID_BYTES: usize = 16;
pub const SLOT_ID_BYTES: usize = 16;
pub const NONCE_BYTES: usize = 24;
pub const TAG_BYTES: usize = 16;
pub const COMMITMENT_BYTES: usize = 32;
const SLOT_CONTEXT: &[u8] = b"mdx-protected-v1-slot";
const COMMITMENT_CONTEXT: &[u8] = b"mdx-protected-v1-commit";

/// The random key every protected file is encrypted with, with the id that names it in their headers.
pub struct DataKey {
    pub id: u32,
    key: Zeroizing<[u8; KEY_BYTES]>,
}

impl DataKey {
    pub fn generate(id: u32) -> Result<Self, ProtectedError> {
        Ok(Self {
            id,
            key: random_key()?,
        })
    }

    /// A key with known bytes, for test vectors.
    #[cfg(test)]
    pub fn with_bytes_for_tests(id: u32, bytes: [u8; KEY_BYTES]) -> Self {
        Self {
            id,
            key: Zeroizing::new(bytes),
        }
    }

    /// The key bytes, for the file cipher only.
    pub fn bytes(&self) -> &[u8; KEY_BYTES] {
        &self.key
    }
}

/// How a slot is opened: a key from a password, the recovery key or this PC's remembered key. A
/// previous-key slot holds the data key a re-encryption replaces, wrapped by the new data key, so
/// notes not yet re-encrypted still open until the re-encryption ends and the slot is removed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SlotKind {
    Password {
        parameters: KdfParameters,
        salt: [u8; PASSWORD_SALT_BYTES],
    },
    Recovery,
    Device,
    PreviousKey,
}

impl SlotKind {
    fn code(self) -> u8 {
        match self {
            Self::Password { .. } => 1,
            Self::Recovery => 2,
            Self::Device => 3,
            Self::PreviousKey => 4,
        }
    }
}

/// The data key wrapped by one unlock method's key. Nothing in it is secret on its own.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeySlot {
    pub kind: SlotKind,
    pub slot_id: [u8; SLOT_ID_BYTES],
    pub data_key_id: u32,
    pub nonce: [u8; NONCE_BYTES],
    /// The data key encrypted with the slot's key, then its tag.
    pub wrapped_key: Vec<u8>,
    /// A hash of the slot's key, so a slot cannot be crafted to open under more than one key.
    pub commitment: [u8; COMMITMENT_BYTES],
}

/// Wraps the data key with a slot key in a new slot of this vault.
pub fn wrap_data_key(
    data_key: &DataKey,
    slot_key: &[u8; KEY_BYTES],
    vault_id: &[u8; VAULT_ID_BYTES],
    kind: SlotKind,
) -> Result<KeySlot, ProtectedError> {
    let mut slot = KeySlot {
        kind,
        slot_id: random_bytes()?,
        data_key_id: data_key.id,
        nonce: random_bytes()?,
        wrapped_key: Vec::new(),
        commitment: commitment_of(slot_key),
    };
    let cipher =
        XChaCha20Poly1305::new_from_slice(slot_key).map_err(|_| ProtectedError::WrongKey)?;
    slot.wrapped_key = cipher
        .encrypt(
            &XNonce::from(slot.nonce),
            Payload {
                msg: data_key.bytes(),
                aad: &associated_data(&slot, vault_id),
            },
        )
        .map_err(|_| ProtectedError::WrongKey)?;
    Ok(slot)
}

/// Opens a slot of this vault with a slot key. The key commitment is checked first, in constant time,
/// then the slot's fields are checked as associated data: any change to them fails the unwrap.
pub fn unwrap_data_key(
    slot: &KeySlot,
    slot_key: &[u8; KEY_BYTES],
    vault_id: &[u8; VAULT_ID_BYTES],
) -> Result<DataKey, ProtectedError> {
    if !is_same_in_constant_time(&commitment_of(slot_key), &slot.commitment) {
        return Err(ProtectedError::WrongKey);
    }
    let cipher =
        XChaCha20Poly1305::new_from_slice(slot_key).map_err(|_| ProtectedError::WrongKey)?;
    let unwrapped = Zeroizing::new(
        cipher
            .decrypt(
                &XNonce::from(slot.nonce),
                Payload {
                    msg: &slot.wrapped_key,
                    aad: &associated_data(slot, vault_id),
                },
            )
            .map_err(|_| ProtectedError::WrongKey)?,
    );
    let mut key = Zeroizing::new([0_u8; KEY_BYTES]);
    if unwrapped.len() != KEY_BYTES {
        return Err(ProtectedError::Tampered);
    }
    key.copy_from_slice(&unwrapped);
    Ok(DataKey {
        id: slot.data_key_id,
        key,
    })
}

/// Vault id, format version, data key id, slot kind and slot id, and the key derivation settings and
/// salt of a password slot.
fn associated_data(slot: &KeySlot, vault_id: &[u8; VAULT_ID_BYTES]) -> Vec<u8> {
    let mut data = Vec::with_capacity(SLOT_CONTEXT.len() + 96);
    data.extend_from_slice(SLOT_CONTEXT);
    data.push(FORMAT_VERSION);
    data.extend_from_slice(vault_id);
    data.extend_from_slice(&slot.data_key_id.to_be_bytes());
    data.push(slot.kind.code());
    data.extend_from_slice(&slot.slot_id);
    if let SlotKind::Password { parameters, salt } = slot.kind {
        data.extend_from_slice(&parameters.to_bytes());
        data.extend_from_slice(&salt);
    }
    data
}

fn commitment_of(slot_key: &[u8; KEY_BYTES]) -> [u8; COMMITMENT_BYTES] {
    let mut hash = Sha256::new();
    hash.update(COMMITMENT_CONTEXT);
    hash.update(slot_key);
    hash.finalize().into()
}

/// Whether a slot was made for this key, from its commitment alone, without unwrapping anything; as
/// to tell which device slot is this PC's.
pub fn is_slot_for_key(slot: &KeySlot, slot_key: &[u8; KEY_BYTES]) -> bool {
    is_same_in_constant_time(&commitment_of(slot_key), &slot.commitment)
}

/// Compares every byte whatever the first difference, so the time taken says nothing about where.
pub fn is_same_in_constant_time(first: &[u8], second: &[u8]) -> bool {
    first.len() == second.len() && first.ct_eq(second).to_bool()
}

#[cfg(test)]
mod tests {
    use super::*;

    const VAULT: [u8; VAULT_ID_BYTES] = [1; VAULT_ID_BYTES];
    const PASSWORD_KIND: SlotKind = SlotKind::Password {
        parameters: KdfParameters::FLOOR,
        salt: [9; PASSWORD_SALT_BYTES],
    };

    fn slot_key() -> Zeroizing<[u8; KEY_BYTES]> {
        random_key().unwrap()
    }

    #[test]
    fn each_slot_unwraps_only_with_its_own_key() {
        let data_key = DataKey::generate(1).unwrap();
        let (password_key, recovery_key, device_key) = (slot_key(), slot_key(), slot_key());
        let slots = [
            wrap_data_key(&data_key, &password_key, &VAULT, PASSWORD_KIND).unwrap(),
            wrap_data_key(&data_key, &recovery_key, &VAULT, SlotKind::Recovery).unwrap(),
            wrap_data_key(&data_key, &device_key, &VAULT, SlotKind::Device).unwrap(),
        ];
        let keys = [&password_key, &recovery_key, &device_key];

        for (slot_index, slot) in slots.iter().enumerate() {
            for (key_index, key) in keys.iter().enumerate() {
                let unwrapped = unwrap_data_key(slot, key, &VAULT);
                if slot_index == key_index {
                    assert_eq!(unwrapped.unwrap().bytes(), data_key.bytes());
                } else {
                    assert!(matches!(unwrapped, Err(ProtectedError::WrongKey)));
                }
            }
        }
    }

    #[test]
    fn changing_any_setting_or_slot_field_makes_the_unwrap_fail() {
        let data_key = DataKey::generate(7).unwrap();
        let key = slot_key();
        let slot = wrap_data_key(&data_key, &key, &VAULT, PASSWORD_KIND).unwrap();
        let changed = |change: fn(&mut KeySlot)| {
            let mut edited = slot.clone();
            change(&mut edited);
            unwrap_data_key(&edited, &key, &VAULT).map(|_| ())
        };

        for change in [
            |slot: &mut KeySlot| {
                slot.kind = SlotKind::Password {
                    parameters: KdfParameters::DEFAULT,
                    salt: [9; PASSWORD_SALT_BYTES],
                };
            },
            |slot: &mut KeySlot| {
                slot.kind = SlotKind::Password {
                    parameters: KdfParameters::FLOOR,
                    salt: [8; PASSWORD_SALT_BYTES],
                };
            },
            |slot: &mut KeySlot| slot.kind = SlotKind::Recovery,
            |slot: &mut KeySlot| slot.slot_id[0] ^= 1,
            |slot: &mut KeySlot| slot.data_key_id += 1,
            |slot: &mut KeySlot| slot.nonce[0] ^= 1,
            |slot: &mut KeySlot| slot.wrapped_key[0] ^= 1,
        ] {
            assert_eq!(changed(change), Err(ProtectedError::WrongKey));
        }
        assert!(matches!(
            unwrap_data_key(&slot, &key, &[2; VAULT_ID_BYTES]),
            Err(ProtectedError::WrongKey)
        ));
        assert_eq!(unwrap_data_key(&slot, &key, &VAULT).unwrap().id, 7);
    }

    #[test]
    fn the_commitment_check_rejects_a_slot_made_for_another_key() {
        let data_key = DataKey::generate(1).unwrap();
        let (own_key, other_key) = (slot_key(), slot_key());
        let mut slot = wrap_data_key(&data_key, &own_key, &VAULT, SlotKind::Recovery).unwrap();
        slot.commitment = commitment_of(&other_key);

        assert!(matches!(
            unwrap_data_key(&slot, &own_key, &VAULT),
            Err(ProtectedError::WrongKey)
        ));
        assert!(matches!(
            unwrap_data_key(&slot, &other_key, &VAULT),
            Err(ProtectedError::WrongKey)
        ));
    }

    #[test]
    fn two_wraps_of_the_same_key_differ() {
        let data_key = DataKey::generate(1).unwrap();
        let key = slot_key();

        let first = wrap_data_key(&data_key, &key, &VAULT, SlotKind::Device).unwrap();
        let second = wrap_data_key(&data_key, &key, &VAULT, SlotKind::Device).unwrap();

        assert_ne!(first.nonce, second.nonce);
        assert_ne!(first.wrapped_key, second.wrapped_key);
        assert_eq!(first.wrapped_key.len(), KEY_BYTES + TAG_BYTES);
    }

    #[test]
    fn compares_in_constant_time_by_value() {
        assert!(is_same_in_constant_time(&[1, 2, 3], &[1, 2, 3]));
        assert!(!is_same_in_constant_time(&[1, 2, 3], &[1, 2, 4]));
        assert!(!is_same_in_constant_time(&[1, 2], &[1, 2, 3]));
    }
}
