mod note_files;
mod note_trash;

pub use note_files::{NotesRoot, create_note, create_note_in_folder, move_note, rename_note};
pub use note_trash::{TrashEntry, delete_note, empty_trash, list_trash, restore_note};
