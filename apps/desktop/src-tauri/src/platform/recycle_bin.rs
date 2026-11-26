use std::io;
use std::path::{Path, PathBuf};

/// Where removed files go so the user can get them back; a folder without one keeps its files.
pub trait RecycleBin: Send + Sync {
    /// How many bytes it holds for the folder's drive; `None` when files there would be deleted outright.
    fn capacity_for(&self, folder: &Path) -> Option<u64>;
    /// Returns the files that are still there afterwards.
    fn recycle(&self, paths: &[PathBuf]) -> io::Result<Vec<PathBuf>>;
}

/// The Windows Recycle Bin; other systems report none until they get their own, so nothing is removed there.
#[derive(Debug, Default)]
pub struct SystemRecycleBin;

#[cfg(windows)]
impl RecycleBin for SystemRecycleBin {
    fn capacity_for(&self, folder: &Path) -> Option<u64> {
        super::windows::recycle_bin_capacity(folder)
    }

    fn recycle(&self, paths: &[PathBuf]) -> io::Result<Vec<PathBuf>> {
        super::windows::move_to_recycle_bin(paths)
    }
}

#[cfg(not(windows))]
impl RecycleBin for SystemRecycleBin {
    fn capacity_for(&self, _folder: &Path) -> Option<u64> {
        None
    }

    fn recycle(&self, _paths: &[PathBuf]) -> io::Result<Vec<PathBuf>> {
        Err(io::Error::from(io::ErrorKind::Unsupported))
    }
}
