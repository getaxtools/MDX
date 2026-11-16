use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use percent_encoding::percent_decode_str;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::documents::{DocumentAccessList, DocumentError, is_markdown_path, locate_document};

const MAX_LINK_CHARACTERS: usize = 4_096;
const EXTERNAL_SCHEMES: [&str; 3] = ["http://", "https://", "mailto:"];

/// Resolves a link such as `../guide/intro.md` in an open document to the linked document's path.
#[tauri::command]
pub async fn resolve_document_link(
    document: String,
    href: String,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<String, DocumentError> {
    if href.chars().count() > MAX_LINK_CHARACTERS {
        return Err(DocumentError::InvalidRequest);
    }
    let access = Arc::clone(&access);
    tauri::async_runtime::spawn_blocking(move || linked_document(&document, &href, &access))
        .await
        .map_err(|_| DocumentError::Unreadable)?
}

/// Opens a web or mail link in the user's default browser or mail program.
#[tauri::command]
pub fn open_external_link(url: String, app: AppHandle) -> Result<(), DocumentError> {
    if !is_external_link(&url) {
        return Err(DocumentError::InvalidRequest);
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| DocumentError::InvalidRequest)
}

fn linked_document(
    document: &str,
    href: &str,
    access: &DocumentAccessList,
) -> Result<String, DocumentError> {
    let source = locate_document(Path::new(document))?;
    if !access.is_allowed(&source) {
        return Err(DocumentError::AccessDenied);
    }
    let target = linked_path(&source.path(), href).ok_or(DocumentError::InvalidRequest)?;
    if !is_markdown_path(&target) {
        return Err(DocumentError::NotMarkdown);
    }
    Ok(access.grant_folder_of(&target)?.display_path)
}

fn linked_path(document: &Path, href: &str) -> Option<PathBuf> {
    let without_suffix = href.split(['?', '#']).next().unwrap_or_default();
    let decoded = percent_decode_str(without_suffix).decode_utf8().ok()?;
    let relative = Path::new(decoded.as_ref());
    // `C:notes.md` is neither absolute nor rooted, yet joining it replaces the document's folder.
    let has_drive = relative
        .components()
        .any(|component| matches!(component, Component::Prefix(_)));
    if decoded.is_empty() || relative.is_absolute() || relative.has_root() || has_drive {
        return None;
    }
    Some(document.parent()?.join(relative))
}

/// Only addresses as the preview writes them, percent-encoded plain ASCII: Windows hands the address
/// to the browser or mail program on a command line, where spaces and quotes start new arguments.
fn is_external_link(url: &str) -> bool {
    url.chars().count() <= MAX_LINK_CHARACTERS
        && url.chars().all(is_safe_address_character)
        && EXTERNAL_SCHEMES.iter().any(|scheme| {
            url.get(..scheme.len())
                .is_some_and(|prefix| prefix.eq_ignore_ascii_case(scheme))
        })
}

fn is_safe_address_character(character: char) -> bool {
    character.is_ascii_graphic() && !matches!(character, '"' | '<' | '>' | '`' | '\\')
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    fn folder_with_documents() -> (tempfile::TempDir, String, DocumentAccessList) {
        let folder = tempfile::tempdir().unwrap();
        fs::create_dir(folder.path().join("guide")).unwrap();
        fs::write(
            folder.path().join("guide").join("intro.md"),
            "[Next](next%20steps.md)",
        )
        .unwrap();
        fs::write(folder.path().join("guide").join("next steps.md"), "# Next").unwrap();
        fs::write(folder.path().join("overview.md"), "# Overview").unwrap();
        fs::write(folder.path().join("notes.txt"), "plain").unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(&folder.path().join("guide")).unwrap();
        let intro = folder
            .path()
            .join("guide")
            .join("intro.md")
            .to_string_lossy()
            .into_owned();
        (folder, intro, access)
    }

    #[test]
    fn resolves_an_encoded_link_next_to_the_document() {
        let (_folder, intro, access) = folder_with_documents();

        let linked = linked_document(&intro, "next%20steps.md#install", &access).unwrap();

        assert!(linked.ends_with("next steps.md"));
    }

    #[test]
    fn opens_a_linked_document_in_a_parent_folder_and_grants_its_folder() {
        let (_folder, intro, access) = folder_with_documents();

        let linked = linked_document(&intro, "../overview.md", &access).unwrap();

        assert!(linked.ends_with("overview.md"));
        assert!(access.is_allowed(&locate_document(Path::new(&linked)).unwrap()));
    }

    #[test]
    fn refuses_links_to_files_that_are_not_markdown() {
        let (_folder, intro, access) = folder_with_documents();

        assert_eq!(
            linked_document(&intro, "../notes.txt", &access),
            Err(DocumentError::NotMarkdown)
        );
    }

    #[test]
    fn refuses_links_from_documents_the_user_has_not_opened() {
        let (_folder, intro, _access) = folder_with_documents();

        assert_eq!(
            linked_document(&intro, "next%20steps.md", &DocumentAccessList::default()),
            Err(DocumentError::AccessDenied)
        );
    }

    #[test]
    fn accepts_only_web_and_mail_links_as_external() {
        assert!(is_external_link("https://example.com/page"));
        assert!(is_external_link("MAILTO:someone@example.com"));
        assert!(!is_external_link("file:///C:/Windows/system.ini"));
        assert!(!is_external_link("javascript:alert(1)"));
        assert!(!is_external_link("ms-settings:privacy"));
    }

    #[test]
    fn refuses_external_links_with_spaces_quotes_or_control_characters() {
        assert!(!is_external_link(r#"https://a.com/" -new-window "C:/x"#));
        assert!(!is_external_link(r#"mailto:a@b.com?x=" /a "C:\secret.txt"#));
        assert!(!is_external_link("https://a.com/\tx"));
        assert!(!is_external_link("https://a.com/\u{202E}gpj.md"));
        assert!(!is_external_link("https://\u{430}pple.com/login"));
        assert!(!is_external_link("https://a.com/<script>"));
        assert!(is_external_link(
            "https://a.com/%22%20-new-window%20%22C:/x"
        ));
        assert!(is_external_link("https://xn--pple-43d.com/login"));
    }

    #[test]
    fn refuses_a_drive_relative_link() {
        let document = Path::new(r"C:\docs\guide.md");

        assert_eq!(linked_path(document, "C%3Anotes.md"), None);
        assert_eq!(linked_path(document, "D:notes.md"), None);
        assert_eq!(
            linked_path(document, "notes.md"),
            Some(PathBuf::from(r"C:\docs\notes.md"))
        );
    }
}
