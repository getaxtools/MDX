use serde::Serialize;
use tauri::{AppHandle, State};

use crate::storage::AppStateStore;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub data_folder: String,
}

#[tauri::command]
pub fn get_app_info(app: AppHandle, store: State<'_, AppStateStore>) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        data_folder: store.folder().display().to_string(),
    }
}
