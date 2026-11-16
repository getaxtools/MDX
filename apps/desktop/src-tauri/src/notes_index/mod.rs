mod excluded_paths;
mod front_matter;
#[cfg(test)]
mod index_benchmark;
mod index_build;
mod index_store;
mod link_updates;
mod note_extraction;
mod note_links;
mod note_search;
mod notes_indexes;

pub use excluded_paths::ExcludedPaths;
pub use index_build::NoteChange;
pub use index_store::IndexError;
#[cfg(test)]
pub use link_updates::LinkEdit;
pub use link_updates::{
    LinkUpdatePlan, MAX_LINK_EDITS_PER_NOTE, MAX_LINK_TARGET_BYTES, MAX_LINK_UPDATE_NOTES,
    NotUpdatedNote, NotUpdatedReason, NoteLinkEdits, NoteMove, content_hash_of, with_edits_made,
};
pub use note_links::{Backlink, NoteHeading, NoteSuggestion, TagCount};
pub use note_search::NoteSearchResults;
pub use notes_indexes::{IndexEvent, NotesIndexes, NotesLocationToShow};
