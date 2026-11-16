use std::fs::{File, Metadata};
use std::io;
use std::path::Path;
use std::time::Duration;

use crate::platform;

/// The few file-system calls a move makes that a test must be able to vary: free space, online-only
/// files, a full drive, and a pause that keeps a move running long enough to watch it.
pub trait MoveFileSystem: Send + Sync {
    fn available_bytes(&self, folder: &Path) -> io::Result<u64>;
    fn is_online_only(&self, path: &Path, metadata: &Metadata) -> bool;
    /// Creates the pending copy of one file.
    fn create_copy(&self, pending: &Path) -> io::Result<File>;
    fn pause_after_file(&self) {}
}

/// The real disk; `pause_after_each_file` is zero outside UI tests.
#[derive(Debug, Default)]
pub struct DiskFileSystem {
    pub pause_after_each_file: Duration,
}

impl MoveFileSystem for DiskFileSystem {
    fn available_bytes(&self, folder: &Path) -> io::Result<u64> {
        let existing = folder
            .ancestors()
            .find(|ancestor| ancestor.is_dir())
            .unwrap_or(folder);
        fs4::available_space(existing)
    }

    fn is_online_only(&self, _path: &Path, metadata: &Metadata) -> bool {
        platform::is_cloud_only(metadata)
    }

    fn create_copy(&self, pending: &Path) -> io::Result<File> {
        File::create(pending)
    }

    fn pause_after_file(&self) {
        if !self.pause_after_each_file.is_zero() {
            std::thread::sleep(self.pause_after_each_file);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn free_space_is_read_from_the_nearest_existing_folder() {
        let folder = tempfile::tempdir().unwrap();

        let available = DiskFileSystem::default()
            .available_bytes(&folder.path().join("New").join("Notes"))
            .unwrap();

        assert!(available > 0);
    }
}
