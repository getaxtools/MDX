use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::documents::DocumentAccessList;
use crate::open_requests::grant_saved_paths;
use crate::storage::{AppStateError, AppStateStore};

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum AppStateCommandError {
    InvalidState,
    StorageUnavailable,
}

impl From<AppStateError> for AppStateCommandError {
    fn from(error: AppStateError) -> Self {
        match error {
            AppStateError::InvalidJson | AppStateError::TooLarge => Self::InvalidState,
            AppStateError::Storage(_) => Self::StorageUnavailable,
        }
    }
}

#[tauri::command]
pub fn load_app_state(
    store: State<'_, AppStateStore>,
) -> Result<Option<String>, AppStateCommandError> {
    Ok(store.load()?)
}

#[tauri::command]
pub fn save_app_state(
    state_json: String,
    store: State<'_, AppStateStore>,
) -> Result<(), AppStateCommandError> {
    Ok(store.save(&state_json)?)
}

/// Used only while the earlier state file stands in for the workspace database.
#[tauri::command]
pub fn grant_app_state_access(
    store: State<'_, AppStateStore>,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<(), AppStateCommandError> {
    if let Some(saved) = store.load()? {
        grant_saved_paths(&saved, &access);
    }
    Ok(())
}

#[tauri::command]
pub fn remove_app_state_backups(
    store: State<'_, AppStateStore>,
) -> Result<(), AppStateCommandError> {
    Ok(store.remove_backups()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_invalid_or_oversized_state_as_invalid() {
        assert_eq!(
            AppStateCommandError::from(AppStateError::InvalidJson),
            AppStateCommandError::InvalidState
        );
        assert_eq!(
            AppStateCommandError::from(AppStateError::TooLarge),
            AppStateCommandError::InvalidState
        );
    }

    #[test]
    fn reports_file_system_failures_as_storage_unavailable() {
        let error = AppStateError::Storage("disk full".to_owned());

        assert_eq!(
            AppStateCommandError::from(error),
            AppStateCommandError::StorageUnavailable
        );
    }
}
