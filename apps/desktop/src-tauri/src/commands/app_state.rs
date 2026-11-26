use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::documents::DocumentAccessList;
use crate::open_requests::grant_saved_paths;
use crate::storage::{AppStateError, AppStateStore, WorkspaceDatabase};

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
    database: State<'_, WorkspaceDatabase>,
) -> Result<(), AppStateCommandError> {
    remove_backups_and_upgrade_copies(&store, &database)
}

/// Clear All Data reaches this even when the workspace database cannot open, so the copies kept
/// before its upgrades are removed here, whether or not every backup could be removed.
fn remove_backups_and_upgrade_copies(
    store: &AppStateStore,
    database: &WorkspaceDatabase,
) -> Result<(), AppStateCommandError> {
    let backups_removed = store.remove_backups().map_err(AppStateCommandError::from);
    let copies_removed = database
        .remove_upgrade_copies()
        .map_err(|_| AppStateCommandError::StorageUnavailable);
    backups_removed.and(copies_removed)
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

    #[test]
    fn upgrade_copies_are_removed_when_a_backup_cannot_be_removed() {
        let folder = tempfile::tempdir().unwrap();
        let copy_path = folder.path().join("mdx.before-0.1.0-schema-1.db");
        std::fs::write(&copy_path, "copy").unwrap();
        std::fs::create_dir(folder.path().join("app-state.corrupt.json")).unwrap();

        let result = remove_backups_and_upgrade_copies(
            &AppStateStore::new(folder.path()),
            &WorkspaceDatabase::new(folder.path()),
        );

        assert_eq!(result, Err(AppStateCommandError::StorageUnavailable));
        assert!(!copy_path.exists());
    }
}
