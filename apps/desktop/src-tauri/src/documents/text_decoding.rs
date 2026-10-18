use chardetng::{EncodingDetector, Iso2022JpDetection, Utf8Detection};
use encoding_rs::Encoding;
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LineEnding {
    Lf,
    Crlf,
    Mixed,
}

#[derive(Debug, PartialEq, Eq)]
pub struct DecodedText {
    pub text: String,
    pub encoding: &'static str,
    pub has_byte_order_mark: bool,
}

pub fn decode_document_bytes(bytes: &[u8]) -> DecodedText {
    if let Some((encoding, byte_order_mark_length)) = Encoding::for_bom(bytes) {
        let content = bytes.get(byte_order_mark_length..).unwrap_or_default();
        return decode_with(encoding, content, true);
    }
    match std::str::from_utf8(bytes) {
        Ok(text) => DecodedText {
            text: text.to_owned(),
            encoding: encoding_rs::UTF_8.name(),
            has_byte_order_mark: false,
        },
        Err(_) => decode_with(guess_legacy_encoding(bytes), bytes, false),
    }
}

pub fn detect_line_ending(text: &str) -> LineEnding {
    let windows_line_endings = text.matches("\r\n").count();
    let unix_line_endings = text.matches('\n').count() - windows_line_endings;
    match (windows_line_endings > 0, unix_line_endings > 0) {
        (true, true) => LineEnding::Mixed,
        (true, false) => LineEnding::Crlf,
        _ => LineEnding::Lf,
    }
}

fn decode_with(
    encoding: &'static Encoding,
    content: &[u8],
    has_byte_order_mark: bool,
) -> DecodedText {
    let (text, _had_replacements) = encoding.decode_without_bom_handling(content);
    DecodedText {
        text: text.into_owned(),
        encoding: encoding.name(),
        has_byte_order_mark,
    }
}

fn guess_legacy_encoding(bytes: &[u8]) -> &'static Encoding {
    let mut detector = EncodingDetector::new(Iso2022JpDetection::Deny);
    detector.feed(bytes, true);
    detector.guess(None, Utf8Detection::Deny)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_plain_utf8_without_a_byte_order_mark() {
        let decoded = decode_document_bytes("# నమస్తే".as_bytes());

        assert_eq!(decoded.text, "# నమస్తే");
        assert_eq!(decoded.encoding, "UTF-8");
        assert!(!decoded.has_byte_order_mark);
    }

    #[test]
    fn strips_and_remembers_a_utf8_byte_order_mark() {
        let decoded = decode_document_bytes(b"\xEF\xBB\xBF# Title");

        assert_eq!(decoded.text, "# Title");
        assert!(decoded.has_byte_order_mark);
    }

    #[test]
    fn reads_utf16_little_endian_with_a_byte_order_mark() {
        let bytes: Vec<u8> = [0xFF, 0xFE]
            .into_iter()
            .chain("# हिन्दी".encode_utf16().flat_map(u16::to_le_bytes))
            .collect();

        let decoded = decode_document_bytes(&bytes);

        assert_eq!(decoded.text, "# हिन्दी");
        assert_eq!(decoded.encoding, "UTF-16LE");
    }

    #[test]
    fn detects_legacy_japanese_encoding() {
        let (shift_jis, _, _) =
            encoding_rs::SHIFT_JIS.encode("# 日本語のドキュメントです。これはテストです。");

        let decoded = decode_document_bytes(&shift_jis);

        assert_eq!(decoded.encoding, "Shift_JIS");
        assert_eq!(
            decoded.text,
            "# 日本語のドキュメントです。これはテストです。"
        );
    }

    #[test]
    fn keeps_combining_characters_exactly_as_written() {
        let decomposed = "Cafe\u{0301}";

        let decoded = decode_document_bytes(decomposed.as_bytes());

        assert_eq!(decoded.text, decomposed);
    }

    #[test]
    fn detects_line_endings() {
        assert_eq!(detect_line_ending("a\nb\n"), LineEnding::Lf);
        assert_eq!(detect_line_ending("a\r\nb\r\n"), LineEnding::Crlf);
        assert_eq!(detect_line_ending("a\r\nb\n"), LineEnding::Mixed);
        assert_eq!(detect_line_ending("single line"), LineEnding::Lf);
    }
}
