use super::ProtectedError;

const HEX_RADIX: u32 = 16;

/// Bytes as lowercase hexadecimal, as the vault file and note file names write them.
pub fn hex_of(bytes: &[u8]) -> String {
    bytes
        .iter()
        .flat_map(|byte| [byte >> 4, byte & 0x0F])
        .filter_map(|digit| char::from_digit(u32::from(digit), HEX_RADIX))
        .collect()
}

/// Exactly `LENGTH` bytes from lowercase hexadecimal; anything else is refused as damage.
pub fn bytes_of_hex<const LENGTH: usize>(text: &str) -> Result<[u8; LENGTH], ProtectedError> {
    let decoded = bytes_of_hex_text(text, LENGTH)?;
    decoded.try_into().map_err(|_| ProtectedError::Tampered)
}

/// Bytes from lowercase hexadecimal of at most `max_bytes` bytes.
pub fn bytes_of_hex_text(text: &str, max_bytes: usize) -> Result<Vec<u8>, ProtectedError> {
    let (pairs, rest) = text.as_bytes().as_chunks::<2>();
    if !rest.is_empty() || pairs.len() > max_bytes {
        return Err(ProtectedError::Tampered);
    }
    pairs
        .iter()
        .map(|[high, low]| Ok((digit_value(*high)? << 4) | digit_value(*low)?))
        .collect()
}

fn digit_value(digit: u8) -> Result<u8, ProtectedError> {
    match digit {
        b'0'..=b'9' => Ok(digit - b'0'),
        b'a'..=b'f' => Ok(digit - b'a' + 10),
        _ => Err(ProtectedError::Tampered),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_refuses_other_text() {
        assert_eq!(hex_of(&[0x00, 0xab, 0x7f]), "00ab7f");
        assert_eq!(bytes_of_hex::<3>("00ab7f"), Ok([0x00, 0xab, 0x7f]));
        for bad in ["00AB7F", "00ab7", "00ab7fff", "00ag7f", "00ab"] {
            assert_eq!(
                bytes_of_hex::<3>(bad),
                Err(ProtectedError::Tampered),
                "{bad}"
            );
        }
        assert_eq!(bytes_of_hex_text("0102", 2), Ok(vec![1, 2]));
        assert_eq!(
            bytes_of_hex_text("010203", 2),
            Err(ProtectedError::Tampered)
        );
    }
}
