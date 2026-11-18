mod attachment_store;
mod dropped_images;
mod image_kind;
mod picture_files;

pub use attachment_store::{MAX_ATTACHMENT_BYTES, attachment_stem, save_attachment_bytes};
pub use dropped_images::DroppedImages;
pub use image_kind::ImageKind;
pub use picture_files::{ChosenPictureOutcome, copy_chosen_pictures, read_picture_file};

/// Picture extensions a dropped file may have to be offered to the editor as an attachment, and
/// the ones the picture dialog shows.
pub const IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

pub fn is_image_path(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            IMAGE_EXTENSIONS
                .iter()
                .any(|image| image.eq_ignore_ascii_case(extension))
        })
}
