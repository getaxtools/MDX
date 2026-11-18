//! Secrets kept for this user on this PC, such as the key that remembers a protected section. They stay
//! in Rust: no secret is ever sent to the window, where text cannot be wiped from memory.

#[cfg(any(test, feature = "webdriver"))]
mod in_memory_secrets;

/// Windows Credential Manager, the store the app uses on Windows.
#[cfg(windows)]
pub use crate::platform::CredentialManagerSecrets;
#[cfg(any(test, feature = "webdriver"))]
pub use in_memory_secrets::InMemoryDeviceSecrets;
use zeroize::Zeroizing;

use crate::protected_notes::{VAULT_ID_BYTES, hex_of};

const PROTECTED_SECTION_PREFIX: &str = "getaxtools.MDX/protected/";

/// The name a secret is stored under, made by the app and never taken from the window.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SecretName(String);

impl SecretName {
    /// The remembered key of one protected section, named by its vault id.
    pub fn for_vault(vault_id: &[u8; VAULT_ID_BYTES]) -> Self {
        Self(format!("{PROTECTED_SECTION_PREFIX}{}", hex_of(vault_id)))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum SecretStoreError {
    #[error("the secret store of this PC could not be used")]
    Unavailable,
}

/// Where this PC keeps secrets for the current user; secrets stay local to the PC.
pub trait DeviceSecretStore: Send + Sync {
    fn save(&self, name: &SecretName, secret: &[u8]) -> Result<(), SecretStoreError>;
    /// `None` when no secret is stored under the name.
    fn load(&self, name: &SecretName) -> Result<Option<Zeroizing<Vec<u8>>>, SecretStoreError>;
    /// Deleting a secret that is not there succeeds.
    fn delete(&self, name: &SecretName) -> Result<(), SecretStoreError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_vault_secret_is_named_by_the_vault_id_alone() {
        let name = SecretName::for_vault(&[0xab; VAULT_ID_BYTES]);

        assert_eq!(
            name.as_str(),
            format!("getaxtools.MDX/protected/{}", "ab".repeat(16))
        );
    }
}
