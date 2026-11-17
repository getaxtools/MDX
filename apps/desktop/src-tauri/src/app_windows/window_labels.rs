use crate::open_requests::MAIN_WINDOW_LABEL;
use crate::storage::WorkspaceId;

/// More windows than this are refused; each one is a full webview.
pub const MAX_WINDOWS: usize = 20;
const OTHER_WINDOW_PREFIX: &str = "window-";
const WORKSPACE_ARGUMENT: &str = "--workspace";

/// Windows other than the first are `window-2`, `window-3` and on, so a label from the webview or the
/// database can be checked before a window is looked up or made.
pub fn is_window_label(label: &str) -> bool {
    label == MAIN_WINDOW_LABEL
        || label
            .strip_prefix(OTHER_WINDOW_PREFIX)
            .and_then(|number| {
                number
                    .parse::<usize>()
                    .ok()
                    .filter(|_| !number.starts_with('0'))
            })
            .is_some_and(|number| (2..=MAX_WINDOWS).contains(&number))
}

/// The lowest free label, or `None` once the app has as many windows as it allows.
pub fn next_window_label(taken: &[String]) -> Option<String> {
    (2..=MAX_WINDOWS)
        .map(|number| format!("{OTHER_WINDOW_PREFIX}{number}"))
        .find(|label| !taken.contains(label))
}

/// A launch argument naming a workspace to show, such as one a Jump List entry passes.
#[derive(Debug, PartialEq, Eq)]
pub enum WorkspaceArgument {
    Named(WorkspaceId),
    /// Given, but not in the format of a workspace id.
    Malformed,
}

/// The argument that starts the app showing a workspace, as a Jump List entry passes it.
pub fn workspace_launch_argument(id: &WorkspaceId) -> String {
    format!("{WORKSPACE_ARGUMENT}={}", id.as_str())
}

/// `--workspace=<id>` or `--workspace <id>`; the first one counts.
pub fn workspace_argument(arguments: &[String]) -> Option<WorkspaceArgument> {
    let mut rest = arguments.iter().skip(1);
    while let Some(argument) = rest.next() {
        let value = if argument == WORKSPACE_ARGUMENT {
            rest.next().cloned().unwrap_or_default()
        } else if let Some(value) = argument.strip_prefix(&format!("{WORKSPACE_ARGUMENT}=")) {
            value.to_owned()
        } else {
            continue;
        };
        return Some(
            WorkspaceId::try_from(value)
                .map_or(WorkspaceArgument::Malformed, WorkspaceArgument::Named),
        );
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_launch_argument_names_the_workspace_the_app_reads_back() {
        let id = WorkspaceId::try_from("reading-1".to_owned()).unwrap();

        let argument = workspace_launch_argument(&id);

        assert_eq!(argument, "--workspace=reading-1");
        assert_eq!(
            workspace_argument(&["mdx.exe".to_owned(), argument]),
            Some(WorkspaceArgument::Named(id))
        );
    }

    fn arguments(list: &[&str]) -> Vec<String> {
        std::iter::once("mdx.exe")
            .chain(list.iter().copied())
            .map(str::to_owned)
            .collect()
    }

    #[test]
    fn accepts_only_the_labels_the_app_gives_its_windows() {
        for label in ["main", "window-2", "window-20"] {
            assert!(is_window_label(label), "{label}");
        }
        for label in [
            "",
            "window-1",
            "window-21",
            "window-02",
            "window-x",
            "Main",
            "other",
        ] {
            assert!(!is_window_label(label), "{label}");
        }
    }

    #[test]
    fn the_next_label_is_the_lowest_free_one() {
        let taken = vec![
            "main".to_owned(),
            "window-2".to_owned(),
            "window-4".to_owned(),
        ];

        assert_eq!(next_window_label(&taken), Some("window-3".to_owned()));
        let all: Vec<String> = (2..=MAX_WINDOWS)
            .map(|number| format!("window-{number}"))
            .collect();
        assert_eq!(next_window_label(&all), None);
    }

    #[test]
    fn reads_a_workspace_id_in_either_form_and_refuses_a_malformed_one() {
        let id = |text: &str| WorkspaceId::try_from(text.to_owned()).unwrap();

        assert_eq!(
            workspace_argument(&arguments(&["--workspace=reading-1"])),
            Some(WorkspaceArgument::Named(id("reading-1")))
        );
        assert_eq!(
            workspace_argument(&arguments(&["C:\\docs\\a.md", "--workspace", "handbook"])),
            Some(WorkspaceArgument::Named(id("handbook")))
        );
        assert_eq!(
            workspace_argument(&arguments(&["--workspace=../../etc"])),
            Some(WorkspaceArgument::Malformed)
        );
        assert_eq!(
            workspace_argument(&arguments(&["--workspace"])),
            Some(WorkspaceArgument::Malformed)
        );
        assert_eq!(workspace_argument(&arguments(&["C:\\docs\\a.md"])), None);
    }
}
