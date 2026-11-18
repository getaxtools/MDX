//! The protected section of a Notes workspace: key derivation, key slots, the encrypted file format,
//! the vault file and the encrypted manifest. Pure Rust with no calls to the operating system beyond
//! its random generator; keys never leave this module unwrapped and are wiped when dropped.

mod key_derivation;
mod protected_error;
mod random;

pub use key_derivation::{KdfParameters, PASSWORD_SALT_BYTES, calibrate, derive_password_key};
pub use protected_error::ProtectedError;
pub use random::{random_bytes, random_key};

/// Every key in the protected section is 256 bits.
pub const KEY_BYTES: usize = 32;
