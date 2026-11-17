mod project_file;
mod project_link;
mod project_scan;
mod project_watch;
mod scan_pattern;

pub use project_file::{granted_project_documents, read_granted_project_file};
pub use project_link::follow_linked_folder;
#[cfg(test)]
pub(crate) use project_scan::tests as test_support;
pub use project_scan::{
    ChangedEntry, SpecProjectManifest, may_hold_project_files, scan_granted_project,
};
pub use project_watch::{WatchedProject, WatchedTree, watched_trees};
pub use scan_pattern::ScanPattern;
