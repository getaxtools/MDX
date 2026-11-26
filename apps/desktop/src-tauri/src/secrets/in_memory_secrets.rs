use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};

use zeroize::Zeroizing;

use super::{DeviceSecretStore, SecretName, SecretStoreError};

/// Secrets in memory, for command tests and the UI-test build; it can be made to fail like a store
/// that cannot be reached.
#[derive(Debug, Default)]
pub struct InMemoryDeviceSecrets {
    secrets: Mutex<HashMap<SecretName, Zeroizing<Vec<u8>>>>,
    is_unavailable: Mutex<bool>,
}

impl InMemoryDeviceSecrets {
    pub fn make_unavailable(&self) {
        *self
            .is_unavailable
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = true;
    }

    fn check_available(&self) -> Result<(), SecretStoreError> {
        if *self
            .is_unavailable
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
        {
            Err(SecretStoreError::Unavailable)
        } else {
            Ok(())
        }
    }
}

impl DeviceSecretStore for InMemoryDeviceSecrets {
    fn save(&self, name: &SecretName, secret: &[u8]) -> Result<(), SecretStoreError> {
        self.check_available()?;
        self.secrets
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(name.clone(), Zeroizing::new(secret.to_vec()));
        Ok(())
    }

    fn load(&self, name: &SecretName) -> Result<Option<Zeroizing<Vec<u8>>>, SecretStoreError> {
        self.check_available()?;
        Ok(self
            .secrets
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(name)
            .cloned())
    }

    fn delete(&self, name: &SecretName) -> Result<(), SecretStoreError> {
        self.check_available()?;
        self.secrets
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(name);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn name(byte: u8) -> SecretName {
        SecretName::for_vault(&[byte; 16])
    }

    #[test]
    fn saves_loads_and_deletes_a_secret() {
        let secrets = InMemoryDeviceSecrets::default();

        secrets.save(&name(1), b"device key").unwrap();

        assert_eq!(
            secrets
                .load(&name(1))
                .unwrap()
                .as_deref()
                .map(Vec::as_slice),
            Some(&b"device key"[..])
        );
        secrets.delete(&name(1)).unwrap();
        assert_eq!(secrets.load(&name(1)).unwrap(), None);
    }

    #[test]
    fn a_missing_secret_loads_as_none_and_deletes_quietly() {
        let secrets = InMemoryDeviceSecrets::default();

        assert_eq!(secrets.load(&name(2)).unwrap(), None);
        assert_eq!(secrets.delete(&name(2)), Ok(()));
    }

    #[test]
    fn an_unavailable_store_says_so() {
        let secrets = InMemoryDeviceSecrets::default();
        secrets.make_unavailable();

        assert_eq!(
            secrets.save(&name(3), b"x"),
            Err(SecretStoreError::Unavailable)
        );
        assert_eq!(secrets.load(&name(3)), Err(SecretStoreError::Unavailable));
    }
}
