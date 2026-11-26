use std::collections::BTreeMap;
use std::sync::Arc;

use serde::Serialize;
use tauri::{Emitter, Manager, State, WebviewWindow};

use crate::app_windows::OpenWindows;
use crate::documents::DocumentAccessList;
use crate::open_requests::grant_saved_paths;

use crate::storage::{
    AppStateStore, AppValueKey, DatabaseError, JsonText, LegacyStateImport, LegacyStateImportInput,
    ListName, WindowId, WorkspaceContents, WorkspaceDatabase, WorkspaceId, WorkspaceRecord,
    WorkspaceRecordInput,
};

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum WorkspaceCommandError {
    InvalidArgument {
        argument: &'static str,
    },
    InvalidValue,
    UnknownWorkspace,
    AlreadyImported,
    ImportFailed,
    NewerDatabase,
    StorageUnavailable,
    /// Another window shows the workspace; it is brought forward so its edits are not lost.
    ShownInAnotherWindow,
}

impl From<DatabaseError> for WorkspaceCommandError {
    fn from(error: DatabaseError) -> Self {
        match error {
            DatabaseError::InvalidArgument(argument) => Self::InvalidArgument { argument },
            DatabaseError::InvalidJson | DatabaseError::TooLarge => Self::InvalidValue,
            DatabaseError::UnknownWorkspace => Self::UnknownWorkspace,
            DatabaseError::AlreadyImported => Self::AlreadyImported,
            DatabaseError::ImportMismatch(_) => Self::ImportFailed,
            DatabaseError::NewerDatabase => Self::NewerDatabase,
            DatabaseError::Storage(_) => Self::StorageUnavailable,
        }
    }
}

type CommandResult<T> = Result<T, WorkspaceCommandError>;

/// A window's tabs and layout are kept under its own label, never one the webview names.
fn window_id_of(window: &WebviewWindow) -> CommandResult<WindowId> {
    Ok(WindowId::try_from(window.label().to_owned())?)
}

/// Moves the earlier state into the database once, after keeping a copy of the earlier file.
#[tauri::command]
pub fn import_legacy_state(
    legacy_state: LegacyStateImportInput,
    database: State<'_, WorkspaceDatabase>,
    store: State<'_, AppStateStore>,
) -> CommandResult<()> {
    let import = LegacyStateImport::try_from(legacy_state)?;
    store
        .keep_copy_before_workspaces()
        .map_err(|_| WorkspaceCommandError::StorageUnavailable)?;
    Ok(database.import_legacy_state(&import)?)
}

/// Grants the folders and documents of a workspace when a window shows it, not every saved path at start-up.
#[tauri::command]
pub fn grant_workspace_access(
    workspace_id: String,
    window: WebviewWindow,
    database: State<'_, WorkspaceDatabase>,
    access: State<'_, Arc<DocumentAccessList>>,
) -> CommandResult<()> {
    let workspace_id = WorkspaceId::try_from(workspace_id)?;
    let window_id = window_id_of(&window)?;
    if let Some(saved_json) = database.saved_paths_json(&workspace_id, &window_id)? {
        grant_saved_paths(&saved_json, &access);
    }
    Ok(())
}

#[tauri::command]
pub fn clear_workspaces(database: State<'_, WorkspaceDatabase>) -> CommandResult<()> {
    Ok(database.clear_all()?)
}

#[tauri::command]
pub fn load_workspace_registry(
    database: State<'_, WorkspaceDatabase>,
) -> CommandResult<Vec<WorkspaceRecord>> {
    Ok(database.load_registry()?)
}

#[tauri::command]
pub fn load_workspace(
    workspace_id: String,
    window: WebviewWindow,
    database: State<'_, WorkspaceDatabase>,
) -> CommandResult<Option<WorkspaceContents>> {
    let workspace_id = WorkspaceId::try_from(workspace_id)?;
    let window_id = window_id_of(&window)?;
    Ok(database.load_workspace(&workspace_id, &window_id)?)
}

#[tauri::command]
pub fn save_workspace(
    workspace: WorkspaceRecordInput,
    database: State<'_, WorkspaceDatabase>,
) -> CommandResult<()> {
    Ok(database.save_workspace(&WorkspaceRecord::try_from(workspace)?)?)
}

/// A workspace was deleted; the other windows drop it, and one showing it moves to another workspace.
pub const WORKSPACE_DELETED_EVENT: &str = "workspace-deleted";

#[tauri::command]
pub fn delete_workspace(
    workspace_id: String,
    window: WebviewWindow,
    database: State<'_, WorkspaceDatabase>,
) -> CommandResult<()> {
    let workspace_id = WorkspaceId::try_from(workspace_id)?;
    let windows = window.state::<Arc<OpenWindows>>();
    if let Some(label) = windows.other_window_showing(workspace_id.as_str(), window.label()) {
        if let Some(other) = window.get_webview_window(&label) {
            let _ = other.unminimize();
            let _ = other.set_focus();
        }
        return Err(WorkspaceCommandError::ShownInAnotherWindow);
    }
    database.delete_workspace(&workspace_id)?;
    for label in other_windows(&windows, window.label()) {
        let _ = window.emit_to(
            label.as_str(),
            WORKSPACE_DELETED_EVENT,
            workspace_id.as_str(),
        );
    }
    Ok(())
}

fn other_windows(windows: &OpenWindows, sender: &str) -> Vec<String> {
    windows
        .labels()
        .into_iter()
        .filter(|label| label != sender)
        .collect()
}

/// A list of one workspace changed, such as its favourites; the other windows showing it read it again.
pub const WORKSPACE_LIST_CHANGED_EVENT: &str = "workspace-list-changed";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChangedList {
    workspace_id: String,
    list_name: String,
}

/// Saves one list and tells the other windows of that workspace, never windows of other workspaces.
#[tauri::command]
pub fn save_workspace_list(
    workspace_id: String,
    list_name: String,
    value_json: String,
    window: WebviewWindow,
) -> CommandResult<()> {
    let workspace_id = WorkspaceId::try_from(workspace_id)?;
    let list = ListName::parse(&list_name)?;
    let database = window.state::<WorkspaceDatabase>();
    let windows = window.state::<Arc<OpenWindows>>();
    database.save_list(&workspace_id, list, &JsonText::try_from(value_json)?)?;
    for (label, changed) in list_change_notices(&windows, &workspace_id, &list_name, window.label())
    {
        let _ = window.emit_to(label.as_str(), WORKSPACE_LIST_CHANGED_EVENT, changed);
    }
    Ok(())
}

/// The windows to tell about a saved list, with what to tell each: the other windows of that
/// workspace only.
fn list_change_notices(
    windows: &OpenWindows,
    workspace_id: &WorkspaceId,
    list_name: &str,
    sender: &str,
) -> Vec<(String, ChangedList)> {
    windows
        .others_showing(workspace_id.as_str(), sender)
        .into_iter()
        .map(|label| {
            let changed = ChangedList {
                workspace_id: workspace_id.as_str().to_owned(),
                list_name: list_name.to_owned(),
            };
            (label, changed)
        })
        .collect()
}

#[tauri::command]
pub fn save_window_session(
    workspace_id: String,
    session_json: String,
    window: WebviewWindow,
    database: State<'_, WorkspaceDatabase>,
) -> CommandResult<()> {
    let window_id = window_id_of(&window)?;
    let workspace_id = WorkspaceId::try_from(workspace_id)?;
    Ok(database.save_window_session(
        &window_id,
        &workspace_id,
        &JsonText::try_from(session_json)?,
    )?)
}

#[tauri::command]
pub fn load_app_values(
    database: State<'_, WorkspaceDatabase>,
) -> CommandResult<BTreeMap<String, String>> {
    Ok(database.load_app_values()?)
}

#[tauri::command]
pub fn save_app_value(
    key: String,
    value_json: String,
    database: State<'_, WorkspaceDatabase>,
) -> CommandResult<()> {
    let key = AppValueKey::try_from(key)?;
    Ok(database.save_app_value(&key, &JsonText::try_from(value_json)?)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_saved_list_is_announced_to_the_other_windows_of_its_workspace_only() {
        let windows = OpenWindows::default();
        windows.add("main", "handbook");
        windows.add("window-2", "handbook");
        windows.add("window-3", "reading");
        let handbook = WorkspaceId::try_from("handbook".to_owned()).unwrap();

        let notices = list_change_notices(&windows, &handbook, "favourites", "main");

        assert_eq!(
            notices,
            vec![(
                "window-2".to_owned(),
                ChangedList {
                    workspace_id: "handbook".to_owned(),
                    list_name: "favourites".to_owned(),
                }
            )]
        );
    }

    #[test]
    fn deleting_a_workspace_another_window_shows_is_refused_with_its_own_code() {
        assert_eq!(
            serde_json::to_value(WorkspaceCommandError::ShownInAnotherWindow).unwrap(),
            serde_json::json!({ "code": "shownInAnotherWindow" })
        );
    }

    #[test]
    fn a_deleted_workspace_is_announced_to_every_other_window() {
        let windows = OpenWindows::default();
        windows.add("main", "handbook");
        windows.add("window-2", "reading");

        assert_eq!(other_windows(&windows, "main"), vec!["window-2"]);
    }

    #[test]
    fn names_the_invalid_argument() {
        let error = WorkspaceId::try_from("../escape".to_owned()).unwrap_err();

        assert_eq!(
            WorkspaceCommandError::from(error),
            WorkspaceCommandError::InvalidArgument {
                argument: "workspaceId"
            }
        );
    }

    #[test]
    fn reports_oversized_or_invalid_json_as_an_invalid_value() {
        assert_eq!(
            WorkspaceCommandError::from(DatabaseError::TooLarge),
            WorkspaceCommandError::InvalidValue
        );
        assert_eq!(
            WorkspaceCommandError::from(DatabaseError::InvalidJson),
            WorkspaceCommandError::InvalidValue
        );
    }

    #[test]
    fn serializes_errors_with_a_code_the_webview_can_match() {
        let error = WorkspaceCommandError::InvalidArgument {
            argument: "listName",
        };

        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({ "code": "invalidArgument", "argument": "listName" })
        );
    }

    #[test]
    fn sends_workspace_records_in_the_shape_the_webview_reads() {
        let input = WorkspaceRecordInput {
            id: "default".to_owned(),
            kind_id: "markdownViewer".to_owned(),
            name: Some("Default".to_owned()),
            icon: None,
            colour: Some("#3366cc".to_owned()),
            position: 0,
            last_shown_at_ms: Some(5),
            source_file: None,
            kind_data: None,
        };

        let record = WorkspaceRecord::try_from(input).unwrap();

        assert_eq!(
            serde_json::to_value(record).unwrap(),
            serde_json::json!({
                "id": "default",
                "kindId": "markdownViewer",
                "name": "Default",
                "icon": null,
                "colour": "#3366cc",
                "position": 0,
                "lastShownAtMs": 5,
                "sourceFile": null,
                "kindData": null
            })
        );
    }
}
