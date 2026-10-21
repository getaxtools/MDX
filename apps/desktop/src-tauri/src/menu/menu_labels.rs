use std::collections::HashMap;

const ENGLISH_CATALOG: &str = include_str!("../../../../../packages/i18n/locales/en.json");

pub struct MenuLabels(HashMap<String, String>);

impl MenuLabels {
    pub fn english() -> Self {
        Self(serde_json::from_str(ENGLISH_CATALOG).unwrap_or_default())
    }

    /// English labels replaced by the given translations; keys English does not have are ignored.
    pub fn with_translations(translations: HashMap<String, String>) -> Self {
        let mut labels = Self::english();
        for (key, label) in translations {
            if !label.is_empty()
                && let Some(english) = labels.0.get_mut(&key)
            {
                *english = label;
            }
        }
        labels
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
    fn uses_translations_and_keeps_english_for_missing_or_empty_ones() {
        let labels = MenuLabels::with_translations(HashMap::from([
            ("menu.file".to_owned(), "फ़ाइल".to_owned()),
            ("menu.edit".to_owned(), String::new()),
            ("menu.invented".to_owned(), "Invented".to_owned()),
        ]));

        assert_eq!(labels.label("menu.file"), "फ़ाइल");
        assert_eq!(labels.label("menu.edit"), "Edit");
        assert!(!labels.has("menu.invented"));
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
