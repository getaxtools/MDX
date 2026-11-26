use tauri::WebviewWindow;

/// Long enough for a document and a workspace name; the taskbar shortens it anyway.
const MAX_WINDOW_TITLE_CHARACTERS: usize = 260;

/// Switches the window between full screen and its normal size.
#[tauri::command]
pub fn toggle_full_screen(window: WebviewWindow) {
    let is_full_screen = window.is_fullscreen().unwrap_or(false);
    let _ = window.set_fullscreen(!is_full_screen);
}

/// Names the document and workspace in the title bar and taskbar.
#[tauri::command]
pub fn set_window_title(title: String, window: WebviewWindow) {
    let _ = window.set_title(&displayable_title(&title));
}

/// Control characters would break the title bar; overlong titles are cut on a character boundary.
fn displayable_title(title: &str) -> String {
    title
        .chars()
        .filter(|character| !character.is_control())
        .take(MAX_WINDOW_TITLE_CHARACTERS)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_an_ordinary_title() {
        assert_eq!(
            displayable_title("guide.md - Handbook - MDX"),
            "guide.md - Handbook - MDX"
        );
    }

    #[test]
    fn removes_control_characters_and_caps_the_length() {
        let overlong = format!("a\u{0007}b\n{}", "é".repeat(MAX_WINDOW_TITLE_CHARACTERS));

        let shown = displayable_title(&overlong);

        assert!(shown.starts_with("ab"));
        assert_eq!(shown.chars().count(), MAX_WINDOW_TITLE_CHARACTERS);
    }
}
