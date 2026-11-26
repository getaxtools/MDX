mod folder_inspection;
mod known_folders;
mod location_marker;
mod notes_move;

pub use folder_inspection::{
    NotesFolderInspection, canonical_folder, inspect_folder, is_refused_place,
};
pub use known_folders::one_drive_folders;
pub use location_marker::{NOTES_APP_FOLDER, mark_location, read_marker};
pub use notes_move::*;

/// New Notes folders are made only here: directly in Documents, named like the default.
pub const DEFAULT_NOTES_FOLDER_NAME: &str = "MDX Notes";
