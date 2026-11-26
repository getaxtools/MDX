use zeroize::Zeroizing;

use super::{KEY_BYTES, ProtectedError};

/// Random bytes from the operating system's generator; nothing is seeded in user space.
pub fn random_bytes<const LENGTH: usize>() -> Result<[u8; LENGTH], ProtectedError> {
    let mut bytes = [0_u8; LENGTH];
    getrandom::fill(&mut bytes).map_err(|_| ProtectedError::RandomUnavailable)?;
    Ok(bytes)
}

/// A new 256-bit key, wiped when dropped.
pub fn random_key() -> Result<Zeroizing<[u8; KEY_BYTES]>, ProtectedError> {
    let mut key = Zeroizing::new([0_u8; KEY_BYTES]);
    getrandom::fill(key.as_mut_slice()).map_err(|_| ProtectedError::RandomUnavailable)?;
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_keys_differ() {
        assert_ne!(*random_key().unwrap(), *random_key().unwrap());
        assert_ne!(random_bytes::<24>().unwrap(), random_bytes::<24>().unwrap());
    }
}
