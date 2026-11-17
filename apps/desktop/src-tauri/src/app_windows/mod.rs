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
use crate::notes_index::NotesIndexes;
use crate::open_requests::MAIN_WINDOW_LABEL;
use crate::storage::{AppValueKey, JsonText, WindowId, WorkspaceDatabase, WorkspaceId};

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

/// Drops the tabs and layout a window label had, so a window opened later under it starts empty.
pub fn forget_window_sessions(database: &WorkspaceDatabase, label: &str) {
    if let Ok(window_id) = WindowId::try_from(label.to_owned()) {
        let _ = database.delete_window_sessions(&window_id);
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
/// on the command line is shown in the first window, unless another restored window shows it, which
/// then comes to the front; one that does not exist only sets the notice. A window that cannot be
/// built is left out rather than stopping the start.
pub fn restore_windows(app: &App, arguments: &[String]) {
    let database = app.state::<WorkspaceDatabase>();
    let windows = app.state::<Arc<OpenWindows>>();
    let named = named_workspace(&database, arguments, &app.state::<StartupWorkspaceNotice>());
    let plan = startup_plan(saved_open_windows(&database), named);
    windows.add(MAIN_WINDOW_LABEL, &plan.main_workspace);
    for window in &plan.other_windows {
        if open_window(app.handle(), &window.window_id).is_ok() {
            windows.add(&window.window_id, &window.workspace_id);
        }
    }
    if let Some(window) = plan
        .window_to_focus
        .and_then(|label| app.get_webview_window(&label))
    {
        let _ = window.set_focus();
    }
}

/// The windows to open at start-up and which one to bring to the front.
#[derive(Debug, PartialEq, Eq)]
struct StartupPlan {
    main_workspace: String,
    other_windows: Vec<SavedWindow>,
    window_to_focus: Option<String>,
}

fn startup_plan(saved: Vec<SavedWindow>, named: Option<String>) -> StartupPlan {
    let saved_main = saved
        .iter()
        .find(|window| window.window_id == MAIN_WINDOW_LABEL)
        .map(|window| window.workspace_id.clone());
    let other_windows: Vec<SavedWindow> = saved
        .into_iter()
        .filter(|window| window.window_id != MAIN_WINDOW_LABEL)
        .collect();
    let shown_elsewhere = named.as_ref().and_then(|named| {
        other_windows
            .iter()
            .find(|window| &window.workspace_id == named)
            .map(|window| window.window_id.clone())
    });
    let main_workspace = match (&shown_elsewhere, named) {
        (None, Some(named)) => named,
        _ => saved_main.unwrap_or_default(),
    };
    StartupPlan {
        main_workspace,
        other_windows,
        window_to_focus: shown_elsewhere,
    }
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
            window.state::<Arc<NotesIndexes>>().hide(window.label());
            if windows.closed(window.label()) {
                let database = window.state::<WorkspaceDatabase>();
                forget_window_sessions(&database, window.label());
                save_open_windows(&windows, &database);
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
    fn a_named_workspace_a_restored_window_shows_is_brought_forward_there() {
        let plan = startup_plan(
            vec![saved("main", "default"), saved("window-2", "handbook")],
            Some("handbook".to_owned()),
        );

        assert_eq!(plan.main_workspace, "default");
        assert_eq!(plan.window_to_focus.as_deref(), Some("window-2"));
        assert_eq!(plan.other_windows, vec![saved("window-2", "handbook")]);
    }

    #[test]
    fn a_named_workspace_no_window_shows_opens_in_the_first_window() {
        let plan = startup_plan(
            vec![saved("main", "default"), saved("window-2", "reading")],
            Some("handbook".to_owned()),
        );

        assert_eq!(plan.main_workspace, "handbook");
        assert_eq!(plan.window_to_focus, None);
    }

    #[test]
    fn a_well_formed_but_unknown_workspace_id_opens_nothing_and_sets_the_notice() {
        let folder = tempfile::tempdir().unwrap();
        let database = WorkspaceDatabase::new(folder.path());
        let notice = StartupWorkspaceNotice::default();
        let arguments = ["mdx".to_owned(), "--workspace=ghost".to_owned()];

        assert_eq!(named_workspace(&database, &arguments, &notice), None);
        assert!(notice.take());
    }

    #[test]
    fn open_windows_round_trip_through_the_database() {
        let folder = tempfile::tempdir().unwrap();
        let database = WorkspaceDatabase::new(folder.path());
        let windows = OpenWindows::default();
        windows.add("main", "default");
        windows.add("window-2", "handbook");

        save_open_windows(&windows, &database);

        assert_eq!(
            saved_open_windows(&database),
            vec![saved("main", "default"), saved("window-2", "handbook")]
        );
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
