mod menu_labels;
mod view_menu_state;

use tauri::menu::{
    CheckMenuItem, CheckMenuItemBuilder, Menu, MenuEvent, MenuItem, MenuItemBuilder,
    PredefinedMenuItem, Submenu, SubmenuBuilder,
};
use tauri::{App, AppHandle, Emitter, Manager, State, Wry};

pub use menu_labels::MenuLabels;
pub use view_menu_state::ViewMenuState;

use crate::open_requests::MAIN_WINDOW_LABEL;
use view_menu_state::{
    READING_WIDTH_ITEM_PREFIX, THEME_ITEM_PREFIX, TOGGLE_OUTLINE_ITEM_ID, TOGGLE_SIDEBAR_ITEM_ID,
};

pub const MENU_COMMAND_EVENT: &str = "menu-command";
const EXIT_ITEM_ID: &str = "exit";

struct CheckChoices {
    title_key: &'static str,
    id_prefix: &'static str,
    choices: &'static [&'static str],
}

const THEME_CHOICES: CheckChoices = CheckChoices {
    title_key: "menu.view.theme",
    id_prefix: THEME_ITEM_PREFIX,
    choices: &["system", "light", "dark"],
};

const READING_WIDTH_CHOICES: CheckChoices = CheckChoices {
    title_key: "menu.view.readingWidth",
    id_prefix: READING_WIDTH_ITEM_PREFIX,
    choices: &["narrow", "medium", "wide", "full"],
};

pub struct ViewMenuItems(Vec<CheckMenuItem<Wry>>);

pub fn install_main_menu(app: &App) -> tauri::Result<()> {
    let mut builder = MainMenuBuilder {
        app,
        labels: MenuLabels::english(),
        view_items: Vec::new(),
    };
    let menu = Menu::with_items(
        app,
        &[
            &builder.file_menu()?,
            &builder.edit_menu()?,
            &builder.view_menu()?,
            &builder.help_menu()?,
        ],
    )?;
    app.set_menu(menu)?;
    app.manage(ViewMenuItems(builder.view_items));
    Ok(())
}

pub fn handle_menu_event(app: &AppHandle, event: &MenuEvent) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    if event.id().as_ref() == EXIT_ITEM_ID {
        let _ = window.close();
        return;
    }
    let _ = window.emit(MENU_COMMAND_EVENT, event.id().as_ref());
}

#[tauri::command]
pub fn update_view_menu(state: ViewMenuState, items: State<'_, ViewMenuItems>) {
    for item in &items.0 {
        let _ = item.set_checked(state.is_checked(item.id().as_ref()));
    }
}

struct MainMenuBuilder<'a> {
    app: &'a App,
    labels: MenuLabels,
    view_items: Vec<CheckMenuItem<Wry>>,
}

impl MainMenuBuilder<'_> {
    fn file_menu(&self) -> tauri::Result<Submenu<Wry>> {
        SubmenuBuilder::new(self.app, self.labels.label("menu.file"))
            .item(&self.command_item("openDocuments", "menu.file.open", Some("Ctrl+O"))?)
            .item(&self.command_item("openFolder", "menu.file.openFolder", None)?)
            .item(&self.command_item("closeActiveTab", "menu.file.closeTab", Some("Ctrl+W"))?)
            .separator()
            .item(&self.command_item("print", "menu.file.print", Some("Ctrl+P"))?)
            .separator()
            .item(&self.command_item(EXIT_ITEM_ID, "menu.file.exit", None)?)
            .build()
    }

    fn edit_menu(&self) -> tauri::Result<Submenu<Wry>> {
        let copy = PredefinedMenuItem::copy(self.app, Some(&self.labels.label("menu.edit.copy")))?;
        let select_all = PredefinedMenuItem::select_all(
            self.app,
            Some(&self.labels.label("menu.edit.selectAll")),
        )?;
        SubmenuBuilder::new(self.app, self.labels.label("menu.edit"))
            .item(&copy)
            .item(&select_all)
            .separator()
            .item(&self.command_item("showFind", "menu.edit.find", Some("Ctrl+F"))?)
            .build()
    }

    fn view_menu(&mut self) -> tauri::Result<Submenu<Wry>> {
        let themes = self.check_submenu(&THEME_CHOICES)?;
        let reading_widths = self.check_submenu(&READING_WIDTH_CHOICES)?;
        let sidebar =
            self.toggle_item(TOGGLE_SIDEBAR_ITEM_ID, "menu.view.toggleSidebar", "Ctrl+B")?;
        let outline = self.toggle_item(
            TOGGLE_OUTLINE_ITEM_ID,
            "menu.view.toggleOutline",
            "Ctrl+Shift+O",
        )?;
        SubmenuBuilder::new(self.app, self.labels.label("menu.view"))
            .item(&themes)
            .item(&reading_widths)
            .separator()
            .item(&self.command_item("zoomIn", "menu.view.zoomIn", Some("Ctrl+="))?)
            .item(&self.command_item("zoomOut", "menu.view.zoomOut", Some("Ctrl+-"))?)
            .item(&self.command_item("resetZoom", "menu.view.resetZoom", Some("Ctrl+0"))?)
            .separator()
            .item(&self.command_item(
                "toggleSourceView",
                "menu.view.toggleSource",
                Some("Ctrl+U"),
            )?)
            .item(&sidebar)
            .item(&outline)
            .build()
    }

    fn help_menu(&self) -> tauri::Result<Submenu<Wry>> {
        SubmenuBuilder::new(self.app, self.labels.label("menu.help"))
            .item(&self.command_item(
                "showKeyboardShortcuts",
                "menu.help.keyboardShortcuts",
                Some("F1"),
            )?)
            .separator()
            .item(&self.command_item("showAbout", "menu.help.about", None)?)
            .build()
    }

    fn toggle_item(
        &mut self,
        id: &str,
        label_key: &str,
        shortcut: &str,
    ) -> tauri::Result<CheckMenuItem<Wry>> {
        let label = self.labels.label_with_shortcut(label_key, shortcut);
        let item = CheckMenuItemBuilder::with_id(id, label)
            .checked(true)
            .build(self.app)?;
        self.view_items.push(item.clone());
        Ok(item)
    }

    fn check_submenu(&mut self, choices: &CheckChoices) -> tauri::Result<Submenu<Wry>> {
        let mut submenu = SubmenuBuilder::new(self.app, self.labels.label(choices.title_key));
        for choice in choices.choices {
            let label = self
                .labels
                .label(&format!("{}.{choice}", choices.title_key));
            let item =
                CheckMenuItemBuilder::with_id(format!("{}{choice}", choices.id_prefix), label)
                    .build(self.app)?;
            submenu = submenu.item(&item);
            self.view_items.push(item);
        }
        submenu.build()
    }

    fn command_item(
        &self,
        id: &str,
        label_key: &str,
        shortcut: Option<&str>,
    ) -> tauri::Result<MenuItem<Wry>> {
        let label = match shortcut {
            Some(shortcut) => self.labels.label_with_shortcut(label_key, shortcut),
            None => self.labels.label(label_key),
        };
        MenuItemBuilder::with_id(id, label).build(self.app)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_menu_choice_has_a_label_in_the_catalog() {
        let labels = MenuLabels::english();

        for choices in [THEME_CHOICES, READING_WIDTH_CHOICES] {
            for choice in choices.choices {
                let key = format!("{}.{choice}", choices.title_key);
                assert!(labels.has(&key), "{key}");
            }
        }
    }
}
