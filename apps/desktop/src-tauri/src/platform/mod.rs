#[cfg(windows)]
mod windows;

#[cfg(windows)]
pub use windows::{is_cloud_only, is_network_error_code};

#[cfg(not(windows))]
pub fn is_network_error_code(_code: i32) -> bool {
    false
}

#[cfg(not(windows))]
pub fn is_cloud_only(_metadata: &std::fs::Metadata) -> bool {
    false
}
