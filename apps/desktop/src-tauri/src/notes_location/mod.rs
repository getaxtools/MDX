mod known_folders;
mod location_marker;

pub use known_folders::one_drive_folders;
pub use location_marker::{NOTES_APP_FOLDER, mark_location, read_marker};

/// New Notes folders are made only here: directly in Documents, named like the default.
pub const DEFAULT_NOTES_FOLDER_NAME: &str = "MDX Notes";
