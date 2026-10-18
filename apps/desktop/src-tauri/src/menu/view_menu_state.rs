use serde::Deserialize;

pub const THEME_ITEM_PREFIX: &str = "theme.";
pub const READING_WIDTH_ITEM_PREFIX: &str = "readingWidth.";
pub const TOGGLE_SIDEBAR_ITEM_ID: &str = "toggleSidebar";
pub const TOGGLE_OUTLINE_ITEM_ID: &str = "toggleOutline";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewMenuState {
    pub theme: String,
    pub reading_width: String,
    pub is_sidebar_visible: bool,
    pub is_outline_visible: bool,
}

impl ViewMenuState {
    pub fn is_checked(&self, item_id: &str) -> bool {
        if let Some(theme) = item_id.strip_prefix(THEME_ITEM_PREFIX) {
            return theme == self.theme;
        }
        if let Some(reading_width) = item_id.strip_prefix(READING_WIDTH_ITEM_PREFIX) {
            return reading_width == self.reading_width;
        }
        match item_id {
            TOGGLE_SIDEBAR_ITEM_ID => self.is_sidebar_visible,
            TOGGLE_OUTLINE_ITEM_ID => self.is_outline_visible,
            _ => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> ViewMenuState {
        ViewMenuState {
            theme: "dark".to_owned(),
            reading_width: "wide".to_owned(),
            is_sidebar_visible: true,
            is_outline_visible: false,
        }
    }

    #[test]
    fn checks_only_the_chosen_theme_and_reading_width() {
        let state = state();

        assert!(state.is_checked("theme.dark"));
        assert!(!state.is_checked("theme.light"));
        assert!(state.is_checked("readingWidth.wide"));
        assert!(!state.is_checked("readingWidth.full"));
    }

    #[test]
    fn checks_the_sidebar_item_while_the_sidebar_is_shown() {
        let mut state = state();
        assert!(state.is_checked("toggleSidebar"));

        state.is_sidebar_visible = false;

        assert!(!state.is_checked("toggleSidebar"));
    }

    #[test]
    fn checks_the_outline_item_while_the_outline_is_shown() {
        let mut state = state();
        assert!(!state.is_checked("toggleOutline"));

        state.is_outline_visible = true;

        assert!(state.is_checked("toggleOutline"));
    }

    #[test]
    fn never_checks_other_items() {
        assert!(!state().is_checked("zoomIn"));
    }
}
