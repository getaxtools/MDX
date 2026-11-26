use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use percent_encoding::percent_decode_str;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use serde::Serialize;

use crate::documents::{
    DocumentAccessList, DocumentError, DocumentLocation, canonical_key_of, is_markdown_path,
    locate_document,
};

const MAX_LINK_CHARACTERS: usize = 4_096;
const EXTERNAL_SCHEMES: [&str; 3] = ["http://", "https://", "mailto:"];

/// Resolves a link such as `../guide/intro.md` in an open document to the linked document's path and
/// grants its folder. With `expected_target`, the link must still lead to that document, the one the user
/// was asked about.
#[tauri::command]
pub async fn resolve_document_link(
    document: String,
    href: String,
    expected_target: Option<String>,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<String, DocumentError> {
    if href.chars().count() > MAX_LINK_CHARACTERS {
        return Err(DocumentError::InvalidRequest);
    }
    let access = Arc::clone(&access);
    tauri::async_runtime::spawn_blocking(move || {
        linked_document(&document, &href, expected_target.as_deref(), &access)
    })
    .await
    .map_err(|_| DocumentError::Unreadable)?
}

/// Where a link of an open document really leads, and whether the app may read it already.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectedLink {
    pub path: String,
    pub is_granted: bool,
}

/// Resolves a link the way `resolve_document_link` does, through any links on the way, but grants nothing,
/// so the window can ask before a document outside the granted folders is opened.
#[tauri::command]
pub async fn inspect_document_link(
    document: String,
    href: String,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<InspectedLink, DocumentError> {
    if href.chars().count() > MAX_LINK_CHARACTERS {
        return Err(DocumentError::InvalidRequest);
    }
    let access = Arc::clone(&access);
    tauri::async_runtime::spawn_blocking(move || inspected_link(&document, &href, &access))
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

fn linked_location(
    document: &str,
    href: &str,
    access: &DocumentAccessList,
) -> Result<DocumentLocation, DocumentError> {
    let source = locate_document(Path::new(document))?;
    if !access.is_allowed(&source) {
        return Err(DocumentError::AccessDenied);
    }
    let target = linked_path(&source.path(), href).ok_or(DocumentError::InvalidRequest)?;
    if !is_markdown_path(&target) {
        return Err(DocumentError::NotMarkdown);
    }
    let location = locate_document(&target)?;
    if !is_markdown_path(&location.path()) {
        return Err(DocumentError::NotMarkdown);
    }
    Ok(location)
}

fn inspected_link(
    document: &str,
    href: &str,
    access: &DocumentAccessList,
) -> Result<InspectedLink, DocumentError> {
    let location = linked_location(document, href, access)?;
    Ok(InspectedLink {
        is_granted: access.is_allowed(&location),
        path: location.display_path,
    })
}

fn linked_document(
    document: &str,
    href: &str,
    expected_target: Option<&str>,
    access: &DocumentAccessList,
) -> Result<String, DocumentError> {
    let location = linked_location(document, href, access)?;
    let is_other_target = expected_target
        .is_some_and(|expected| canonical_key_of(expected) != location.canonical_key);
    if is_other_target {
        return Err(DocumentError::InvalidRequest);
    }
    access.grant_linked_document(&location);
    Ok(location.display_path)
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

        let linked = linked_document(&intro, "next%20steps.md#install", None, &access).unwrap();

        assert!(linked.ends_with("next steps.md"));
    }

    #[test]
    fn opens_a_linked_document_in_a_parent_folder_and_grants_its_folder() {
        let (_folder, intro, access) = folder_with_documents();

        let linked = linked_document(&intro, "../overview.md", None, &access).unwrap();

        assert!(linked.ends_with("overview.md"));
        assert!(access.is_allowed(&locate_document(Path::new(&linked)).unwrap()));
    }

    #[test]
    fn refuses_links_to_files_that_are_not_markdown() {
        let (_folder, intro, access) = folder_with_documents();

        assert_eq!(
            linked_document(&intro, "../notes.txt", None, &access),
            Err(DocumentError::NotMarkdown)
        );
    }

    #[test]
    fn refuses_links_from_documents_the_user_has_not_opened() {
        let (_folder, intro, _access) = folder_with_documents();

        assert_eq!(
            linked_document(
                &intro,
                "next%20steps.md",
                None,
                &DocumentAccessList::default()
            ),
            Err(DocumentError::AccessDenied)
        );
    }

    #[test]
    fn inspecting_a_link_through_a_folder_link_names_its_real_target_and_grants_nothing() {
        let (folder, intro, access) = folder_with_documents();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("plan.md"), "# Plan").unwrap();
        crate::spec_projects::test_support::link_folder(
            &folder.path().join("guide").join("shared"),
            outside.path(),
        );
        let outside_plan = locate_document(&outside.path().join("plan.md")).unwrap();

        let inspected = inspected_link(&intro, "shared/plan.md", &access).unwrap();

        assert_eq!(
            inspected,
            InspectedLink {
                path: outside_plan.display_path.clone(),
                is_granted: false
            }
        );
        assert!(!access.is_allowed(&outside_plan));
        assert!(
            inspected_link(&intro, "next%20steps.md", &access)
                .unwrap()
                .is_granted
        );
    }

    #[test]
    fn inspecting_an_encoded_climb_reports_the_folder_it_leaves_for() {
        let (folder, intro, access) = folder_with_documents();

        let inspected = inspected_link(&intro, "%2E%2E/overview.md", &access).unwrap();

        assert!(!inspected.is_granted);
        assert_eq!(
            inspected.path,
            locate_document(&folder.path().join("overview.md"))
                .unwrap()
                .display_path
        );
    }

    #[test]
    fn refuses_rooted_shared_and_file_links() {
        let (_folder, intro, access) = folder_with_documents();

        for href in [
            "//server/share/plan.md",
            "\\\\server\\share\\plan.md",
            "/plan.md",
            "C:/plan.md",
        ] {
            assert_eq!(
                inspected_link(&intro, href, &access),
                Err(DocumentError::InvalidRequest),
                "{href}"
            );
        }
        assert!(inspected_link(&intro, "file:///C:/plan.md", &access).is_err());
    }

    #[test]
    fn opens_an_asked_about_link_only_while_it_leads_to_the_same_document() {
        let (folder, intro, access) = folder_with_documents();
        let overview = locate_document(&folder.path().join("overview.md")).unwrap();
        let next = locate_document(&folder.path().join("guide").join("next steps.md")).unwrap();

        assert_eq!(
            linked_document(&intro, "../overview.md", Some(&next.display_path), &access),
            Err(DocumentError::InvalidRequest)
        );
        assert!(!access.is_allowed(&overview));
        let opened = linked_document(
            &intro,
            "../overview.md",
            Some(&overview.display_path),
            &access,
        );
        assert_eq!(opened, Ok(overview.display_path.clone()));
        assert!(access.is_allowed(&overview));
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
