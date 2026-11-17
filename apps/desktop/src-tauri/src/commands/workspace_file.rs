use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::documents::{
    DocumentAccessList, DocumentError, validated_file_name, write_text_atomically,
};
use crate::open_requests::StartupWorkspaceFile;
use crate::storage::{
    PendingWorkspaceExport, WORKSPACE_FILE_EXTENSION, WorkspaceFileContents, read_workspace_file,
    validated_workspace_json, with_extension,
};

const WORKSPACE_FILE_FILTER_NAME: &str = "MDX workspace";

/// Where the export goes, so the webview can write paths relative to that folder.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChosenExportPlace {
    folder: String,
}

/// Asks where to save the workspace file and remembers the answer for `write_workspace_export`.
#[tauri::command]
pub async fn pick_workspace_export_place(
    suggested_file_name: String,
    app: AppHandle,
    pending: State<'_, PendingWorkspaceExport>,
) -> Result<Option<ChosenExportPlace>, DocumentError> {
    let file_name = validated_file_name(&suggested_file_name)?.to_owned();
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter(WORKSPACE_FILE_FILTER_NAME, &[WORKSPACE_FILE_EXTENSION])
            .set_file_name(file_name)
            .blocking_save_file()
            .and_then(|file| file.into_path().ok())
    })
    .await
    .map_err(|_| DocumentError::Unreadable)?;
    let Some(chosen) = chosen else {
        return Ok(None);
    };
    let destination = with_extension(chosen, WORKSPACE_FILE_EXTENSION);
    let folder = destination
        .parent()
        .map(|folder| folder.to_string_lossy().into_owned())
        .unwrap_or_default();
    pending.remember(destination);
    Ok(Some(ChosenExportPlace { folder }))
}

/// Writes the exported workspace to the place chosen just before; the webview never names a path.
#[tauri::command]
pub fn write_workspace_export(
    contents: String,
    pending: State<'_, PendingWorkspaceExport>,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<String, DocumentError> {
    validated_workspace_json(&contents)?;
    let destination = pending.take().ok_or(DocumentError::InvalidRequest)?;
    access.check_writable_destination(&destination)?;
    write_text_atomically(&destination, &contents)?;
    Ok(destination.to_string_lossy().into_owned())
}

/// The workspace file the app was started with, read once; nothing is granted until the user confirms it.
#[tauri::command]
pub fn take_startup_workspace_file(
    startup: State<'_, StartupWorkspaceFile>,
) -> Result<Option<WorkspaceFileContents>, DocumentError> {
    startup
        .take()
        .map(|path| read_workspace_file(&path))
        .transpose()
}

/// Asks for a workspace file and returns its text; nothing is granted until the user confirms it.
#[tauri::command]
pub async fn open_workspace_file(
    app: AppHandle,
) -> Result<Option<WorkspaceFileContents>, DocumentError> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(chosen) = app
            .dialog()
            .file()
            .add_filter(WORKSPACE_FILE_FILTER_NAME, &[WORKSPACE_FILE_EXTENSION])
            .blocking_pick_file()
            .and_then(|file| file.into_path().ok())
        else {
            return Ok(None);
        };
        read_workspace_file(&chosen).map(Some)
    })
    .await
    .map_err(|_| DocumentError::Unreadable)?
}
