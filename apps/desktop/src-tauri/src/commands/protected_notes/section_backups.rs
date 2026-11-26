//! Backups of a protected section, made and restored as the encrypted files they are, in a folder
//! the user picks in the app's own dialog; the window never names a folder.

use std::path::PathBuf;

use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use super::{
    Answer, ProtectedCommandError, ProtectedNotes, SectionPlace, section_place, state_of,
    writable_section_place,
};
use crate::commands::documents::run_blocking;

impl ProtectedNotes {
    /// Copies the section into a new folder inside the one `choose_folder` gives, never inside the
    /// section; resolves to that folder, or nothing when the user cancelled.
    fn back_up(
        &self,
        place: &SectionPlace,
        choose_folder: impl FnOnce() -> Option<PathBuf>,
    ) -> Answer<Option<String>> {
        if !place.folder.is_set_up() {
            return Err(ProtectedCommandError::NotSetUp);
        }
        let Some(chosen) = choose_folder() else {
            return Ok(None);
        };
        let into = dunce::canonicalize(chosen).map_err(|_| ProtectedCommandError::NotFound)?;
        let section =
            dunce::canonicalize(&place.folder).map_err(|_| ProtectedCommandError::Unavailable)?;
        if into.starts_with(&section) {
            return Err(ProtectedCommandError::AccessDenied);
        }
        let _copying = self.copying_files();
        let backup = place.folder.back_up(&into)?;
        Ok(Some(backup.to_string_lossy().into_owned()))
    }

    /// Restores the backup folder `choose_folder` gives where this location has no section; the
    /// section is then locked and unlocks with the password or recovery key of the backup.
    fn restore(
        &self,
        place: &SectionPlace,
        choose_folder: impl FnOnce() -> Option<PathBuf>,
    ) -> Answer<bool> {
        if place.folder.is_set_up() {
            return Err(ProtectedCommandError::AlreadySetUp);
        }
        let Some(backup) = choose_folder() else {
            return Ok(false);
        };
        let _copying = self.copying_files();
        if self.sections().contains_key(&place.location_key) {
            return Err(ProtectedCommandError::AlreadySetUp);
        }
        place.folder.restore_from(&backup)?;
        Ok(true)
    }
}

fn picked_folder(app: &AppHandle, window: &WebviewWindow) -> Option<PathBuf> {
    // Owned by the window, so the dialog is modal and the section cannot change meanwhile.
    app.dialog()
        .file()
        .set_parent(window)
        .blocking_pick_folder()
        .and_then(|folder| folder.into_path().ok())
}

/// Backs the section up, still encrypted, into a folder the user picks; resolves to the backup's
/// folder, or `null` when the user cancelled.
#[tauri::command]
pub async fn protected_back_up(
    location: String,
    app: AppHandle,
    window: WebviewWindow,
) -> Answer<Option<String>> {
    let place = section_place(&window, &location)?;
    let state = state_of(&window);
    run_blocking(move || state.back_up(&place, || picked_folder(&app, &window))).await?
}

/// Restores a backup the user picks where this notes location has no section; resolves to whether
/// it was restored.
#[tauri::command]
pub async fn protected_restore(
    location: String,
    app: AppHandle,
    window: WebviewWindow,
) -> Answer<bool> {
    let place = writable_section_place(&window, &location)?;
    let state = state_of(&window);
    run_blocking(move || state.restore(&place, || picked_folder(&app, &window))).await?
}

#[cfg(test)]
mod tests;
