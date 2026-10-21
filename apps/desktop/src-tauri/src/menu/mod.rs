mod menu_labels;
pub mod recent_files_menu;
mod view_menu_state;

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::menu::{
    CheckMenuItem, CheckMenuItemBuilder, Menu, MenuEvent, MenuItem, MenuItemBuilder,
    PredefinedMenuItem, Submenu, SubmenuBuilder,
};

use tauri::{App, AppHandle, Emitter, Manager, State, Wry};

pub use menu_labels::MenuLabels;
pub use view_menu_state::ViewMenuState;

use crate::documents::DocumentError;
use crate::open_requests::MAIN_WINDOW_LABEL;
use recent_files_menu::fill_recent_menu;
use view_menu_state::{
    READING_WIDTH_ITEM_PREFIX, THEME_ITEM_PREFIX, TOGGLE_OUTLINE_ITEM_ID,
    TOGGLE_PREVIEW_BESIDE_EDITOR_ITEM_ID, TOGGLE_SIDEBAR_ITEM_ID, TOGGLE_SOURCE_VIEW_ITEM_ID,
    TOGGLE_STATUS_BAR_ITEM_ID, TYPOGRAPHY_ITEM_PREFIX,
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

const TYPOGRAPHY_CHOICES: CheckChoices = CheckChoices {
    title_key: "menu.view.typography",
    id_prefix: TYPOGRAPHY_ITEM_PREFIX,
    choices: &["github", "book", "academic"],
};

/// Menu item id, label key and the shortcut shown next to it.
type CommandItem = (&'static str, &'static str, Option<&'static str>);

const FILE_OPEN_ITEMS: [CommandItem; 3] = [
    ("newDocument", "menu.file.newDocument", Some("Ctrl+N")),
    ("openDocuments", "menu.file.open", Some("Ctrl+O")),
    ("openFolder", "menu.file.openFolder", None),
];

const FILE_SAVE_ITEMS: [CommandItem; 5] = [
    ("saveDocument", "menu.file.save", Some("Ctrl+S")),
    ("saveDocumentAs", "menu.file.saveAs", Some("Ctrl+Shift+S")),
    ("saveAllDocuments", "menu.file.saveAll", Some("Ctrl+Alt+S")),
    ("revertDocument", "menu.file.revert", None),
    ("reloadActiveDocument", "menu.file.reload", Some("F5")),
];

const EDIT_HISTORY_ITEMS: [CommandItem; 2] = [
    ("undo", "menu.edit.undo", Some("Ctrl+Z")),
    ("redo", "menu.edit.redo", Some("Ctrl+Y")),
];

const EDIT_SEARCH_ITEMS: [CommandItem; 4] = [
    ("showFind", "menu.edit.find", Some("Ctrl+F")),
    (
        "showFolderSearch",
        "menu.edit.findInFolders",
        Some("Ctrl+Shift+F"),
    ),
    ("showReplace", "menu.edit.replace", Some("Ctrl+H")),
    ("goToLine", "menu.edit.goToLine", Some("Ctrl+G")),
];

const COPY_AS_HTML_ITEM: CommandItem = ("copyAsHtml", "menu.edit.copyAsHtml", None);

const TOGGLE_EDITING_ITEM: CommandItem =
    ("toggleEditing", "menu.view.toggleEditing", Some("Ctrl+/"));

const SETTINGS_ITEM: CommandItem = ("showSettings", "menu.file.settings", Some("Ctrl+,"));

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

const EXPORT_ITEMS: [CommandItem; 2] = [
    ("exportAsHtml", "menu.file.exportAsHtml", None),
    ("exportAsPlainText", "menu.file.exportAsPlainText", None),
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

const PASTE_TABLE_ITEM: CommandItem =
    ("showPasteTable", "menu.edit.pasteTable", Some("Ctrl+Alt+V"));

const COMMAND_PALETTE_ITEM: CommandItem = (
    "showCommandPalette",
    "menu.view.commandPalette",
    Some("Ctrl+Shift+P"),
);

const SOURCE_VIEW_TOGGLE_ITEM: CommandItem = (
    TOGGLE_SOURCE_VIEW_ITEM_ID,
    "menu.view.toggleSource",
    Some("Ctrl+U"),
);

const PREVIEW_BESIDE_EDITOR_TOGGLE_ITEM: CommandItem = (
    TOGGLE_PREVIEW_BESIDE_EDITOR_ITEM_ID,
    "menu.view.previewBeside",
    Some("Ctrl+\\"),
);

const PANEL_TOGGLE_ITEMS: [CommandItem; 3] = [
    (
        TOGGLE_SIDEBAR_ITEM_ID,
        "menu.view.toggleSidebar",
        Some("Ctrl+Shift+E"),
    ),
    (
        TOGGLE_OUTLINE_ITEM_ID,
        "menu.view.toggleOutline",
        Some("Ctrl+Shift+O"),
    ),
    (TOGGLE_STATUS_BAR_ITEM_ID, "menu.view.toggleStatusBar", None),
];

const FULL_SCREEN_ITEM: CommandItem = ("toggleFullScreen", "menu.view.fullScreen", Some("F11"));

const NAVIGATION_ITEMS: [CommandItem; 2] = [
    ("goBack", "menu.view.goBack", Some("Alt+Left")),
    ("goForward", "menu.view.goForward", Some("Alt+Right")),
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

const MAX_TRANSLATED_LABELS: usize = 5_000;
const MAX_TRANSLATED_LABEL_CHARACTERS: usize = 1_000;

/// The parts of the main menu that change after it is built: check marks, Open Recent and labels.
pub struct MainMenuParts {
    pub labels: MenuLabels,
    pub view_items: Vec<CheckMenuItem<Wry>>,
    pub recent_files: Submenu<Wry>,
}

pub struct MainMenu(pub Mutex<MainMenuParts>);

pub fn install_main_menu(app: &App) -> tauri::Result<()> {
    let parts = build_main_menu(app.handle(), MenuLabels::english())?;
    app.manage(MainMenu(Mutex::new(parts)));
    Ok(())
}

fn build_main_menu(app: &AppHandle, labels: MenuLabels) -> tauri::Result<MainMenuParts> {
    let mut builder = MainMenuBuilder {
        app,
        labels,
        view_items: Vec::new(),
    };
    let recent_files =
        SubmenuBuilder::new(app, builder.labels.label("menu.file.openRecent")).build()?;
    fill_recent_menu(app, &recent_files, &[], &builder.labels)?;
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
    Ok(MainMenuParts {
        labels: builder.labels,
        view_items: builder.view_items,
        recent_files,
    })
}

/// Builds the menu again in the display language the window chose, from the saved language or
/// the language of Windows. Labels the translation does not have stay in English.
#[tauri::command]
pub fn update_menu_language(
    labels: HashMap<String, String>,
    app: AppHandle,
    menu: State<'_, MainMenu>,
) -> Result<(), DocumentError> {
    if !are_valid_menu_labels(&labels) {
        return Err(DocumentError::InvalidRequest);
    }
    let parts = build_main_menu(&app, MenuLabels::with_translations(labels))
        .map_err(|_| DocumentError::InvalidRequest)?;
    *menu.0.lock().map_err(|_| DocumentError::InvalidRequest)? = parts;
    Ok(())
}

fn are_valid_menu_labels(labels: &HashMap<String, String>) -> bool {
    labels.len() <= MAX_TRANSLATED_LABELS
        && labels.iter().all(|(key, label)| {
            key.len() <= MAX_TRANSLATED_LABEL_CHARACTERS
                && label.chars().count() <= MAX_TRANSLATED_LABEL_CHARACTERS
        })
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
pub fn update_view_menu(state: ViewMenuState, menu: State<'_, MainMenu>) {
    let Ok(parts) = menu.0.lock() else {
        return;
    };
    for item in &parts.view_items {
        let _ = item.set_checked(state.is_checked(item.id().as_ref()));
    }
}

struct MainMenuBuilder<'a> {
    app: &'a AppHandle,
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
        let builder = self.with_items(builder, &FILE_SAVE_ITEMS)?.separator();
        let builder = self
            .with_items(builder, &EXPORT_ITEMS)?
            .separator()
            .item(&favourite?);
        self.with_items(builder, &FAVOURITES_FILE_ITEMS)?
            .separator()
            .item(&close_tab?)
            .separator()
            .item(&print?)
            .separator()
            .item(&self.command_item(SETTINGS_ITEM)?)
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
        let cut = PredefinedMenuItem::cut(self.app, Some(&self.labels.label("menu.edit.cut")))?;
        let copy = PredefinedMenuItem::copy(self.app, Some(&self.labels.label("menu.edit.copy")))?;
        let paste =
            PredefinedMenuItem::paste(self.app, Some(&self.labels.label("menu.edit.paste")))?;
        let select_all = PredefinedMenuItem::select_all(
            self.app,
            Some(&self.labels.label("menu.edit.selectAll")),
        )?;
        let builder = SubmenuBuilder::new(self.app, self.labels.label("menu.edit"));
        let builder = self
            .with_items(builder, &EDIT_HISTORY_ITEMS)?
            .separator()
            .item(&cut)
            .item(&copy)
            .item(&self.command_item(COPY_AS_HTML_ITEM)?)
            .item(&paste)
            .item(&select_all)
            .separator();
        self.with_items(builder, &EDIT_SEARCH_ITEMS)?
            .separator()
            .item(&self.command_item(PASTE_TABLE_ITEM)?)
            .build()
    }

    fn view_menu(&mut self) -> tauri::Result<Submenu<Wry>> {
        let themes = self.check_submenu(&THEME_CHOICES)?;
        let reading_widths = self.check_submenu(&READING_WIDTH_CHOICES)?;
        let typographies = self.check_submenu(&TYPOGRAPHY_CHOICES)?;
        let source_view = self.toggle_item(SOURCE_VIEW_TOGGLE_ITEM)?;
        let panels = PANEL_TOGGLE_ITEMS
            .iter()
            .map(|item| self.toggle_item(*item))
            .collect::<tauri::Result<Vec<_>>>()?;
        let preview_beside_editor = self.toggle_item(PREVIEW_BESIDE_EDITOR_TOGGLE_ITEM)?;
        let command_palette = self.command_item(COMMAND_PALETTE_ITEM)?;
        let toggle_editing = self.command_item(TOGGLE_EDITING_ITEM)?;
        let full_screen = self.command_item(FULL_SCREEN_ITEM)?;
        let builder = SubmenuBuilder::new(self.app, self.labels.label("menu.view"))
            .item(&command_palette)
            .item(&toggle_editing)
            .item(&preview_beside_editor)
            .separator()
            .item(&themes)
            .item(&reading_widths)
            .item(&typographies)
            .separator();
        let builder = self
            .with_items(builder, &ZOOM_ITEMS)?
            .separator()
            .item(&source_view)
            .separator();
        panels
            .iter()
            .fold(builder, |builder, item| builder.item(item))
            .separator()
            .item(&full_screen)
            .build()
    }

    fn window_menu(&self) -> tauri::Result<Submenu<Wry>> {
        let builder = SubmenuBuilder::new(self.app, self.labels.label("menu.window"));
        let builder = self.with_items(builder, &NAVIGATION_ITEMS)?.separator();
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
        builder: SubmenuBuilder<'m, Wry, AppHandle>,
        items: &[CommandItem],
    ) -> tauri::Result<SubmenuBuilder<'m, Wry, AppHandle>> {
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
        (id, label_key, shortcut): CommandItem,
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
            .chain(&EDIT_HISTORY_ITEMS)
            .chain(&EDIT_SEARCH_ITEMS)
            .chain(&[
                PASTE_TABLE_ITEM,
                COPY_AS_HTML_ITEM,
                SETTINGS_ITEM,
                TOGGLE_EDITING_ITEM,
                COMMAND_PALETTE_ITEM,
                FULL_SCREEN_ITEM,
            ])
            .chain(&EXPORT_ITEMS)
            .chain(&NAVIGATION_ITEMS)
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
    fn accepts_a_translated_catalog_but_not_an_oversized_one() {
        let catalog = HashMap::from([("menu.file".to_owned(), "Fichier".to_owned())]);
        let overlong = HashMap::from([(
            "menu.file".to_owned(),
            "x".repeat(MAX_TRANSLATED_LABEL_CHARACTERS + 1),
        )]);
        let too_many: HashMap<String, String> = (0..=MAX_TRANSLATED_LABELS)
            .map(|index| (format!("key.{index}"), "label".to_owned()))
            .collect();

        assert!(are_valid_menu_labels(&catalog));
        assert!(!are_valid_menu_labels(&overlong));
        assert!(!are_valid_menu_labels(&too_many));
    }

    #[test]
    fn every_menu_choice_has_a_label_in_the_catalog() {
        let labels = MenuLabels::english();

        for choices in [THEME_CHOICES, READING_WIDTH_CHOICES, TYPOGRAPHY_CHOICES] {
            for choice in choices.choices {
                let key = format!("{}.{choice}", choices.title_key);
                assert!(labels.has(&key), "{key}");
            }
        }
    }
}
