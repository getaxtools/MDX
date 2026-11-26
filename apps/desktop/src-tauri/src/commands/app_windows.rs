use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State, WebviewWindow};

use crate::app_windows::{
    OpenWindows, WindowReport, forget_window_sessions, open_window, save_open_windows,
    stay_after_cancelled_exit,
};
use crate::documents::{DocumentAccessList, canonical_key_of, locate_document};
use crate::open_requests::MAIN_WINDOW_LABEL;
use crate::open_requests::forward_documents;
use crate::storage::{WorkspaceDatabase, WorkspaceId};

/// A window reports at most this many open documents and roots; more would only slow routing down.
const MAX_REPORTED_KEYS: usize = 1_000;
const MAX_PATH_CHARACTERS: usize = 32_767;

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum WindowCommandError {
    InvalidArgument { argument: &'static str },
    TooManyWindows,
    WindowUnavailable,
}

type CommandResult<T> = Result<T, WindowCommandError>;

/// Opens another window on the workspace the asking window shows; it starts with no tabs.
#[tauri::command]
pub async fn open_new_window(
    window: WebviewWindow,
    app: AppHandle,
    windows: State<'_, Arc<OpenWindows>>,
    database: State<'_, WorkspaceDatabase>,
) -> CommandResult<()> {
    let workspace_id = windows
        .workspace_of(window.label())
        .ok_or(WindowCommandError::WindowUnavailable)?;
    let label = windows
        .reserve_new(&workspace_id)
        .ok_or(WindowCommandError::TooManyWindows)?;
    forget_window_sessions(&database, &label);
    if open_window(&app, &label).is_err() {
        windows.release(&label);
        return Err(WindowCommandError::WindowUnavailable);
    }
    save_open_windows(&windows, &database);
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowStateReport {
    workspace_id: String,
    open_document_paths: Vec<String>,
    root_paths: Vec<String>,
}

/// What the asking window shows now, for routing files and for telling it about list changes.
#[tauri::command]
pub fn report_window_state(
    state: WindowStateReport,
    window: WebviewWindow,
    windows: State<'_, Arc<OpenWindows>>,
    database: State<'_, WorkspaceDatabase>,
) -> CommandResult<()> {
    let report = validated_report(state)?;
    if windows.report(window.label(), report) {
        save_open_windows(&windows, &database);
    }
    Ok(())
}

fn validated_report(state: WindowStateReport) -> CommandResult<WindowReport> {
    let workspace_id = WorkspaceId::try_from(state.workspace_id).map_err(|_| {
        WindowCommandError::InvalidArgument {
            argument: "workspaceId",
        }
    })?;
    Ok(WindowReport {
        workspace_id: workspace_id.as_str().to_owned(),
        open_document_keys: validated_keys(&state.open_document_paths, "openDocumentPaths")?,
        root_keys: validated_keys(&state.root_paths, "rootPaths")?,
    })
}

fn validated_keys(paths: &[String], argument: &'static str) -> CommandResult<Vec<String>> {
    let is_valid = paths.len() <= MAX_REPORTED_KEYS
        && paths.iter().all(|path| {
            !path.is_empty() && path.chars().count() <= MAX_PATH_CHARACTERS && !path.contains('\0')
        });
    if !is_valid {
        return Err(WindowCommandError::InvalidArgument { argument });
    }
    Ok(paths.iter().map(|path| canonical_key_of(path)).collect())
}

/// Focuses another window that shows the workspace; false when none does, so the asking window
/// switches to it itself.
#[tauri::command]
pub fn focus_window_showing(
    workspace_id: String,
    window: WebviewWindow,
    app: AppHandle,
    windows: State<'_, Arc<OpenWindows>>,
) -> CommandResult<bool> {
    let workspace_id =
        WorkspaceId::try_from(workspace_id).map_err(|_| WindowCommandError::InvalidArgument {
            argument: "workspaceId",
        })?;
    let Some(label) = windows.other_window_showing(workspace_id.as_str(), window.label()) else {
        return Ok(false);
    };
    let Some(other) = app.get_webview_window(&label) else {
        return Ok(false);
    };
    let _ = other.unminimize();
    let _ = other.set_focus();
    Ok(true)
}

/// The workspace the asking window opens with: the one it showed at the last close, or the one it was
/// opened for; none for a window starting fresh.
#[tauri::command]
pub fn window_startup_workspace(
    window: WebviewWindow,
    windows: State<'_, Arc<OpenWindows>>,
) -> Option<String> {
    windows
        .workspace_of(window.label())
        .filter(|workspace_id| !workspace_id.is_empty())
}

/// Set when the app was started with a workspace id that is malformed or names no workspace.
#[derive(Debug, Default)]
pub struct StartupWorkspaceNotice(AtomicBool);

impl StartupWorkspaceNotice {
    pub fn set(&self) {
        self.0.store(true, Ordering::Relaxed);
    }

    /// True once after `set`.
    pub fn take(&self) -> bool {
        self.0.swap(false, Ordering::Relaxed)
    }
}

/// True once, when the start-up workspace argument could not be shown, so the first window says so.
#[tauri::command]
pub fn take_startup_workspace_notice(
    window: WebviewWindow,
    notice: State<'_, StartupWorkspaceNotice>,
) -> bool {
    window.label() == MAIN_WINDOW_LABEL && notice.take()
}

/// At most this many files come with one request to show a workspace.
const MAX_ROUTED_DOCUMENTS: usize = 200;

/// Files sent with a workspace the window did not move to, because the user kept its unsaved edits,
/// go where any opened file goes. Only files the app was already given are accepted.
#[tauri::command]
pub fn route_documents(
    paths: Vec<String>,
    app: AppHandle,
    access: State<'_, Arc<DocumentAccessList>>,
) -> CommandResult<()> {
    if paths.len() > MAX_ROUTED_DOCUMENTS {
        return Err(WindowCommandError::InvalidArgument { argument: "paths" });
    }
    forward_documents(&app, granted_display_paths(&paths, &access));
    Ok(())
}

fn granted_display_paths(paths: &[String], access: &DocumentAccessList) -> Vec<String> {
    paths
        .iter()
        .filter(|path| path.chars().count() <= MAX_PATH_CHARACTERS && !path.contains('\0'))
        .filter_map(|path| locate_document(std::path::Path::new(path)).ok())
        .filter(|location| access.is_allowed(location))
        .map(|location| location.display_path)
        .collect()
}

/// The window asked about its edits while Exit closed every window, and the user chose to stay.
#[tauri::command]
pub fn close_cancelled(
    windows: State<'_, Arc<OpenWindows>>,
    database: State<'_, WorkspaceDatabase>,
) {
    stay_after_cancelled_exit(&windows, &database);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report(workspace_id: &str, paths: Vec<String>) -> WindowStateReport {
        WindowStateReport {
            workspace_id: workspace_id.to_owned(),
            open_document_paths: paths,
            root_paths: vec![r"D:\Docs".to_owned()],
        }
    }

    #[test]
    fn a_report_is_checked_and_keyed_like_the_documents() {
        let checked =
            validated_report(report("handbook", vec![r"D:\Docs\Guide.md".to_owned()])).unwrap();

        assert_eq!(
            checked.open_document_keys,
            vec![canonical_key_of(r"D:\Docs\Guide.md")]
        );
        assert_eq!(checked.root_keys, vec![canonical_key_of(r"D:\Docs")]);
    }

    #[test]
    fn only_files_the_app_was_given_are_routed_again() {
        let granted = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let plan = granted.path().join("Plan.md");
        let secret = other.path().join("Secret.md");
        std::fs::write(&plan, "#").unwrap();
        std::fs::write(&secret, "#").unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(granted.path()).unwrap();

        let routed = granted_display_paths(
            &[
                plan.to_string_lossy().into_owned(),
                secret.to_string_lossy().into_owned(),
            ],
            &access,
        );

        assert_eq!(routed.len(), 1);
        assert!(routed[0].ends_with("Plan.md"));
    }

    #[test]
    fn a_malformed_report_is_refused() {
        let too_many = vec![r"D:\a.md".to_owned(); MAX_REPORTED_KEYS + 1];

        for bad in [
            report("../x", vec![]),
            report("handbook", too_many),
            report("handbook", vec![String::new()]),
            report("handbook", vec!["a\0b".to_owned()]),
        ] {
            assert!(matches!(
                validated_report(bad),
                Err(WindowCommandError::InvalidArgument { .. })
            ));
        }
    }
}
