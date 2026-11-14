use serde::Serialize;
use tauri::{AppHandle, State};

use crate::storage::AppStateStore;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub data_folder: String,
    pub allows_planned_kind_preview: bool,
}

#[tauri::command]
pub fn get_app_info(app: AppHandle, store: State<'_, AppStateStore>) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        data_folder: store.folder().display().to_string(),
        allows_planned_kind_preview: allows_planned_kind_preview(),
    }
}

/// Only the UI test build lets planned workspace kinds be chosen, so their switching can be tested.
const fn allows_planned_kind_preview() -> bool {
    cfg!(all(debug_assertions, feature = "webdriver"))
}

#[cfg(all(test, not(feature = "webdriver")))]
mod tests {
    use super::*;

    #[test]
    fn the_preview_is_off_outside_the_ui_test_build() {
        assert!(!allows_planned_kind_preview());
    }
}
