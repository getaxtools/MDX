use tauri::WebviewWindow;

/// Switches the window between full screen and its normal size.
#[tauri::command]
pub fn toggle_full_screen(window: WebviewWindow) {
    let is_full_screen = window.is_fullscreen().unwrap_or(false);
    let _ = window.set_fullscreen(!is_full_screen);
}
