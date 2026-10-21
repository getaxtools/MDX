use tauri::menu::{MenuItemBuilder, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, State, Wry};

use super::{MainMenu, MenuLabels};
use crate::documents::DocumentError;

pub const MAX_RECENT_MENU_ENTRIES: usize = 10;
const MAX_LABEL_CHARACTERS: usize = 260;
const OPEN_RECENT_ITEM_PREFIX: &str = "openRecent.";
const CLEAR_RECENT_ITEM_ID: &str = "clearUnpinnedRecentFiles";

#[derive(Debug, PartialEq, Eq)]
pub struct RecentMenuEntry {
    pub id: String,
    pub label: String,
}

/// Replaces the File > Open Recent items with the given recent documents.
#[tauri::command]
pub fn update_recent_menu(
    display_paths: Vec<String>,
    app: AppHandle,
    menu: State<'_, MainMenu>,
) -> Result<(), DocumentError> {
    let entries = recent_menu_entries(&display_paths);
    let parts = menu.0.lock().map_err(|_| DocumentError::InvalidRequest)?;
    fill_recent_menu(&app, &parts.recent_files, &entries, &parts.labels)
        .map_err(|_| DocumentError::InvalidRequest)
}

pub fn fill_recent_menu(
    app: &AppHandle,
    submenu: &Submenu<Wry>,
    entries: &[RecentMenuEntry],
    labels: &MenuLabels,
) -> tauri::Result<()> {
    for item in submenu.items()? {
        submenu.remove(&item)?;
    }
    if entries.is_empty() {
        let placeholder = MenuItemBuilder::new(labels.label("menu.file.noRecentFiles"))
            .enabled(false)
            .build(app)?;
        return submenu.append(&placeholder);
    }
    for entry in entries {
        submenu.append(&MenuItemBuilder::with_id(&entry.id, &entry.label).build(app)?)?;
    }
    submenu.append(&PredefinedMenuItem::separator(app)?)?;
    let clear = MenuItemBuilder::with_id(
        CLEAR_RECENT_ITEM_ID,
        labels.label("recentFiles.clearUnpinned"),
    )
    .build(app)?;
    submenu.append(&clear)
}

pub fn recent_menu_entries(display_paths: &[String]) -> Vec<RecentMenuEntry> {
    display_paths
        .iter()
        .filter(|path| !path.trim().is_empty() && path.chars().count() <= MAX_LABEL_CHARACTERS)
        .take(MAX_RECENT_MENU_ENTRIES)
        .enumerate()
        .map(|(index, path)| RecentMenuEntry {
            id: format!("{OPEN_RECENT_ITEM_PREFIX}{index}"),
            label: without_access_keys(path),
        })
        .collect()
}

/// Windows menus treat `&` as an access-key marker, so a literal one is doubled.
fn without_access_keys(label: &str) -> String {
    label.replace('&', "&&")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    fn labels_of(entries: &[RecentMenuEntry]) -> Vec<&str> {
        entries.iter().map(|entry| entry.label.as_str()).collect()
    }

    #[test]
    fn numbers_entries_by_their_position_in_the_recent_files_list() {
        let entries = recent_menu_entries(&paths(&[r"C:\Docs\a.md", r"C:\Docs\b.md"]));

        assert_eq!(
            entries,
            vec![
                RecentMenuEntry {
                    id: "openRecent.0".to_owned(),
                    label: r"C:\Docs\a.md".to_owned()
                },
                RecentMenuEntry {
                    id: "openRecent.1".to_owned(),
                    label: r"C:\Docs\b.md".to_owned()
                },
            ]
        );
    }

    #[test]
    fn shows_ampersands_in_paths_literally() {
        let entries = recent_menu_entries(&paths(&[r"C:\R&D\plan.md"]));

        assert_eq!(labels_of(&entries), vec![r"C:\R&&D\plan.md"]);
    }

    #[test]
    fn keeps_at_most_ten_entries() {
        let many: Vec<String> = (0..25).map(|index| format!(r"C:\{index}.md")).collect();

        assert_eq!(recent_menu_entries(&many).len(), MAX_RECENT_MENU_ENTRIES);
    }

    #[test]
    fn skips_empty_and_overlong_paths() {
        let overlong = format!(r"C:\{}.md", "x".repeat(MAX_LABEL_CHARACTERS));

        let entries = recent_menu_entries(&paths(&["  ", &overlong, r"C:\ok.md"]));

        assert_eq!(labels_of(&entries), vec![r"C:\ok.md"]);
        assert!(entries.iter().all(|entry| entry.id == "openRecent.0"));
    }
}
