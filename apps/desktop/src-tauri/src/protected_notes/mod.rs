//! The protected section of a Notes workspace: key derivation, key slots, the encrypted file format,
//! the vault file and the encrypted manifest. Pure Rust with no calls to the operating system beyond
//! its random generator; keys never leave this module unwrapped and are wiped when dropped.

mod encrypted_file;
mod hex_text;
mod key_derivation;
mod key_slots;
mod manifest;
mod protected_error;
mod protected_section;
mod random;
mod recovery_key;
mod untrusted_input;
mod vault_file;

pub use encrypted_file::{
    FileHeader, FileKind, FileMetadata, HEADER_BYTES, MANIFEST_NOTE_ID, MAX_CHUNKS,
    MAX_CONTENT_BYTES, MAX_METADATA_BYTES, NOTE_ID_BYTES, OpenedFile, PLAIN_CHUNK_BYTES, open_file,
    seal_file,
};
pub use hex_text::hex_of;
pub use key_derivation::{KdfParameters, PASSWORD_SALT_BYTES, calibrate, derive_password_key};
pub use key_slots::{
    COMMITMENT_BYTES, DataKey, FORMAT_VERSION, KeySlot, NONCE_BYTES, SLOT_ID_BYTES, SlotKind,
    TAG_BYTES, VAULT_ID_BYTES, is_same_in_constant_time, unwrap_data_key, wrap_data_key,
};
pub use manifest::{MANIFEST_FILE_NAME, MAX_MANIFEST_ENTRIES, Manifest, ManifestEntry, NoteState};
pub use protected_error::ProtectedError;
pub use protected_section::{
    NoteSummary, OpenedNote, SectionFolder, UnlockedSection, has_device_slot, unlock_on_this_pc,
};
pub use random::{random_bytes, random_key};
pub use recovery_key::{recovery_key_from_text, recovery_key_text};
pub use untrusted_input::read_untrusted_input;
pub use vault_file::{
    MAX_VAULT_FILE_BYTES, NewVault, SetUpRefusal, VAULT_FILE_NAME, Vault, set_up_refusal,
};

/// Every key in the protected section is 256 bits.
pub const KEY_BYTES: usize = 32;
