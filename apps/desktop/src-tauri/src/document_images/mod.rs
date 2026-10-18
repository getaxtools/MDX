use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::http::{Request, Response, StatusCode, header};

use crate::documents::{DocumentAccessList, locate_document};

pub const IMAGE_PROTOCOL: &str = "mdx-image";
const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
const IMAGE_CONTENT_TYPES: [(&str, &str); 9] = [
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("avif", "image/avif"),
    ("bmp", "image/bmp"),
    ("ico", "image/x-icon"),
    ("svg", "image/svg+xml"),
];

/// Serves an image referenced by an open document, such as `![](images/diagram.png)`.
pub fn serve_image(
    request: &Request<Vec<u8>>,
    access: &Arc<DocumentAccessList>,
) -> Response<Vec<u8>> {
    let Some((document, source)) = image_request_of(request.uri().query().unwrap_or_default())
    else {
        return empty_response(StatusCode::BAD_REQUEST);
    };
    let Ok(location) = locate_document(Path::new(&document)) else {
        return empty_response(StatusCode::NOT_FOUND);
    };
    if !access.is_allowed(&location) {
        return empty_response(StatusCode::FORBIDDEN);
    }
    let Some(image_path) = image_path_for(&location.path(), &source) else {
        return empty_response(StatusCode::BAD_REQUEST);
    };
    read_image(&image_path)
}

fn image_request_of(query: &str) -> Option<(String, String)> {
    let mut document = None;
    let mut source = None;
    for (name, value) in form_urlencoded::parse(query.as_bytes()) {
        match name.as_ref() {
            "document" => document = Some(value.into_owned()),
            "source" => source = Some(value.into_owned()),
            _ => {}
        }
    }
    Some((document?, source?))
}

/// Resolves a relative image reference against the document's folder; only image files qualify.
fn image_path_for(document: &Path, source: &str) -> Option<PathBuf> {
    let without_suffix = source.split(['?', '#']).next().unwrap_or_default();
    let relative = Path::new(without_suffix);
    if without_suffix.is_empty() || relative.is_absolute() || relative.has_root() {
        return None;
    }
    let image_path = document.parent()?.join(relative);
    content_type_of(&image_path).map(|_| image_path)
}

fn content_type_of(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    IMAGE_CONTENT_TYPES
        .iter()
        .find(|(known, _)| *known == extension)
        .map(|(_, content_type)| *content_type)
}

fn read_image(image_path: &Path) -> Response<Vec<u8>> {
    let Ok(resolved) = dunce::canonicalize(image_path) else {
        return empty_response(StatusCode::NOT_FOUND);
    };
    let Some(content_type) = content_type_of(&resolved) else {
        return empty_response(StatusCode::FORBIDDEN);
    };
    let is_small_enough =
        fs::metadata(&resolved).is_ok_and(|metadata| metadata.len() <= MAX_IMAGE_BYTES);
    let bytes = if is_small_enough {
        fs::read(&resolved).ok()
    } else {
        None
    };
    let Some(bytes) = bytes else {
        return empty_response(StatusCode::NOT_FOUND);
    };
    Response::builder()
        .header(header::CONTENT_TYPE, content_type)
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(
            header::CONTENT_SECURITY_POLICY,
            "default-src 'none'; style-src 'unsafe-inline'",
        )
        .body(bytes)
        .unwrap_or_else(|_| empty_response(StatusCode::INTERNAL_SERVER_ERROR))
}

fn empty_response(status: StatusCode) -> Response<Vec<u8>> {
    let mut response = Response::new(Vec::new());
    *response.status_mut() = status;
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request_for(document: &Path, source: &str) -> Request<Vec<u8>> {
        let query = form_urlencoded::Serializer::new(String::new())
            .append_pair("document", &document.to_string_lossy())
            .append_pair("source", source)
            .finish();
        Request::builder()
            .uri(format!("http://mdx-image.localhost/?{query}"))
            .body(Vec::new())
            .unwrap()
    }

    fn folder_with_document() -> (tempfile::TempDir, PathBuf, Arc<DocumentAccessList>) {
        let folder = tempfile::tempdir().unwrap();
        let document = folder.path().join("guide.md");
        fs::write(&document, "![](images/diagram.png)").unwrap();
        fs::create_dir(folder.path().join("images")).unwrap();
        fs::write(
            folder.path().join("images").join("diagram.png"),
            [137, 80, 78, 71],
        )
        .unwrap();
        fs::write(folder.path().join("secret.txt"), "secret").unwrap();
        let access = Arc::new(DocumentAccessList::default());
        access.grant_folder(folder.path()).unwrap();
        (folder, document, access)
    }

    #[test]
    fn serves_an_image_next_to_an_open_document() {
        let (_folder, document, access) = folder_with_document();

        let response = serve_image(&request_for(&document, "images/diagram.png?v=2"), &access);

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_TYPE], "image/png");
        assert_eq!(
            response.headers()[header::X_CONTENT_TYPE_OPTIONS],
            "nosniff"
        );
        assert_eq!(response.body(), &vec![137, 80, 78, 71]);
    }

    #[test]
    fn refuses_files_that_are_not_images() {
        let (_folder, document, access) = folder_with_document();

        let response = serve_image(&request_for(&document, "secret.txt"), &access);

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn refuses_images_for_documents_the_user_has_not_opened() {
        let (_folder, document, _access) = folder_with_document();

        let response = serve_image(
            &request_for(&document, "images/diagram.png"),
            &Arc::new(DocumentAccessList::default()),
        );

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn reports_a_missing_image_as_not_found() {
        let (_folder, document, access) = folder_with_document();

        let response = serve_image(&request_for(&document, "images/missing.png"), &access);

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[cfg(windows)]
    #[test]
    fn rejects_absolute_sources_and_malformed_requests() {
        let document = Path::new(r"C:\Docs\guide.md");

        assert_eq!(image_path_for(document, r"C:\Windows\image.png"), None);
        assert_eq!(image_path_for(document, "/etc/image.png"), None);
        assert_eq!(image_path_for(document, ""), None);
        assert_eq!(image_request_of("document=a.md"), None);
    }

    #[cfg(windows)]
    #[test]
    fn resolves_images_in_parent_folders_relative_to_the_document() {
        let image = image_path_for(Path::new(r"C:\Docs\guide\intro.md"), "../images/logo.svg");

        assert_eq!(
            image,
            Some(PathBuf::from(r"C:\Docs\guide\../images/logo.svg"))
        );
    }
}
