use std::io;

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

/// Replaces the app's custom Jump List category with these links.
#[cfg(windows)]
pub fn show_jump_list_category(
    category: &str,
    links: &[JumpListLink],
) -> io::Result<JumpListResult> {
    let entries: Vec<mdx_native_windows::JumpListEntry> = links
        .iter()
        .map(|link| mdx_native_windows::JumpListEntry {
            title: link.title.clone(),
            arguments: link.arguments.clone(),
        })
        .collect();
    Ok(
        match mdx_native_windows::show_jump_list_category(category, &entries)? {
            mdx_native_windows::JumpListOutcome::Written => JumpListResult::Written,
            mdx_native_windows::JumpListOutcome::RefusedByPrivacySetting => {
                JumpListResult::RefusedByPrivacySetting
            }
        },
    )
}

#[cfg(not(windows))]
pub fn show_jump_list_category(
    _category: &str,
    _links: &[JumpListLink],
) -> io::Result<JumpListResult> {
    Ok(JumpListResult::Unavailable)
}
