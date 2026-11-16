use std::io;
use std::path::{Path, PathBuf};

/// Where removed files go so the user can get them back; a folder without one keeps its files.
pub trait RecycleBin: Send + Sync {
    fn is_available_for(&self, folder: &Path) -> bool;
    fn recycle(&self, paths: &[PathBuf]) -> io::Result<()>;
}

/// The Windows Recycle Bin; other systems report none until they get their own, so nothing is removed there.
#[derive(Debug, Default)]
pub struct SystemRecycleBin;

#[cfg(windows)]
impl RecycleBin for SystemRecycleBin {
    fn is_available_for(&self, folder: &Path) -> bool {
        super::windows::has_recycle_bin(folder)
    }

    fn recycle(&self, paths: &[PathBuf]) -> io::Result<()> {
        super::windows::move_to_recycle_bin(paths)
    }
}

#[cfg(not(windows))]
impl RecycleBin for SystemRecycleBin {
    fn is_available_for(&self, _folder: &Path) -> bool {
        false
    }

    fn recycle(&self, _paths: &[PathBuf]) -> io::Result<()> {
        Err(io::Error::from(io::ErrorKind::Unsupported))
    }
}
