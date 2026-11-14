mod attachment_store;
mod dropped_images;
mod image_kind;

pub use attachment_store::{MAX_ATTACHMENT_BYTES, save_attachment_bytes};
pub use dropped_images::DroppedImages;
pub use image_kind::ImageKind;

/// Picture extensions a dropped file may have to be offered to the editor as an attachment.
const IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

pub fn is_image_path(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            IMAGE_EXTENSIONS
                .iter()
                .any(|image| image.eq_ignore_ascii_case(extension))
        })
}
