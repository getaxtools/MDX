use std::time::Duration;

use argon2::{Algorithm, Argon2, Block, Params, Version};
use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;
use zeroize::Zeroizing;

use super::{KEY_BYTES, ProtectedError};

/// Each password gets a new 32-byte salt, more than the 16 bytes RFC 9106 asks for.
pub const PASSWORD_SALT_BYTES: usize = 32;
/// NFC can make a text at most three times as long, so the buffer is made once at its final size and
/// no copy of the password is left behind by a reallocation.
const NFC_GROWTH: usize = 3;
const KIB_PER_MIB: u32 = 1_024;
const ALGORITHM: Algorithm = Algorithm::Argon2id;
const VERSION: Version = Version::V0x13;

/// Argon2id settings, stored with the vault and bound into the password slot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KdfParameters {
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

impl KdfParameters {
    /// 64 MiB and three passes, the second recommendation of RFC 9106 for machines short of memory.
    pub const DEFAULT: Self = Self::new(64 * KIB_PER_MIB, 3, 1);
    /// 19 MiB and two passes; nothing weaker is ever written.
    pub const FLOOR: Self = Self::new(19 * KIB_PER_MIB, 2, 1);
    /// 1 GiB, 16 passes and 8 lanes; a vault asking for more is refused, so a crafted file cannot
    /// freeze the PC or exhaust its memory.
    pub const CEILING: Self = Self::new(KIB_PER_MIB * KIB_PER_MIB, 16, 8);
    /// What calibration tries after the default, strongest first.
    const STEPS_DOWN: [Self; 4] = [
        Self::new(64 * KIB_PER_MIB, 2, 1),
        Self::new(46 * KIB_PER_MIB, 2, 1),
        Self::new(32 * KIB_PER_MIB, 2, 1),
        Self::FLOOR,
    ];

    const fn new(memory_kib: u32, iterations: u32, parallelism: u32) -> Self {
        Self {
            memory_kib,
            iterations,
            parallelism,
        }
    }

    /// Settings for a new password slot: at least the floor and within the ceiling.
    pub fn checked_for_writing(self) -> Result<Self, ProtectedError> {
        let is_below_floor = self.memory_kib < Self::FLOOR.memory_kib
            || self.iterations < Self::FLOOR.iterations
            || self.parallelism < Self::FLOOR.parallelism;
        if is_below_floor {
            return Err(ProtectedError::WeakKeyDerivation);
        }
        self.checked_for_reading()
    }

    /// Settings read from a vault: within the ceiling. Weaker settings than the floor still open an
    /// older vault, as they are bound into its slot and cannot be lowered by editing the file.
    pub fn checked_for_reading(self) -> Result<Self, ProtectedError> {
        let is_above_ceiling = self.memory_kib > Self::CEILING.memory_kib
            || self.iterations > Self::CEILING.iterations
            || self.parallelism > Self::CEILING.parallelism;
        if is_above_ceiling {
            return Err(ProtectedError::ExcessiveKeyDerivation);
        }
        Ok(self)
    }

    /// The settings as bytes, for the associated data of the password slot.
    pub fn to_bytes(self) -> [u8; 12] {
        let mut bytes = self
            .memory_kib
            .to_be_bytes()
            .into_iter()
            .chain(self.iterations.to_be_bytes())
            .chain(self.parallelism.to_be_bytes());
        std::array::from_fn(|_| bytes.next().unwrap_or_default())
    }
}

/// The key a password gives with these settings and salt. The password is NFC-normalized first, so
/// the same password typed in another Unicode form opens the notes too.
pub fn derive_password_key(
    password: &str,
    salt: &[u8; PASSWORD_SALT_BYTES],
    parameters: KdfParameters,
) -> Result<Zeroizing<[u8; KEY_BYTES]>, ProtectedError> {
    let parameters = parameters.checked_for_reading()?;
    let argon_parameters = Params::new(
        parameters.memory_kib,
        parameters.iterations,
        parameters.parallelism,
        Some(KEY_BYTES),
    )
    .map_err(|_| ProtectedError::KeyDerivationFailed)?;
    let mut normalized = Zeroizing::new(String::with_capacity(password.len() * NFC_GROWTH));
    normalized.extend(password.nfc());
    let mut working_memory = Zeroizing::new(working_memory_of(&argon_parameters)?);
    let mut key = Zeroizing::new([0_u8; KEY_BYTES]);
    Argon2::new(ALGORITHM, VERSION, argon_parameters)
        .hash_password_into_with_memory(
            normalized.as_bytes(),
            salt,
            key.as_mut_slice(),
            working_memory.as_mut_slice(),
        )
        .map_err(|_| ProtectedError::KeyDerivationFailed)?;
    Ok(key)
}

/// Argon2's working memory, asked for without aborting when the PC has too little, and wiped when
/// dropped along with what the password filled it with.
fn working_memory_of(parameters: &Params) -> Result<Vec<Block>, ProtectedError> {
    let block_count = parameters.block_count();
    let mut blocks = Vec::new();
    blocks
        .try_reserve_exact(block_count)
        .map_err(|_| ProtectedError::NotEnoughMemory)?;
    blocks.resize(block_count, Block::default());
    Ok(blocks)
}

/// The strongest settings whose measured time stays within the budget, trying the default first and
/// never going below the floor. `time_of` runs the key derivation once with the given settings.
pub fn calibrate(
    budget: Duration,
    mut time_of: impl FnMut(KdfParameters) -> Duration,
) -> KdfParameters {
    std::iter::once(KdfParameters::DEFAULT)
        .chain(KdfParameters::STEPS_DOWN)
        .find(|parameters| time_of(*parameters) <= budget)
        .unwrap_or(KdfParameters::FLOOR)
}

#[cfg(test)]
mod tests {
    use std::time::Instant;

    use super::*;

    const SALT: [u8; PASSWORD_SALT_BYTES] = [7; PASSWORD_SALT_BYTES];
    /// Small settings so the tests that do not measure time stay quick.
    const QUICK: KdfParameters = KdfParameters::new(64, 1, 1);
    const CALIBRATION_BUDGET: Duration = Duration::from_millis(1_500);

    #[test]
    fn the_same_password_in_two_unicode_forms_gives_the_same_key() {
        let composed = "caf\u{e9} au lait";
        let decomposed = "cafe\u{301} au lait";

        assert_eq!(
            *derive_password_key(composed, &SALT, QUICK).unwrap(),
            *derive_password_key(decomposed, &SALT, QUICK).unwrap()
        );
        assert_ne!(
            *derive_password_key(composed, &SALT, QUICK).unwrap(),
            *derive_password_key("cafe au lait", &SALT, QUICK).unwrap()
        );
    }

    #[test]
    fn the_salt_and_the_settings_change_the_key() {
        let key = derive_password_key("correct horse", &SALT, QUICK).unwrap();

        assert_ne!(
            *key,
            *derive_password_key("correct horse", &[8; PASSWORD_SALT_BYTES], QUICK).unwrap()
        );
        assert_ne!(
            *key,
            *derive_password_key("correct horse", &SALT, KdfParameters::new(64, 2, 1)).unwrap()
        );
    }

    #[test]
    fn the_algorithm_and_version_give_the_argon2id_test_vector_of_rfc_9106() {
        // RFC 9106 section 5.3: the vector uses a secret and associated data, which the vault does not;
        // it pins that the algorithm and version this module uses are Argon2id 1.3.
        let parameters = argon2::ParamsBuilder::new()
            .m_cost(32)
            .t_cost(3)
            .p_cost(4)
            .data(argon2::AssociatedData::new(&[0x04; 12]).unwrap())
            .output_len(32)
            .build()
            .unwrap();
        let context = Argon2::new_with_secret(&[0x03; 8], ALGORITHM, VERSION, parameters).unwrap();
        let mut tag = [0_u8; 32];

        context
            .hash_password_into(&[0x01; 32], &[0x02; 16], &mut tag)
            .unwrap();

        assert_eq!(
            tag,
            [
                0x0d, 0x64, 0x0d, 0xf5, 0x8d, 0x78, 0x76, 0x6c, 0x08, 0xc0, 0x37, 0xa3, 0x4a, 0x8b,
                0x53, 0xc9, 0xd0, 0x1e, 0xf0, 0x45, 0x2d, 0x75, 0xb6, 0x5e, 0xb5, 0x25, 0x20, 0xe9,
                0x6b, 0x01, 0xe6, 0x59,
            ]
        );
    }

    #[test]
    fn refuses_to_write_settings_below_the_floor() {
        assert_eq!(
            KdfParameters::new(19 * KIB_PER_MIB - 1, 2, 1).checked_for_writing(),
            Err(ProtectedError::WeakKeyDerivation)
        );
        assert_eq!(
            KdfParameters::new(64 * KIB_PER_MIB, 1, 1).checked_for_writing(),
            Err(ProtectedError::WeakKeyDerivation)
        );
        assert!(KdfParameters::FLOOR.checked_for_writing().is_ok());
        assert!(KdfParameters::DEFAULT.checked_for_writing().is_ok());
    }

    #[test]
    fn refuses_to_read_settings_above_the_ceiling() {
        for too_much in [
            KdfParameters::new(KIB_PER_MIB * KIB_PER_MIB + 1, 3, 1),
            KdfParameters::new(64 * KIB_PER_MIB, 17, 1),
            KdfParameters::new(64 * KIB_PER_MIB, 3, 9),
        ] {
            assert_eq!(
                too_much.checked_for_reading(),
                Err(ProtectedError::ExcessiveKeyDerivation)
            );
            assert_eq!(
                derive_password_key("x", &SALT, too_much).map(|_| ()),
                Err(ProtectedError::ExcessiveKeyDerivation)
            );
        }
    }

    #[test]
    fn calibration_steps_down_until_the_budget_is_met_and_never_below_the_floor() {
        let slow_above_32_mib = |parameters: KdfParameters| {
            if parameters.memory_kib > 32 * KIB_PER_MIB {
                Duration::from_secs(3)
            } else {
                Duration::from_millis(500)
            }
        };

        assert_eq!(
            calibrate(CALIBRATION_BUDGET, slow_above_32_mib),
            KdfParameters::new(32 * KIB_PER_MIB, 2, 1)
        );
        assert_eq!(
            calibrate(CALIBRATION_BUDGET, |_| Duration::from_secs(9)),
            KdfParameters::FLOOR
        );
        assert_eq!(
            calibrate(CALIBRATION_BUDGET, |_| Duration::ZERO),
            KdfParameters::DEFAULT
        );
    }

    #[test]
    fn calibration_on_this_pc_chooses_settings_that_unlock_within_the_budget() {
        let time_of = |parameters: KdfParameters| {
            let started = Instant::now();
            let _ = derive_password_key("correct horse battery staple", &SALT, parameters);
            started.elapsed()
        };

        let chosen = calibrate(CALIBRATION_BUDGET, time_of);

        assert!(chosen.checked_for_writing().is_ok());
        assert!(time_of(chosen) <= CALIBRATION_BUDGET, "{chosen:?}");
    }

    #[test]
    fn invalid_settings_fail_as_such_and_not_as_a_wrong_password() {
        for invalid in [
            KdfParameters::new(64, 1, 0),
            KdfParameters::new(32, 1, 8),
            KdfParameters::new(64, 0, 1),
        ] {
            assert_eq!(
                derive_password_key("correct horse", &SALT, invalid).map(|_| ()),
                Err(ProtectedError::KeyDerivationFailed),
                "{invalid:?}"
            );
        }
    }

    #[test]
    fn settings_are_bound_as_twelve_big_endian_bytes() {
        assert_eq!(
            KdfParameters::new(0x0102_0304, 5, 6).to_bytes(),
            [1, 2, 3, 4, 0, 0, 0, 5, 0, 0, 0, 6]
        );
    }
}
