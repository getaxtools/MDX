mod recycle_bin;

use std::fs::Metadata;
use std::os::windows::fs::MetadataExt;

pub use mdx_native_windows::read_clipboard_text;
pub use recycle_bin::{move_to_recycle_bin, recycle_bin_capacity};

const ERROR_SEM_TIMEOUT: i32 = 121;
const ERROR_BAD_NETPATH: i32 = 53;
const ERROR_NETNAME_DELETED: i32 = 64;
const ERROR_BAD_NET_NAME: i32 = 67;
const ERROR_NO_NETWORK: i32 = 1222;
const ERROR_NETWORK_UNREACHABLE: i32 = 1231;
const ERROR_HOST_UNREACHABLE: i32 = 1232;
const ERROR_SHARING_VIOLATION: i32 = 32;
const ERROR_LOCK_VIOLATION: i32 = 33;

const FILE_ATTRIBUTE_OFFLINE: u32 = 0x0000_1000;
const FILE_ATTRIBUTE_RECALL_ON_OPEN: u32 = 0x0004_0000;
const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS: u32 = 0x0040_0000;
const CLOUD_ONLY_ATTRIBUTES: u32 =
    FILE_ATTRIBUTE_OFFLINE | FILE_ATTRIBUTE_RECALL_ON_OPEN | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS;

pub fn is_network_error_code(code: i32) -> bool {
    matches!(
        code,
        ERROR_SEM_TIMEOUT
            | ERROR_BAD_NETPATH
            | ERROR_NETNAME_DELETED
            | ERROR_BAD_NET_NAME
            | ERROR_NO_NETWORK
            | ERROR_NETWORK_UNREACHABLE
            | ERROR_HOST_UNREACHABLE
    )
}

/// Another program holds the file open without sharing it, or has locked part of it.
pub fn is_locked_error_code(code: i32) -> bool {
    matches!(code, ERROR_SHARING_VIOLATION | ERROR_LOCK_VIOLATION)
}

pub fn is_cloud_only(metadata: &Metadata) -> bool {
    metadata.file_attributes() & CLOUD_ONLY_ATTRIBUTES != 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_network_error_codes() {
        assert!(is_network_error_code(ERROR_BAD_NETPATH));
        assert!(is_network_error_code(ERROR_NETWORK_UNREACHABLE));
        assert!(!is_network_error_code(2));
    }

    #[test]
    fn recognizes_locked_file_error_codes() {
        assert!(is_locked_error_code(ERROR_SHARING_VIOLATION));
        assert!(is_locked_error_code(ERROR_LOCK_VIOLATION));
        assert!(!is_locked_error_code(ERROR_BAD_NETPATH));
    }

    #[test]
    fn treats_ordinary_local_files_as_downloaded() {
        let file = tempfile::NamedTempFile::new().unwrap();

        assert!(!is_cloud_only(&file.as_file().metadata().unwrap()));
    }
}
