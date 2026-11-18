use std::collections::HashMap;
use std::sync::Arc;

use keyring_core::api::CredentialStoreApi;
use keyring_core::{Entry, Error};
use windows_native_keyring_store::Store;
use zeroize::Zeroizing;

use crate::secrets::{DeviceSecretStore, SecretName, SecretStoreError};

/// Names the credentials as MDX's own in Credential Manager; the target name is given in full.
const SERVICE: &str = "getaxtools.MDX";
/// Windows keeps the credential for this user on this PC only; the store's default would roam it.
const LOCAL_PERSISTENCE: &str = "Local";

/// Windows Credential Manager, for the current user, with every secret kept local to this PC.
pub struct CredentialManagerSecrets {
    store: Arc<Store>,
}

impl CredentialManagerSecrets {
    pub fn new() -> Result<Self, SecretStoreError> {
        Ok(Self {
            store: Store::new().map_err(|_| SecretStoreError::Unavailable)?,
        })
    }

    /// A generic credential whose target name is the secret's name, with no user name or comment.
    fn entry(&self, name: &SecretName) -> Result<Entry, SecretStoreError> {
        let modifiers = HashMap::from([
            ("target", name.as_str()),
            ("persistence", LOCAL_PERSISTENCE),
        ]);
        self.store
            .build(SERVICE, "", Some(&modifiers))
            .map_err(|_| SecretStoreError::Unavailable)
    }

    /// How Windows keeps a stored secret, such as `Local`; `None` when there is none.
    #[cfg(test)]
    fn persistence_of(&self, name: &SecretName) -> Option<String> {
        self.entry(name)
            .ok()?
            .get_attributes()
            .ok()?
            .remove("persistence")
    }
}

impl DeviceSecretStore for CredentialManagerSecrets {
    fn save(&self, name: &SecretName, secret: &[u8]) -> Result<(), SecretStoreError> {
        self.entry(name)?
            .set_secret(secret)
            .map_err(|_| SecretStoreError::Unavailable)
    }

    fn load(&self, name: &SecretName) -> Result<Option<Zeroizing<Vec<u8>>>, SecretStoreError> {
        match self.entry(name)?.get_secret() {
            Ok(secret) => Ok(Some(Zeroizing::new(secret))),
            Err(Error::NoEntry) => Ok(None),
            Err(_) => Err(SecretStoreError::Unavailable),
        }
    }

    fn delete(&self, name: &SecretName) -> Result<(), SecretStoreError> {
        match self.entry(name)?.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(_) => Err(SecretStoreError::Unavailable),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protected_notes::random_bytes;

    /// A name no real vault has, so the test never touches the user's own remembered sections.
    fn test_name() -> SecretName {
        let mut vault_id: [u8; 16] = random_bytes().unwrap();
        vault_id[0] = 0;
        SecretName::for_vault(&vault_id)
    }

    #[test]
    fn a_saved_secret_reads_back_is_local_to_this_pc_and_is_gone_after_delete() {
        let secrets = CredentialManagerSecrets::new().unwrap();
        let name = test_name();
        let secret = random_bytes::<32>().unwrap();

        secrets.save(&name, &secret).unwrap();
        let loaded = secrets.load(&name);
        let persistence = secrets.persistence_of(&name);
        secrets.delete(&name).unwrap();

        assert_eq!(
            loaded.unwrap().as_deref().map(Vec::as_slice),
            Some(&secret[..])
        );
        assert_eq!(persistence.as_deref(), Some(LOCAL_PERSISTENCE));
        assert_eq!(secrets.load(&name).unwrap(), None);
        assert_eq!(secrets.delete(&name), Ok(()));
    }
}
