/// What routing needs to know of one open window, all keys as canonical keys (lower-case paths).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoutableWindow<'window> {
    pub label: &'window str,
    pub open_document_keys: &'window [String],
    /// The folder roots of the workspace the window shows.
    pub root_keys: &'window [String],
    /// Higher means focused more recently.
    pub focus_order: u64,
}

/// Where a file opened from Windows goes; a route never switches a window's workspace.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileRoute {
    /// A window already has the file open; its tab is focused.
    OpenTab(String),
    /// The window whose workspace has the deepest root containing the file.
    ContainingRoot(String),
    /// No workspace contains it, so the most recently focused window takes it.
    LastFocused(String),
    NoWindow,
}

/// The open tab first, then the deepest containing root, then the most recently focused window; ties
/// go to the window focused last.
pub fn route_file(document_key: &str, windows: &[RoutableWindow<'_>]) -> FileRoute {
    if let Some(window) = most_recent(windows.iter().filter(|window| {
        window
            .open_document_keys
            .iter()
            .any(|key| key == document_key)
    })) {
        return FileRoute::OpenTab(window.label.to_owned());
    }
    let deepest = windows
        .iter()
        .filter_map(|window| {
            deepest_root_length(document_key, window).map(|length| (length, window))
        })
        .max_by_key(|(length, window)| (*length, window.focus_order));
    if let Some((_, window)) = deepest {
        return FileRoute::ContainingRoot(window.label.to_owned());
    }
    most_recent(windows.iter()).map_or(FileRoute::NoWindow, |window| {
        FileRoute::LastFocused(window.label.to_owned())
    })
}

fn most_recent<'list, 'window>(
    windows: impl Iterator<Item = &'list RoutableWindow<'window>>,
) -> Option<&'list RoutableWindow<'window>>
where
    'window: 'list,
{
    windows.max_by_key(|window| window.focus_order)
}

fn deepest_root_length(document_key: &str, window: &RoutableWindow<'_>) -> Option<usize> {
    window
        .root_keys
        .iter()
        .filter(|root| is_inside(document_key, root))
        .map(|root| root.trim_end_matches(['\\', '/']).len())
        .max()
}

fn is_inside(document_key: &str, root_key: &str) -> bool {
    let root = root_key.trim_end_matches(['\\', '/']);
    document_key
        .strip_prefix(root)
        .is_some_and(|rest| rest.starts_with(['\\', '/']))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(paths: &[&str]) -> Vec<String> {
        paths.iter().map(|path| (*path).to_owned()).collect()
    }

    struct Window {
        label: &'static str,
        tabs: Vec<String>,
        roots: Vec<String>,
        focus_order: u64,
    }

    fn window(label: &'static str, tabs: &[&str], roots: &[&str], focus_order: u64) -> Window {
        Window {
            label,
            tabs: keys(tabs),
            roots: keys(roots),
            focus_order,
        }
    }

    fn route(document_key: &str, windows: &[Window]) -> FileRoute {
        let routable: Vec<RoutableWindow<'_>> = windows
            .iter()
            .map(|window| RoutableWindow {
                label: window.label,
                open_document_keys: &window.tabs,
                root_keys: &window.roots,
                focus_order: window.focus_order,
            })
            .collect();
        route_file(document_key, &routable)
    }

    #[test]
    fn a_file_open_in_a_tab_goes_to_that_window_even_when_another_was_focused_later() {
        let windows = [
            window("main", &[], &[r"d:\docs"], 5),
            window("window-2", &[r"d:\docs\guide.md"], &[], 1),
        ];

        assert_eq!(
            route(r"d:\docs\guide.md", &windows),
            FileRoute::OpenTab("window-2".to_owned())
        );
    }

    #[test]
    fn the_deepest_containing_root_wins() {
        let windows = [
            window("main", &[], &[r"d:\docs"], 5),
            window("window-2", &[], &[r"d:\docs\api"], 1),
        ];

        assert_eq!(
            route(r"d:\docs\api\auth.md", &windows),
            FileRoute::ContainingRoot("window-2".to_owned())
        );
    }

    #[test]
    fn equally_deep_roots_go_to_the_window_focused_last() {
        let windows = [
            window("main", &[], &[r"d:\docs"], 2),
            window("window-2", &[], &[r"d:\docs\"], 7),
        ];

        assert_eq!(
            route(r"d:\docs\plan.md", &windows),
            FileRoute::ContainingRoot("window-2".to_owned())
        );
    }

    #[test]
    fn a_loose_file_goes_to_the_window_focused_last() {
        let windows = [
            window("main", &[], &[r"d:\docs"], 9),
            window("window-2", &[], &[r"d:\docs api"], 3),
        ];

        assert_eq!(
            route(r"c:\tmp\readme.md", &windows),
            FileRoute::LastFocused("main".to_owned())
        );
        assert_eq!(
            route(r"d:\docs api.md", &windows),
            FileRoute::LastFocused("main".to_owned())
        );
    }

    #[test]
    fn with_no_windows_yet_there_is_nowhere_to_route() {
        assert_eq!(route(r"c:\tmp\readme.md", &[]), FileRoute::NoWindow);
    }
}
