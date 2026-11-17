use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Serialize};

use super::file_routing::{FileRoute, RoutableWindow, route_file};

/// A window to open again at the next start, in the order the windows were opened.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedWindow {
    pub window_id: String,
    pub workspace_id: String,
}

/// What a window tells Rust about itself whenever its workspace, tabs or roots change.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WindowReport {
    pub workspace_id: String,
    /// Canonical keys of the documents open in its tabs.
    pub open_document_keys: Vec<String>,
    /// Canonical keys of the folder roots of the workspace it shows.
    pub root_keys: Vec<String>,
}

#[derive(Debug, Clone)]
struct OpenWindow {
    label: String,
    report: WindowReport,
    focus_order: u64,
}

#[derive(Debug, Default)]
struct Windows {
    open: Vec<OpenWindow>,
    last_focus_order: u64,
    /// Set by Exit, so the windows it closes are all opened again at the next start.
    is_exiting: bool,
}

/// The app's windows and what each shows, for routing files, telling windows about list changes and
/// restoring them. The webview only ever changes the entry of its own window.
#[derive(Debug, Default)]
pub struct OpenWindows(Mutex<Windows>);

impl OpenWindows {
    fn with<T>(&self, change: impl FnOnce(&mut Windows) -> T) -> T {
        change(&mut self.0.lock().unwrap_or_else(PoisonError::into_inner))
    }

    /// A new window; it counts as focused last, as it opens in front.
    pub fn add(&self, label: &str, workspace_id: &str) {
        self.with(|windows| {
            windows.open.retain(|window| window.label != label);
            windows.last_focus_order += 1;
            windows.open.push(OpenWindow {
                label: label.to_owned(),
                report: WindowReport {
                    workspace_id: workspace_id.to_owned(),
                    ..WindowReport::default()
                },
                focus_order: windows.last_focus_order,
            });
        });
    }

    /// Returns whether the window's workspace changed, so the saved windows are written again.
    pub fn report(&self, label: &str, report: WindowReport) -> bool {
        self.with(|windows| {
            let Some(window) = windows.open.iter_mut().find(|window| window.label == label) else {
                return false;
            };
            let has_new_workspace = window.report.workspace_id != report.workspace_id;
            window.report = report;
            has_new_workspace
        })
    }

    pub fn focused(&self, label: &str) {
        self.with(|windows| {
            windows.last_focus_order += 1;
            let order = windows.last_focus_order;
            if let Some(window) = windows.open.iter_mut().find(|window| window.label == label) {
                window.focus_order = order;
            }
        });
    }

    pub fn start_exiting(&self) {
        self.with(|windows| windows.is_exiting = true);
    }

    /// A closed window is not opened again, unless it was the last one or Exit closed it.
    pub fn closed(&self, label: &str) -> bool {
        self.with(|windows| {
            if windows.is_exiting || windows.open.len() <= 1 {
                return false;
            }
            windows.open.retain(|window| window.label != label);
            true
        })
    }

    pub fn labels(&self) -> Vec<String> {
        self.with(|windows| {
            windows
                .open
                .iter()
                .map(|window| window.label.clone())
                .collect()
        })
    }

    pub fn workspace_of(&self, label: &str) -> Option<String> {
        self.with(|windows| {
            windows
                .open
                .iter()
                .find(|window| window.label == label)
                .map(|window| window.report.workspace_id.clone())
        })
    }

    /// Another window that shows the workspace, the one focused last when there are several.
    pub fn other_window_showing(&self, workspace_id: &str, except: &str) -> Option<String> {
        self.with(|windows| {
            windows
                .open
                .iter()
                .filter(|window| {
                    window.label != except && window.report.workspace_id == workspace_id
                })
                .max_by_key(|window| window.focus_order)
                .map(|window| window.label.clone())
        })
    }

    /// The other windows of a workspace, which must show a list change one of them saved.
    pub fn others_showing(&self, workspace_id: &str, sender: &str) -> Vec<String> {
        self.with(|windows| {
            windows
                .open
                .iter()
                .filter(|window| {
                    window.label != sender && window.report.workspace_id == workspace_id
                })
                .map(|window| window.label.clone())
                .collect()
        })
    }

    pub fn last_focused(&self) -> Option<String> {
        self.with(|windows| {
            windows
                .open
                .iter()
                .max_by_key(|window| window.focus_order)
                .map(|window| window.label.clone())
        })
    }

    pub fn route(&self, document_key: &str) -> FileRoute {
        self.with(|windows| {
            let routable: Vec<RoutableWindow<'_>> = windows
                .open
                .iter()
                .map(|window| RoutableWindow {
                    label: &window.label,
                    open_document_keys: &window.report.open_document_keys,
                    root_keys: &window.report.root_keys,
                    focus_order: window.focus_order,
                })
                .collect();
            route_file(document_key, &routable)
        })
    }

    /// The windows to open again at the next start, in the order they were opened.
    pub fn to_saved(&self) -> Vec<SavedWindow> {
        self.with(|windows| {
            windows
                .open
                .iter()
                .map(|window| SavedWindow {
                    window_id: window.label.clone(),
                    workspace_id: window.report.workspace_id.clone(),
                })
                .collect()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report(workspace_id: &str) -> WindowReport {
        WindowReport {
            workspace_id: workspace_id.to_owned(),
            ..WindowReport::default()
        }
    }

    #[test]
    fn a_list_save_notifies_the_other_windows_of_that_workspace_only() {
        let windows = OpenWindows::default();
        windows.add("main", "handbook");
        windows.add("window-2", "handbook");
        windows.add("window-3", "reading");

        assert_eq!(windows.others_showing("handbook", "main"), vec!["window-2"]);
        assert!(windows.others_showing("reading", "window-3").is_empty());
    }

    #[test]
    fn open_window_sessions_are_restored_in_order() {
        let windows = OpenWindows::default();
        windows.add("main", "default");
        windows.add("window-2", "reading");
        windows.add("window-3", "handbook");
        windows.focused("main");
        windows.report("window-2", report("journal"));

        assert_eq!(
            windows.to_saved(),
            vec![
                SavedWindow {
                    window_id: "main".to_owned(),
                    workspace_id: "default".to_owned()
                },
                SavedWindow {
                    window_id: "window-2".to_owned(),
                    workspace_id: "journal".to_owned()
                },
                SavedWindow {
                    window_id: "window-3".to_owned(),
                    workspace_id: "handbook".to_owned()
                },
            ]
        );
    }

    #[test]
    fn choosing_a_workspace_shown_elsewhere_finds_the_window_focused_last() {
        let windows = OpenWindows::default();
        windows.add("main", "reading");
        windows.add("window-2", "handbook");
        windows.add("window-3", "handbook");
        windows.focused("window-2");

        assert_eq!(
            windows.other_window_showing("handbook", "main"),
            Some("window-2".to_owned())
        );
        assert_eq!(windows.other_window_showing("reading", "main"), None);
    }

    #[test]
    fn a_closed_window_is_forgotten_but_the_last_one_and_those_exit_closes_are_kept() {
        let windows = OpenWindows::default();
        windows.add("main", "default");
        windows.add("window-2", "reading");
        windows.add("window-3", "handbook");

        assert!(windows.closed("window-2"));
        windows.start_exiting();
        assert!(!windows.closed("window-3"));

        assert_eq!(windows.labels(), vec!["main", "window-3"]);
    }

    #[test]
    fn the_last_window_is_kept_when_it_closes() {
        let windows = OpenWindows::default();
        windows.add("main", "default");

        assert!(!windows.closed("main"));
        assert_eq!(windows.labels(), vec!["main"]);
    }

    #[test]
    fn a_report_for_a_window_that_is_not_open_is_ignored() {
        let windows = OpenWindows::default();

        assert!(!windows.report("window-9", report("reading")));
        assert!(windows.labels().is_empty());
    }
}
