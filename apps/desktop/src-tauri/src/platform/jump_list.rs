use std::io;
#[cfg(windows)]
use std::sync::{Mutex, PoisonError};

/// A recent workspace as a Jump List entry: its title and the arguments that show it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JumpListLink {
    pub title: String,
    pub arguments: String,
}

/// What became of a Jump List update.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JumpListResult {
    Written,
    /// A privacy setting blocks custom lists: only the tasks were written, so no entry stays.
    RefusedByPrivacySetting,
    /// This system has no Jump List.
    #[cfg(not(windows))]
    Unavailable,
}

/// Each window updates the Jump List; one update at a time keeps the last one the one shown.
#[cfg(windows)]
static JUMP_LIST_UPDATE: Mutex<()> = Mutex::new(());

/// Replaces the app's custom Jump List category with these links; gives back the arguments of the
/// links the user removed, which are not added again.
#[cfg(windows)]
pub fn show_jump_list_category(
    category: &str,
    links: &[JumpListLink],
) -> io::Result<(JumpListResult, Vec<String>)> {
    let entries: Vec<mdx_native_windows::JumpListEntry> = links
        .iter()
        .map(|link| mdx_native_windows::JumpListEntry {
            title: link.title.clone(),
            arguments: link.arguments.clone(),
        })
        .collect();
    let _one_at_a_time = JUMP_LIST_UPDATE
        .lock()
        .unwrap_or_else(PoisonError::into_inner);
    let update = mdx_native_windows::show_jump_list_category(category, &entries)?;
    let result = match update.outcome {
        mdx_native_windows::JumpListOutcome::Written => JumpListResult::Written,
        mdx_native_windows::JumpListOutcome::RefusedByPrivacySetting => {
            JumpListResult::RefusedByPrivacySetting
        }
    };
    Ok((result, update.removed_arguments))
}

#[cfg(not(windows))]
pub fn show_jump_list_category(
    _category: &str,
    _links: &[JumpListLink],
) -> io::Result<(JumpListResult, Vec<String>)> {
    Ok((JumpListResult::Unavailable, Vec::new()))
}
