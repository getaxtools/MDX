/// The picture formats an attachment may have, told from the bytes, never from the file name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageKind {
    Png,
    Jpeg,
    Gif,
    WebP,
    Svg,
}

const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
const JPEG_SIGNATURE: &[u8] = b"\xFF\xD8\xFF";
const GIF_SIGNATURES: [&[u8]; 2] = [b"GIF87a", b"GIF89a"];
const RIFF_SIGNATURE: &[u8] = b"RIFF";
const WEBP_SIGNATURE: &[u8] = b"WEBP";
const WEBP_SIGNATURE_OFFSET: usize = 8;
/// An SVG root normally comes after an XML declaration, a doctype or comments, all short.
const SVG_PROLOGUE_BYTES: usize = 1024;
const UTF8_BYTE_ORDER_MARK: &str = "\u{feff}";

impl ImageKind {
    pub fn of(bytes: &[u8]) -> Option<Self> {
        if bytes.starts_with(PNG_SIGNATURE) {
            return Some(Self::Png);
        }
        if bytes.starts_with(JPEG_SIGNATURE) {
            return Some(Self::Jpeg);
        }
        if GIF_SIGNATURES
            .iter()
            .any(|signature| bytes.starts_with(signature))
        {
            return Some(Self::Gif);
        }
        if is_webp(bytes) {
            return Some(Self::WebP);
        }
        is_svg(bytes).then_some(Self::Svg)
    }

    pub const fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Gif => "gif",
            Self::WebP => "webp",
            Self::Svg => "svg",
        }
    }
}

fn is_webp(bytes: &[u8]) -> bool {
    bytes.starts_with(RIFF_SIGNATURE)
        && bytes
            .get(WEBP_SIGNATURE_OFFSET..WEBP_SIGNATURE_OFFSET + WEBP_SIGNATURE.len())
            .is_some_and(|signature| signature == WEBP_SIGNATURE)
}

fn is_svg(bytes: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(bytes) else {
        return false;
    };
    let start = text.trim_start_matches(UTF8_BYTE_ORDER_MARK).trim_start();
    let prologue: String = start.chars().take(SVG_PROLOGUE_BYTES).collect();
    start.starts_with('<') && prologue.contains("<svg")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tells_pictures_from_their_first_bytes() {
        assert_eq!(
            ImageKind::of(b"\x89PNG\r\n\x1a\nrest"),
            Some(ImageKind::Png)
        );
        assert_eq!(
            ImageKind::of(b"\xFF\xD8\xFF\xE0rest"),
            Some(ImageKind::Jpeg)
        );
        assert_eq!(ImageKind::of(b"GIF89a..."), Some(ImageKind::Gif));
        assert_eq!(
            ImageKind::of(b"RIFF\0\0\0\0WEBPVP8 "),
            Some(ImageKind::WebP)
        );
        assert_eq!(
            ImageKind::of(b"<?xml version=\"1.0\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\"/>"),
            Some(ImageKind::Svg)
        );
    }

    #[test]
    fn refuses_a_renamed_executable_and_plain_text() {
        assert_eq!(ImageKind::of(b"MZ\x90\0\x03\0\0\0"), None);
        assert_eq!(ImageKind::of(b"Just text that mentions <svg later"), None);
    }
}
