use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

use super::{KEY_BYTES, ProtectedError};

/// Crockford's base32 alphabet: no I, L, O or U, so the key reads back without confusion.
const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const BITS_PER_CHARACTER: usize = 5;
/// 256 bits need 52 characters; two more hold a check of 10 bits.
const KEY_CHARACTERS: usize = 52;
const CHECK_CHARACTERS: usize = 2;
const GROUP_CHARACTERS: usize = 4;
const CHECK_CONTEXT: &[u8] = b"mdx-protected-v1-recovery-check";

/// The recovery key as the user sees it once: 13 groups of 4 characters and a 2-character check,
/// such as `7K3Q-M9XD-...-4F`.
pub fn recovery_key_text(key: &[u8; KEY_BYTES]) -> Zeroizing<String> {
    let mut characters = Zeroizing::new(Vec::with_capacity(KEY_CHARACTERS + CHECK_CHARACTERS));
    characters.extend(base32_characters(key, KEY_CHARACTERS));
    characters.extend(check_characters(key));
    let mut text = Zeroizing::new(String::with_capacity(
        characters.len() + characters.len() / GROUP_CHARACTERS,
    ));
    for (index, character) in characters.iter().enumerate() {
        if index > 0 && index % GROUP_CHARACTERS == 0 {
            text.push('-');
        }
        text.push(char::from(*character));
    }
    text
}

/// The key from its text, typed in any case, with or without dashes and spaces, with `I` and `L` read
/// as `1` and `O` as `0`. A wrong check means a mistyped key, which is said as a wrong key.
pub fn recovery_key_from_text(text: &str) -> Result<Zeroizing<[u8; KEY_BYTES]>, ProtectedError> {
    let values: Zeroizing<Vec<u8>> = Zeroizing::new(
        text.chars()
            .filter(|character| !matches!(character, '-' | ' '))
            .map(value_of)
            .collect::<Result<_, _>>()?,
    );
    if values.len() != KEY_CHARACTERS + CHECK_CHARACTERS {
        return Err(ProtectedError::WrongKey);
    }
    let (key_values, check_values) = values.split_at(KEY_CHARACTERS);
    let mut key = Zeroizing::new([0_u8; KEY_BYTES]);
    let mut accumulator: u32 = 0;
    let mut bits = 0;
    let mut written = 0;
    for value in key_values {
        accumulator = ((accumulator << BITS_PER_CHARACTER) | u32::from(*value)) & 0xFFFF;
        bits += BITS_PER_CHARACTER;
        if bits >= 8 {
            bits -= 8;
            if let Some(byte) = key.get_mut(written) {
                *byte = u8::try_from((accumulator >> bits) & 0xFF).unwrap_or_default();
            }
            written += 1;
        }
    }
    let expected: Vec<u8> = check_characters(&key)
        .iter()
        .filter_map(|character| value_of(char::from(*character)).ok())
        .collect();
    if expected != check_values {
        return Err(ProtectedError::WrongKey);
    }
    Ok(key)
}

fn base32_characters(bytes: &[u8], count: usize) -> Vec<u8> {
    let mut characters = Vec::with_capacity(count);
    let mut accumulator: u32 = 0;
    let mut bits = 0;
    for byte in bytes {
        accumulator = ((accumulator << 8) | u32::from(*byte)) & 0xFFFF;
        bits += 8;
        while bits >= BITS_PER_CHARACTER {
            bits -= BITS_PER_CHARACTER;
            characters.push(alphabet_at((accumulator >> bits) & 0x1F));
        }
    }
    if bits > 0 {
        characters.push(alphabet_at(
            (accumulator << (BITS_PER_CHARACTER - bits)) & 0x1F,
        ));
    }
    characters.truncate(count);
    characters
}

/// Ten bits of a hash of the key, as two characters.
fn check_characters(key: &[u8; KEY_BYTES]) -> [u8; CHECK_CHARACTERS] {
    let digest = Sha256::new()
        .chain_update(CHECK_CONTEXT)
        .chain_update(key)
        .finalize();
    let check = digest
        .iter()
        .take(2)
        .fold(0_u32, |value, byte| (value << 8) | u32::from(*byte))
        >> 6;
    [
        alphabet_at((check >> BITS_PER_CHARACTER) & 0x1F),
        alphabet_at(check & 0x1F),
    ]
}

fn alphabet_at(value: u32) -> u8 {
    usize::try_from(value)
        .ok()
        .and_then(|index| ALPHABET.get(index))
        .copied()
        .unwrap_or(b'0')
}

fn value_of(character: char) -> Result<u8, ProtectedError> {
    let normalized = match character.to_ascii_uppercase() {
        'I' | 'L' => '1',
        'O' => '0',
        other => other,
    };
    ALPHABET
        .iter()
        .position(|letter| char::from(*letter) == normalized)
        .and_then(|position| u8::try_from(position).ok())
        .ok_or(ProtectedError::WrongKey)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protected_notes::random_key;

    #[test]
    fn shows_thirteen_groups_of_four_and_a_check_and_reads_back() {
        let key = random_key().unwrap();

        let text = recovery_key_text(&key);

        let groups: Vec<&str> = text.split('-').collect();
        assert_eq!(groups.len(), 14);
        assert!(groups[..13].iter().all(|group| group.len() == 4));
        assert_eq!(groups[13].len(), 2);
        assert_eq!(*recovery_key_from_text(&text).unwrap(), *key);
    }

    #[test]
    fn reads_a_key_typed_in_lowercase_without_dashes_and_with_look_alike_letters() {
        let key = [0_u8; KEY_BYTES];
        let text = recovery_key_text(&key);
        let typed = text.replace('-', " ").to_lowercase().replace('0', "o");

        assert_eq!(*recovery_key_from_text(&typed).unwrap(), key);
    }

    #[test]
    fn a_mistyped_key_is_refused() {
        let key = [7_u8; KEY_BYTES];
        let text = recovery_key_text(&key);
        let first = text.chars().next().unwrap();
        let other = if first == '2' { '3' } else { '2' };
        let mistyped: String = std::iter::once(other).chain(text.chars().skip(1)).collect();

        assert_eq!(
            recovery_key_from_text(&mistyped).map(|_| ()),
            Err(ProtectedError::WrongKey)
        );
        assert_eq!(
            recovery_key_from_text("ABCD").map(|_| ()),
            Err(ProtectedError::WrongKey)
        );
        assert_eq!(
            recovery_key_from_text(&format!("{}U", text.as_str())).map(|_| ()),
            Err(ProtectedError::WrongKey)
        );
    }
}
