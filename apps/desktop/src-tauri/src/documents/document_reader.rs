use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;

use encoding_rs::Encoding;

use super::text_decoding::{
    LineEnding, decode_document_bytes, decode_document_bytes_as, detect_line_ending,
};
use super::{DocumentAccessList, DocumentError, DocumentLocation, locate_document};

pub const MAX_DOCUMENT_BYTES: u64 = 50 * 1024 * 1024;
pub const MARKDOWN_EXTENSIONS: [&str; 5] = ["md", "markdown", "mdown", "mkd", "mdx"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedDocument {
    pub location: DocumentLocation,
    pub text: String,
    pub encoding: &'static str,
    pub has_byte_order_mark: bool,
    pub line_ending: LineEnding,
    pub modified_at_ms: u64,
}

pub fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| MARKDOWN_EXTENSIONS.contains(&extension.to_lowercase().as_str()))
}

pub fn open_allowed_document(
    path: &Path,
    access: &DocumentAccessList,
) -> Result<OpenedDocument, DocumentError> {
    let location = locate_document(path)?;
    if !access.is_allowed(&location) {
        return Err(DocumentError::AccessDenied);
    }
    read_located_document(location, None)
}

/// Opens a document decoded with the given encoding instead of the detected one.
pub fn open_allowed_document_as(
    path: &Path,
    access: &DocumentAccessList,
    encoding: &'static Encoding,
) -> Result<OpenedDocument, DocumentError> {
    let location = locate_document(path)?;
    if !access.is_allowed(&location) {
        return Err(DocumentError::AccessDenied);
    }
    read_located_document(location, Some(encoding))
}

fn read_located_document(
    location: DocumentLocation,
    chosen_encoding: Option<&'static Encoding>,
) -> Result<OpenedDocument, DocumentError> {
    let path = location.path();
    if !is_markdown_path(&path) {
        return Err(DocumentError::NotMarkdown);
    }
    let metadata = fs::metadata(&path)?;
    if !metadata.is_file() {
        return Err(DocumentError::NotMarkdown);
    }
    if metadata.len() > MAX_DOCUMENT_BYTES {
        return Err(DocumentError::TooLarge);
    }
    let bytes = fs::read(&path)?;
    let decoded = match chosen_encoding {
        Some(encoding) => decode_document_bytes_as(&bytes, encoding),
        None => decode_document_bytes(&bytes),
    };
    Ok(OpenedDocument {
        line_ending: detect_line_ending(&decoded.text),
        text: decoded.text,
        encoding: decoded.encoding,
        has_byte_order_mark: decoded.has_byte_order_mark,
        modified_at_ms: modified_at_ms(&metadata),
        location,
    })
}

fn modified_at_ms(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .and_then(|elapsed| u64::try_from(elapsed.as_millis()).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    fn folder_with(files: &[(&str, &[u8])]) -> (tempfile::TempDir, DocumentAccessList) {
        let folder = tempfile::tempdir().unwrap();
        for (name, content) in files {
            fs::write(folder.path().join(name), content).unwrap();
        }
        let access = DocumentAccessList::default();
        access.grant_folder(folder.path()).unwrap();
        (folder, access)
    }

    #[test]
    fn reopens_a_document_with_a_chosen_encoding() {
        let (folder, access) = folder_with(&[("Legacy.md", b"# Caf\xE9")]);

        let document = open_allowed_document_as(
            &folder.path().join("Legacy.md"),
            &access,
            encoding_rs::WINDOWS_1252,
        )
        .unwrap();

        assert_eq!(document.text, "# Café");
        assert_eq!(document.encoding, "windows-1252");
    }

    #[test]
    fn refuses_to_reopen_a_document_outside_granted_folders() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("a.md"), "# A").unwrap();

        let result = open_allowed_document_as(
            &folder.path().join("a.md"),
            &DocumentAccessList::default(),
            encoding_rs::UTF_8,
        );

        assert!(matches!(result, Err(DocumentError::AccessDenied)));
    }

    #[test]
    fn opens_a_document_inside_a_granted_folder() {
        let (folder, access) = folder_with(&[("Guide.md", b"# Guide\r\n")]);

        let document = open_allowed_document(&folder.path().join("Guide.md"), &access).unwrap();

        assert_eq!(document.text, "# Guide\r\n");
        assert_eq!(document.line_ending, LineEnding::Crlf);
        assert_eq!(document.location.file_name, "Guide.md");
        assert!(document.modified_at_ms > 0);
    }

    #[test]
    fn refuses_a_document_outside_granted_folders() {
        let (folder, _) = folder_with(&[("Guide.md", b"# Guide")]);

        let result = open_allowed_document(
            &folder.path().join("Guide.md"),
            &DocumentAccessList::default(),
        );

        assert_eq!(result.unwrap_err(), DocumentError::AccessDenied);
    }

    #[test]
    fn refuses_files_that_are_not_markdown() {
        let (folder, access) = folder_with(&[("notes.txt", b"plain")]);

        let result = open_allowed_document(&folder.path().join("notes.txt"), &access);

        assert_eq!(result.unwrap_err(), DocumentError::NotMarkdown);
    }

    #[test]
    fn refuses_a_folder_named_like_a_document() {
        let (folder, access) = folder_with(&[]);
        fs::create_dir(folder.path().join("folder.md")).unwrap();

        let result = open_allowed_document(&folder.path().join("folder.md"), &access);

        assert_eq!(result.unwrap_err(), DocumentError::NotMarkdown);
    }

    #[test]
    fn reports_a_missing_document() {
        let (folder, access) = folder_with(&[]);

        let result = open_allowed_document(&folder.path().join("missing.md"), &access);

        assert_eq!(result.unwrap_err(), DocumentError::NotFound);
    }

    #[test]
    fn recognizes_markdown_extensions_in_any_case() {
        assert!(is_markdown_path(Path::new("README.MD")));
        assert!(is_markdown_path(Path::new("notes.markdown")));
        assert!(!is_markdown_path(Path::new("script.js")));
        assert!(!is_markdown_path(Path::new("no-extension")));
    }
}
