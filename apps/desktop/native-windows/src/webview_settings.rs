use std::io;

use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Controller, ICoreWebView2Settings3,
};
use windows::core::Interface;

use crate::com_error::io_error_of;

/// Turns off the webview's own keys, such as printing, reload, find, zoom and the developer tools,
/// so only the app's shortcuts act; the page still receives every key.
pub fn turn_off_browser_keys(controller: &ICoreWebView2Controller) -> io::Result<()> {
    // SAFETY: `controller` is a live COM interface the caller holds for the call; each call
    // returns a new reference the `windows` wrappers release when dropped.
    let settings = unsafe {
        controller
            .CoreWebView2()
            .and_then(|webview| webview.Settings())
    }
    .map_err(|error| io_error_of(&error))?;
    let settings = settings
        .cast::<ICoreWebView2Settings3>()
        .map_err(|error| io_error_of(&error))?;
    // SAFETY: `settings` is a live interface for the call; the setter takes a plain flag.
    unsafe { settings.SetAreBrowserAcceleratorKeysEnabled(false) }
        .map_err(|error| io_error_of(&error))
}
