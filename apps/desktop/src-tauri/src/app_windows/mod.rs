mod file_routing;
mod open_windows;
mod window_labels;

use std::sync::Arc;

use tauri::{App, AppHandle, Manager, Window, WindowEvent};

pub use file_routing::FileRoute;
pub use open_windows::{OpenWindows, SavedWindow, WindowReport};
pub use window_labels::{
    MAX_WINDOWS, WorkspaceArgument, is_window_label, next_window_label, workspace_argument,
};

use crate::commands::app_windows::StartupWorkspaceNotice;
use crate::commands::live_reload::stop_watching_for;
use crate::open_requests::MAIN_WINDOW_LABEL;
use crate::storage::{AppValueKey, JsonText, WorkspaceDatabase, WorkspaceId};

/// The app value that lists the windows to open again at the next start.
const OPEN_WINDOWS_KEY: &str = "openWindows";

/// Writes the open windows; a failure only means the next start opens fewer windows.
pub fn save_open_windows(windows: &OpenWindows, database: &WorkspaceDatabase) {
    let (Ok(key), Ok(json)) = (
        AppValueKey::try_from(OPEN_WINDOWS_KEY.to_owned()),
        serde_json::to_string(&windows.to_saved()),
    ) else {
        return;
    };
    if let Ok(value) = JsonText::try_from(json) {
        let _ = database.save_app_value(&key, &value);
    }
}

/// The windows saved at the last close, checked entry by entry: a bad label or workspace id is dropped,
/// and the first window always comes first.
pub fn saved_open_windows(database: &WorkspaceDatabase) -> Vec<SavedWindow> {
    let saved = database
        .load_app_values()
        .ok()
        .and_then(|values| values.get(OPEN_WINDOWS_KEY).cloned())
        .and_then(|json| serde_json::from_str::<Vec<SavedWindow>>(&json).ok())
        .unwrap_or_default();
    valid_saved_windows(saved)
}

fn valid_saved_windows(saved: Vec<SavedWindow>) -> Vec<SavedWindow> {
    let mut windows: Vec<SavedWindow> = Vec::new();
    for window in saved {
        let is_valid = is_window_label(&window.window_id)
            && WorkspaceId::try_from(window.workspace_id.clone()).is_ok()
            && !windows
                .iter()
                .any(|kept| kept.window_id == window.window_id);
        if is_valid && windows.len() < MAX_WINDOWS {
            windows.push(window);
        }
    }
    windows.sort_by_key(|window| window.window_id != MAIN_WINDOW_LABEL);
    windows
}

/// Makes a window like the first one, under another label.
pub fn open_window(app: &AppHandle, label: &str) -> tauri::Result<()> {
    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW_LABEL)
        .cloned()
        .ok_or(tauri::Error::WindowNotFound)?;
    config.label = label.to_owned();
    tauri::WebviewWindowBuilder::from_config(app, &config)?.build()?;
    Ok(())
}

/// Opens the windows of the last session again, each with the workspace it showed. A workspace named
/// on the command line is shown in the first window; one that does not exist only sets the notice.
pub fn restore_windows(app: &App, arguments: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let database = app.state::<WorkspaceDatabase>();
    let windows = app.state::<Arc<OpenWindows>>();
    let saved = saved_open_windows(&database);
    let named = named_workspace(&database, arguments, &app.state::<StartupWorkspaceNotice>());
    let main_workspace = named
        .or_else(|| {
            saved
                .iter()
                .find(|window| window.window_id == MAIN_WINDOW_LABEL)
                .map(|window| window.workspace_id.clone())
        })
        .unwrap_or_default();
    windows.add(MAIN_WINDOW_LABEL, &main_workspace);
    for window in saved
        .iter()
        .filter(|window| window.window_id != MAIN_WINDOW_LABEL)
    {
        open_window(app.handle(), &window.window_id)?;
        windows.add(&window.window_id, &window.workspace_id);
    }
    Ok(())
}

fn named_workspace(
    database: &WorkspaceDatabase,
    arguments: &[String],
    notice: &StartupWorkspaceNotice,
) -> Option<String> {
    let argument = workspace_argument(arguments)?;
    let id = match argument {
        WorkspaceArgument::Named(id) if is_known_workspace(database, &id) => id,
        WorkspaceArgument::Named(_) | WorkspaceArgument::Malformed => {
            notice.set();
            return None;
        }
    };
    Some(id.as_str().to_owned())
}

pub fn is_known_workspace(database: &WorkspaceDatabase, id: &WorkspaceId) -> bool {
    database
        .load_registry()
        .is_ok_and(|workspaces| workspaces.iter().any(|workspace| &workspace.id == id))
}

/// Notes focus for routing, and forgets a window closed on its own so it is not opened again.
pub fn handle_window_event(window: &Window, event: &WindowEvent) {
    let windows = window.state::<Arc<OpenWindows>>();
    match event {
        WindowEvent::Focused(true) => windows.focused(window.label()),
        WindowEvent::Destroyed => {
            stop_watching_for(window);
            if windows.closed(window.label()) {
                save_open_windows(&windows, &window.state::<WorkspaceDatabase>());
            }
        }
        _ => {}
    }
}

/// The window commands and menu items go to: the one focused last, or the first window.
pub fn target_window_label(app: &AppHandle) -> String {
    app.state::<Arc<OpenWindows>>()
        .last_focused()
        .unwrap_or_else(|| MAIN_WINDOW_LABEL.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn saved(window_id: &str, workspace_id: &str) -> SavedWindow {
        SavedWindow {
            window_id: window_id.to_owned(),
            workspace_id: workspace_id.to_owned(),
        }
    }

    #[test]
    fn saved_windows_are_checked_one_by_one_and_the_first_window_leads() {
        let windows = valid_saved_windows(vec![
            saved("window-3", "reading"),
            saved("main", "default"),
            saved("window-3", "other"),
            saved("window-99", "x"),
            saved("window-2", "../secret"),
            saved("window-4", "handbook"),
        ]);

        assert_eq!(
            windows,
            vec![
                saved("main", "default"),
                saved("window-3", "reading"),
                saved("window-4", "handbook")
            ]
        );
    }
}
