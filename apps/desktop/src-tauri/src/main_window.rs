use std::error::Error;

use tauri::App;
use tauri::utils::config::WindowConfig;

use crate::open_requests::MAIN_WINDOW_LABEL;

pub fn create_main_window(app: &App) -> Result<(), Box<dyn Error>> {
    let window_config = main_window_config(app)?;
    #[cfg(dev)]
    let builder = crate::startup_page::open_on_startup_page(app, &window_config)?;
    #[cfg(not(dev))]
    let builder = tauri::WebviewWindowBuilder::from_config(app, &window_config)?;
    builder.build()?;
    Ok(())
}

fn main_window_config(app: &App) -> Result<WindowConfig, &'static str> {
    app.config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW_LABEL)
        .cloned()
        .ok_or("tauri.conf.json has no main window")
}
