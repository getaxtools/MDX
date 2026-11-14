use serde::Deserialize;
use tauri::menu::{MenuItemBuilder, PredefinedMenuItem, Submenu, SubmenuBuilder};
use tauri::{AppHandle, State, Wry};

use super::{MainMenu, MenuLabels};
use crate::documents::DocumentError;
use crate::storage::WorkspaceId;

pub const MAX_RECENT_MENU_ENTRIES: usize = 10;
const MAX_LABEL_CHARACTERS: usize = 260;
const OPEN_RECENT_ITEM_PREFIX: &str = "openRecent.";
const OPEN_RECENT_WORKSPACE_ITEM_PREFIX: &str = "openRecentWorkspace.";
const CLEAR_RECENT_ITEM_ID: &str = "clearUnpinnedRecentFiles";

#[derive(Debug, PartialEq, Eq)]
pub struct RecentMenuEntry {
    pub id: String,
    pub label: String,
}

/// A workspace the window showed before, as the webview names it.
#[derive(Debug, Deserialize)]
pub struct RecentWorkspaceInput {
    id: String,
    name: String,
}

/// What File > Open Recent lists: the shown workspace's documents, then other recent workspaces.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct RecentMenuContents {
    pub documents: Vec<RecentMenuEntry>,
    pub workspaces: Vec<RecentMenuEntry>,
}

/// Replaces the File > Open Recent items with the given recent documents and workspaces.
#[tauri::command]
pub fn update_recent_menu(
    display_paths: Vec<String>,
    workspaces: Option<Vec<RecentWorkspaceInput>>,
    app: AppHandle,
    menu: State<'_, MainMenu>,
) -> Result<(), DocumentError> {
    let contents = RecentMenuContents {
        documents: recent_menu_entries(&display_paths),
        workspaces: recent_workspace_entries(&workspaces.unwrap_or_default()),
    };
    let parts = menu.0.lock().map_err(|_| DocumentError::InvalidRequest)?;
    fill_recent_menu(&app, &parts.recent_files, &contents, &parts.labels)
        .map_err(|_| DocumentError::InvalidRequest)
}

pub fn fill_recent_menu(
    app: &AppHandle,
    submenu: &Submenu<Wry>,
    contents: &RecentMenuContents,
    labels: &MenuLabels,
) -> tauri::Result<()> {
    for item in submenu.items()? {
        submenu.remove(&item)?;
    }
    if contents.documents.is_empty() {
        let placeholder = MenuItemBuilder::new(labels.label("menu.file.noRecentFiles"))
            .enabled(false)
            .build(app)?;
        submenu.append(&placeholder)?;
    }
    for entry in &contents.documents {
        submenu.append(&MenuItemBuilder::with_id(&entry.id, &entry.label).build(app)?)?;
    }
    if !contents.workspaces.is_empty() {
        submenu.append(&PredefinedMenuItem::separator(app)?)?;
        submenu.append(&recent_workspaces_submenu(
            app,
            &contents.workspaces,
            labels,
        )?)?;
    }
    if contents.documents.is_empty() {
        return Ok(());
    }
    submenu.append(&PredefinedMenuItem::separator(app)?)?;
    let clear = MenuItemBuilder::with_id(
        CLEAR_RECENT_ITEM_ID,
        labels.label("recentFiles.clearUnpinned"),
    )
    .build(app)?;
    submenu.append(&clear)
}

fn recent_workspaces_submenu(
    app: &AppHandle,
    entries: &[RecentMenuEntry],
    labels: &MenuLabels,
) -> tauri::Result<Submenu<Wry>> {
    let mut builder = SubmenuBuilder::new(app, labels.label("menu.file.recentWorkspaces"));
    for entry in entries {
        builder = builder.item(&MenuItemBuilder::with_id(&entry.id, &entry.label).build(app)?);
    }
    builder.build()
}

/// Workspaces with a malformed id or an empty or overlong name are left out.
pub fn recent_workspace_entries(workspaces: &[RecentWorkspaceInput]) -> Vec<RecentMenuEntry> {
    workspaces
        .iter()
        .filter(|workspace| WorkspaceId::try_from(workspace.id.clone()).is_ok())
        .filter(|workspace| {
            !workspace.name.trim().is_empty()
                && workspace.name.chars().count() <= MAX_LABEL_CHARACTERS
        })
        .take(MAX_RECENT_MENU_ENTRIES)
        .map(|workspace| RecentMenuEntry {
            id: format!("{OPEN_RECENT_WORKSPACE_ITEM_PREFIX}{}", workspace.id),
            label: without_access_keys(&workspace.name),
        })
        .collect()
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

    fn workspace(id: &str, name: &str) -> RecentWorkspaceInput {
        RecentWorkspaceInput {
            id: id.to_owned(),
            name: name.to_owned(),
        }
    }

    #[test]
    fn names_recent_workspaces_by_id_and_skips_malformed_ones() {
        let entries = recent_workspace_entries(&[
            workspace("default", "R&D notes"),
            workspace("../escape", "Bad id"),
            workspace("reading", "  "),
        ]);

        assert_eq!(
            entries,
            vec![RecentMenuEntry {
                id: "openRecentWorkspace.default".to_owned(),
                label: "R&&D notes".to_owned(),
            }]
        );
    }

    #[test]
    fn skips_empty_and_overlong_paths() {
        let overlong = format!(r"C:\{}.md", "x".repeat(MAX_LABEL_CHARACTERS));

        let entries = recent_menu_entries(&paths(&["  ", &overlong, r"C:\ok.md"]));

        assert_eq!(labels_of(&entries), vec![r"C:\ok.md"]);
        assert!(entries.iter().all(|entry| entry.id == "openRecent.0"));
    }
}
