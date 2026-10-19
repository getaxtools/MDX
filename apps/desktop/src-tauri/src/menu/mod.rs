mod menu_labels;
pub mod recent_files_menu;
mod view_menu_state;

use tauri::menu::{
    CheckMenuItem, CheckMenuItemBuilder, Menu, MenuEvent, MenuItem, MenuItemBuilder,
    PredefinedMenuItem, Submenu, SubmenuBuilder,
};
use tauri::{App, AppHandle, Emitter, Manager, State, Wry};

pub use menu_labels::MenuLabels;
pub use view_menu_state::ViewMenuState;

use crate::open_requests::MAIN_WINDOW_LABEL;
use recent_files_menu::{RecentFilesMenu, fill_recent_menu};
use view_menu_state::{
    READING_WIDTH_ITEM_PREFIX, THEME_ITEM_PREFIX, TOGGLE_OUTLINE_ITEM_ID, TOGGLE_SIDEBAR_ITEM_ID,
    TOGGLE_SOURCE_VIEW_ITEM_ID, TOGGLE_STATUS_BAR_ITEM_ID,
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

/// Menu item id, label key and the shortcut shown next to it.
type CommandItem = (&'static str, &'static str, Option<&'static str>);

const FILE_OPEN_ITEMS: [CommandItem; 2] = [
    ("openDocuments", "menu.file.open", Some("Ctrl+O")),
    ("openFolder", "menu.file.openFolder", None),
];

const FILE_SAVE_ITEMS: [CommandItem; 3] = [
    ("saveDocument", "menu.file.save", Some("Ctrl+S")),
    ("saveDocumentAs", "menu.file.saveAs", Some("Ctrl+Shift+S")),
    ("saveAllDocuments", "menu.file.saveAll", Some("Ctrl+Alt+S")),
];

const FILE_OTHER_ITEMS: [CommandItem; 4] = [
    ("reopenClosedTab", "tabs.reopenClosed", Some("Ctrl+Shift+T")),
    (
        "toggleFavourite",
        "menu.file.toggleFavourite",
        Some("Ctrl+D"),
    ),
    ("closeActiveTab", "menu.file.closeTab", Some("Ctrl+W")),
    ("print", "menu.file.print", Some("Ctrl+P")),
];

const FAVOURITES_FILE_ITEMS: [CommandItem; 2] = [
    ("exportFavourites", "menu.file.exportFavourites", None),
    ("importFavourites", "menu.file.importFavourites", None),
];

const REOPEN_WITH_ENCODING_PREFIX: &str = "reopenWithEncoding.";
const DETECT_ENCODING_CHOICE: &str = "detect";

/// The encodings offered under File > Reopen with Encoding, as WHATWG labels.
const REOPEN_ENCODINGS: [&str; 19] = [
    "utf-8",
    "utf-16le",
    "utf-16be",
    "windows-1252",
    "iso-8859-15",
    "windows-1250",
    "iso-8859-2",
    "windows-1251",
    "koi8-r",
    "windows-1253",
    "windows-1254",
    "windows-1255",
    "windows-1256",
    "windows-874",
    "shift_jis",
    "euc-jp",
    "gb18030",
    "big5",
    "euc-kr",
];

const EDIT_ITEMS: [CommandItem; 2] = [
    ("showFind", "menu.edit.find", Some("Ctrl+F")),
    ("showPasteTable", "menu.edit.pasteTable", Some("Ctrl+Alt+V")),
];

const ZOOM_ITEMS: [CommandItem; 3] = [
    ("zoomIn", "menu.view.zoomIn", Some("Ctrl++")),
    ("zoomOut", "menu.view.zoomOut", Some("Ctrl+-")),
    ("resetZoom", "menu.view.resetZoom", Some("Ctrl+0")),
];

const TAB_SWITCH_ITEMS: [CommandItem; 2] = [
    ("nextTab", "menu.window.nextTab", Some("Ctrl+Tab")),
    (
        "previousTab",
        "menu.window.previousTab",
        Some("Ctrl+Shift+Tab"),
    ),
];

const TAB_ARRANGE_ITEMS: [CommandItem; 3] = [
    (
        "moveTabLeft",
        "menu.window.moveTabLeft",
        Some("Ctrl+Shift+PgUp"),
    ),
    (
        "moveTabRight",
        "menu.window.moveTabRight",
        Some("Ctrl+Shift+PgDn"),
    ),
    ("togglePinActiveTab", "menu.window.togglePin", None),
];

const TAB_CLOSE_ITEMS: [CommandItem; 3] = [
    ("closeActiveTab", "menu.file.closeTab", Some("Ctrl+W")),
    ("closeInactiveTabs", "menu.window.closeOthers", None),
    (
        "closeTabsRightOfActive",
        "menu.window.closeToTheRight",
        None,
    ),
];

const HELP_ITEMS: [CommandItem; 2] = [
    (
        "showKeyboardShortcuts",
        "menu.help.keyboardShortcuts",
        Some("F1"),
    ),
    ("showAbout", "menu.help.about", None),
];

pub struct ViewMenuItems(Vec<CheckMenuItem<Wry>>);

pub fn install_main_menu(app: &App) -> tauri::Result<()> {
    let mut builder = MainMenuBuilder {
        app,
        labels: MenuLabels::english(),
        view_items: Vec::new(),
    };
    let recent_files =
        SubmenuBuilder::new(app, builder.labels.label("menu.file.openRecent")).build()?;
    fill_recent_menu(app.handle(), &recent_files, &[])?;
    let menu = Menu::with_items(
        app,
        &[
            &builder.file_menu(&recent_files)?,
            &builder.edit_menu()?,
            &builder.view_menu()?,
            &builder.window_menu()?,
            &builder.help_menu()?,
        ],
    )?;
    app.set_menu(menu)?;
    app.manage(ViewMenuItems(builder.view_items));
    app.manage(RecentFilesMenu(recent_files));
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
    fn file_menu(&self, recent_files: &Submenu<Wry>) -> tauri::Result<Submenu<Wry>> {
        let [reopen_closed, favourite, close_tab, print] =
            FILE_OTHER_ITEMS.map(|item| self.command_item(item));
        let builder = SubmenuBuilder::new(self.app, self.labels.label("menu.file"));
        let builder = self
            .with_items(builder, &FILE_OPEN_ITEMS)?
            .item(recent_files)
            .item(&reopen_closed?)
            .item(&self.reopen_with_encoding_menu()?)
            .separator();
        let builder = self
            .with_items(builder, &FILE_SAVE_ITEMS)?
            .separator()
            .item(&favourite?);
        self.with_items(builder, &FAVOURITES_FILE_ITEMS)?
            .separator()
            .item(&close_tab?)
            .separator()
            .item(&print?)
            .separator()
            .item(&self.command_item((EXIT_ITEM_ID, "menu.file.exit", Some("Alt+F4")))?)
            .build()
    }

    fn reopen_with_encoding_menu(&self) -> tauri::Result<Submenu<Wry>> {
        let detect = MenuItemBuilder::with_id(
            format!("{REOPEN_WITH_ENCODING_PREFIX}{DETECT_ENCODING_CHOICE}"),
            self.labels.label("encoding.detect"),
        )
        .build(self.app)?;
        let builder = SubmenuBuilder::new(self.app, self.labels.label("encoding.reopen"))
            .item(&detect)
            .separator();
        let encodings = REOPEN_ENCODINGS
            .iter()
            .map(|encoding| {
                MenuItemBuilder::with_id(
                    format!("{REOPEN_WITH_ENCODING_PREFIX}{encoding}"),
                    self.labels.label(&encoding_name_key(encoding)),
                )
                .build(self.app)
            })
            .collect::<tauri::Result<Vec<_>>>()?;
        encodings
            .iter()
            .fold(builder, |builder, item| builder.item(item))
            .build()
    }

    fn edit_menu(&self) -> tauri::Result<Submenu<Wry>> {
        let copy = PredefinedMenuItem::copy(self.app, Some(&self.labels.label("menu.edit.copy")))?;
        let select_all = PredefinedMenuItem::select_all(
            self.app,
            Some(&self.labels.label("menu.edit.selectAll")),
        )?;
        let [find, paste_table] = EDIT_ITEMS.map(|item| self.command_item(item));
        SubmenuBuilder::new(self.app, self.labels.label("menu.edit"))
            .item(&copy)
            .item(&select_all)
            .separator()
            .item(&find?)
            .separator()
            .item(&paste_table?)
            .build()
    }

    fn view_menu(&mut self) -> tauri::Result<Submenu<Wry>> {
        let themes = self.check_submenu(&THEME_CHOICES)?;
        let reading_widths = self.check_submenu(&READING_WIDTH_CHOICES)?;
        let source_view = self.toggle_item(
            TOGGLE_SOURCE_VIEW_ITEM_ID,
            "menu.view.toggleSource",
            Some("Ctrl+U"),
        )?;
        let sidebar = self.toggle_item(
            TOGGLE_SIDEBAR_ITEM_ID,
            "menu.view.toggleSidebar",
            Some("Ctrl+B"),
        )?;
        let outline = self.toggle_item(
            TOGGLE_OUTLINE_ITEM_ID,
            "menu.view.toggleOutline",
            Some("Ctrl+Shift+O"),
        )?;
        let status_bar =
            self.toggle_item(TOGGLE_STATUS_BAR_ITEM_ID, "menu.view.toggleStatusBar", None)?;
        let builder = SubmenuBuilder::new(self.app, self.labels.label("menu.view"))
            .item(&themes)
            .item(&reading_widths)
            .separator();
        self.with_items(builder, &ZOOM_ITEMS)?
            .separator()
            .item(&source_view)
            .separator()
            .item(&sidebar)
            .item(&outline)
            .item(&status_bar)
            .build()
    }

    fn window_menu(&self) -> tauri::Result<Submenu<Wry>> {
        let builder = SubmenuBuilder::new(self.app, self.labels.label("menu.window"));
        let builder = self.with_items(builder, &TAB_SWITCH_ITEMS)?.separator();
        let builder = self.with_items(builder, &TAB_ARRANGE_ITEMS)?.separator();
        self.with_items(builder, &TAB_CLOSE_ITEMS)?.build()
    }

    fn help_menu(&self) -> tauri::Result<Submenu<Wry>> {
        let [shortcuts, about] = HELP_ITEMS.map(|item| self.command_item(item));
        SubmenuBuilder::new(self.app, self.labels.label("menu.help"))
            .item(&shortcuts?)
            .separator()
            .item(&about?)
            .build()
    }

    fn with_items<'m>(
        &self,
        builder: SubmenuBuilder<'m, Wry, App>,
        items: &[CommandItem],
    ) -> tauri::Result<SubmenuBuilder<'m, Wry, App>> {
        let menu_items = self.command_items(items)?;
        Ok(menu_items
            .iter()
            .fold(builder, |builder, item| builder.item(item)))
    }

    fn command_items(&self, items: &[CommandItem]) -> tauri::Result<Vec<MenuItem<Wry>>> {
        items.iter().map(|item| self.command_item(*item)).collect()
    }

    fn toggle_item(
        &mut self,
        id: &str,
        label_key: &str,
        shortcut: Option<&str>,
    ) -> tauri::Result<CheckMenuItem<Wry>> {
        let item = CheckMenuItemBuilder::with_id(id, self.label_for(label_key, shortcut))
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

    fn command_item(&self, (id, label_key, shortcut): CommandItem) -> tauri::Result<MenuItem<Wry>> {
        MenuItemBuilder::with_id(id, self.label_for(label_key, shortcut)).build(self.app)
    }

    fn label_for(&self, label_key: &str, shortcut: Option<&str>) -> String {
        match shortcut {
            Some(shortcut) => self.labels.label_with_shortcut(label_key, shortcut),
            None => self.labels.label(label_key),
        }
    }
}

fn encoding_name_key(encoding: &str) -> String {
    let compact: String = encoding
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .collect();
    format!("encoding.name.{compact}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_reopen_encoding_is_known_and_named_in_the_catalog() {
        let labels = MenuLabels::english();

        for encoding in REOPEN_ENCODINGS {
            assert!(
                crate::documents::encoding_for_label(encoding).is_some(),
                "{encoding}"
            );
            assert!(labels.has(&encoding_name_key(encoding)), "{encoding}");
        }
    }

    #[test]
    fn every_command_item_has_a_label_in_the_catalog() {
        let labels = MenuLabels::english();
        let items = FILE_OPEN_ITEMS
            .iter()
            .chain(&FILE_SAVE_ITEMS)
            .chain(&FILE_OTHER_ITEMS)
            .chain(&FAVOURITES_FILE_ITEMS)
            .chain(&EDIT_ITEMS)
            .chain(&ZOOM_ITEMS)
            .chain(&TAB_SWITCH_ITEMS)
            .chain(&TAB_ARRANGE_ITEMS)
            .chain(&TAB_CLOSE_ITEMS)
            .chain(&HELP_ITEMS);

        for (_, label_key, _) in items {
            assert!(labels.has(label_key), "{label_key}");
        }
    }

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
