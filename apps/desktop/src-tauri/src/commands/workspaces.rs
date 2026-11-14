use std::collections::BTreeMap;
use std::sync::Arc;

use serde::Serialize;
use tauri::State;

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
    InvalidArgument { argument: &'static str },
    InvalidValue,
    UnknownWorkspace,
    AlreadyImported,
    ImportFailed,
    NewerDatabase,
    StorageUnavailable,
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
    window_id: String,
    database: State<'_, WorkspaceDatabase>,
    access: State<'_, Arc<DocumentAccessList>>,
) -> CommandResult<()> {
    let workspace_id = WorkspaceId::try_from(workspace_id)?;
    let window_id = WindowId::try_from(window_id)?;
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
    window_id: String,
    database: State<'_, WorkspaceDatabase>,
) -> CommandResult<Option<WorkspaceContents>> {
    let workspace_id = WorkspaceId::try_from(workspace_id)?;
    let window_id = WindowId::try_from(window_id)?;
    Ok(database.load_workspace(&workspace_id, &window_id)?)
}

#[tauri::command]
pub fn save_workspace(
    workspace: WorkspaceRecordInput,
    database: State<'_, WorkspaceDatabase>,
) -> CommandResult<()> {
    Ok(database.save_workspace(&WorkspaceRecord::try_from(workspace)?)?)
}

#[tauri::command]
pub fn delete_workspace(
    workspace_id: String,
    database: State<'_, WorkspaceDatabase>,
) -> CommandResult<()> {
    Ok(database.delete_workspace(&WorkspaceId::try_from(workspace_id)?)?)
}

#[tauri::command]
pub fn save_workspace_list(
    workspace_id: String,
    list_name: String,
    value_json: String,
    database: State<'_, WorkspaceDatabase>,
) -> CommandResult<()> {
    let workspace_id = WorkspaceId::try_from(workspace_id)?;
    let list_name = ListName::parse(&list_name)?;
    Ok(database.save_list(&workspace_id, list_name, &JsonText::try_from(value_json)?)?)
}

#[tauri::command]
pub fn save_window_session(
    window_id: String,
    workspace_id: String,
    session_json: String,
    database: State<'_, WorkspaceDatabase>,
) -> CommandResult<()> {
    let window_id = WindowId::try_from(window_id)?;
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
