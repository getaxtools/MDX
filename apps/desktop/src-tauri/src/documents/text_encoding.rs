use encoding_rs::{Encoding, UTF_8, UTF_16BE, UTF_16LE};

use super::DocumentError;

const UTF_8_BYTE_ORDER_MARK: [u8; 3] = [0xEF, 0xBB, 0xBF];
const UTF_16LE_BYTE_ORDER_MARK: [u8; 2] = [0xFF, 0xFE];
const UTF_16BE_BYTE_ORDER_MARK: [u8; 2] = [0xFE, 0xFF];

/// Encodes edited text the way the document was stored, so saving never changes its encoding or BOM.
pub fn encode_document_text(
    text: &str,
    encoding: &'static Encoding,
    has_byte_order_mark: bool,
) -> Result<Vec<u8>, DocumentError> {
    if encoding == UTF_8 {
        return Ok(with_mark(
            has_byte_order_mark,
            &UTF_8_BYTE_ORDER_MARK,
            text.as_bytes().to_vec(),
        ));
    }
    if encoding == UTF_16LE {
        let bytes = text.encode_utf16().flat_map(u16::to_le_bytes).collect();
        return Ok(with_mark(
            has_byte_order_mark,
            &UTF_16LE_BYTE_ORDER_MARK,
            bytes,
        ));
    }
    if encoding == UTF_16BE {
        let bytes = text.encode_utf16().flat_map(u16::to_be_bytes).collect();
        return Ok(with_mark(
            has_byte_order_mark,
            &UTF_16BE_BYTE_ORDER_MARK,
            bytes,
        ));
    }
    let (bytes, _, has_unmappable_characters) = encoding.encode(text);
    if has_unmappable_characters {
        return Err(DocumentError::CannotEncode);
    }
    Ok(bytes.into_owned())
}

fn with_mark(has_byte_order_mark: bool, mark: &[u8], bytes: Vec<u8>) -> Vec<u8> {
    if has_byte_order_mark {
        [mark, bytes.as_slice()].concat()
    } else {
        bytes
    }
}

#[cfg(test)]
mod tests {
    use encoding_rs::{SHIFT_JIS, WINDOWS_1252};

    use super::*;
    use crate::documents::text_decoding::decode_document_bytes;

    #[test]
    fn writes_utf8_with_or_without_a_byte_order_mark() {
        assert_eq!(
            encode_document_text("é", UTF_8, false),
            Ok(vec![0xC3, 0xA9])
        );
        assert_eq!(
            encode_document_text("é", UTF_8, true),
            Ok(vec![0xEF, 0xBB, 0xBF, 0xC3, 0xA9])
        );
    }

    #[test]
    fn writes_utf16_in_both_byte_orders() {
        assert_eq!(
            encode_document_text("a", UTF_16LE, true),
            Ok(vec![0xFF, 0xFE, 0x61, 0x00])
        );
        assert_eq!(
            encode_document_text("a", UTF_16BE, true),
            Ok(vec![0xFE, 0xFF, 0x00, 0x61])
        );
    }

    #[test]
    fn writes_legacy_code_pages() {
        assert_eq!(
            encode_document_text("café", WINDOWS_1252, false),
            Ok(b"caf\xE9".to_vec())
        );
    }

    #[test]
    fn refuses_characters_the_encoding_cannot_store() {
        assert_eq!(
            encode_document_text("✓", WINDOWS_1252, false),
            Err(DocumentError::CannotEncode)
        );
    }

    #[test]
    fn round_trips_with_the_decoder() {
        let text = "日本語のテキスト";

        let bytes = encode_document_text(text, SHIFT_JIS, false).unwrap();

        assert_eq!(decode_document_bytes(&bytes).text, text);
    }
}
