use std::collections::HashMap;

const ENGLISH_CATALOG: &str = include_str!("../../../../../packages/i18n/locales/en.json");

pub struct MenuLabels(HashMap<String, String>);

impl MenuLabels {
    pub fn english() -> Self {
        Self(serde_json::from_str(ENGLISH_CATALOG).unwrap_or_default())
    }

    pub fn label(&self, key: &str) -> String {
        self.0.get(key).cloned().unwrap_or_else(|| key.to_owned())
    }

    /// Shows the shortcut in the menu without registering a native accelerator, which would
    /// fire the command a second time next to the window's own keyboard handling.
    pub fn label_with_shortcut(&self, key: &str, shortcut: &str) -> String {
        let label = self.label(key);
        if cfg!(windows) {
            format!("{label}\t{shortcut}")
        } else {
            label
        }
    }

    #[cfg(test)]
    pub fn has(&self, key: &str) -> bool {
        self.0.contains_key(key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_labels_from_the_english_catalog() {
        let labels = MenuLabels::english();

        assert_eq!(labels.label("menu.file"), "File");
    }

    #[test]
    fn falls_back_to_the_key_for_an_unknown_label() {
        assert_eq!(MenuLabels::english().label("menu.unknown"), "menu.unknown");
    }

    #[cfg(windows)]
    #[test]
    fn shows_the_shortcut_after_a_tab_on_windows() {
        let label = MenuLabels::english().label_with_shortcut("menu.file.closeTab", "Ctrl+W");

        assert_eq!(label, "Close Tab\tCtrl+W");
    }
}
