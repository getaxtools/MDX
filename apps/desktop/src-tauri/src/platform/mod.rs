mod jump_list;
mod recycle_bin;
#[cfg(windows)]
mod windows;

pub use jump_list::{JumpListLink, JumpListResult, show_jump_list_category};
pub use recycle_bin::{RecycleBin, SystemRecycleBin};
#[cfg(windows)]
pub use windows::{
    is_cloud_only, is_locked_error_code, is_network_error_code, read_clipboard_text,
};

/// The clipboard's text is read natively on Windows only so far.
#[cfg(not(windows))]
pub fn read_clipboard_text(_max_units: usize) -> std::io::Result<Option<String>> {
    Err(std::io::Error::from(std::io::ErrorKind::Unsupported))
}

#[cfg(not(windows))]
pub fn is_network_error_code(_code: i32) -> bool {
    false
}

#[cfg(not(windows))]
pub fn is_locked_error_code(_code: i32) -> bool {
    false
}

#[cfg(not(windows))]
pub fn is_cloud_only(_metadata: &std::fs::Metadata) -> bool {
    false
}
