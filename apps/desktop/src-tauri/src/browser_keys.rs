//! The webview's own keys, such as Ctrl+P printing, reload, find, zoom and the developer tools, are
//! turned off in every window as soon as its webview exists, so only the app's shortcuts act: a
//! protected note is never printed past its warning. The page still receives every key, and its
//! own capture of the print keys stays as a second layer.

use tauri::Runtime;
use tauri::plugin::{Builder, TauriPlugin};

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("browser-keys")
        .on_webview_ready(|webview| {
            let turned_off = webview.with_webview(|platform| {
                if let Err(error) =
                    mdx_native_windows::turn_off_browser_keys(&platform.controller())
                {
                    eprintln!("MDX could not turn off the webview's own keys: {error}");
                }
            });
            if let Err(error) = turned_off {
                eprintln!("MDX could not reach the webview to turn off its keys: {error}");
            }
        })
        .build()
}
