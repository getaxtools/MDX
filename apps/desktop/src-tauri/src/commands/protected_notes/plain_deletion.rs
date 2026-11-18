//! Deleting a plain note once it is protected: for good, never to the Recycle Bin where anyone at
//! the PC could read it, and only while it still holds the bytes that were sealed.

use std::fs::{self, File};
use std::io::Read;
use std::path::Path;

use zeroize::Zeroizing;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlainDeletion {
    Deleted,
    /// The file no longer holds the sealed bytes, so it was left as it is.
    Changed,
}

/// Opens the plain note so that no one can write to it meanwhile, reads it again and compares it
/// with `sealed`, and deletes it only when they match. Overwriting it first is not attempted: on an
/// SSD the old blocks stay until the drive reuses them, so it would promise more than it does.
pub fn delete_if_unchanged(path: &Path, sealed: &[u8]) -> std::io::Result<PlainDeletion> {
    let file = open_without_writers(path)?;
    let mut current = Zeroizing::new(Vec::new());
    // Read through a borrow, so the handle that keeps writers out stays open until the delete.
    (&file)
        .take(sealed.len() as u64 + 1)
        .read_to_end(&mut current)?;
    if current.as_slice() != sealed {
        return Ok(PlainDeletion::Changed);
    }
    fs::remove_file(path)?;
    drop(file);
    Ok(PlainDeletion::Deleted)
}

#[cfg(windows)]
fn open_without_writers(path: &Path) -> std::io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    const FILE_SHARE_READ: u32 = 0x1;
    const FILE_SHARE_DELETE: u32 = 0x4;
    fs::OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_DELETE)
        .open(path)
}

#[cfg(not(windows))]
fn open_without_writers(path: &Path) -> std::io::Result<File> {
    File::open(path)
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn a_plain_note_another_program_holds_open_for_writing_is_not_deleted() {
        let folder = tempfile::tempdir().unwrap();
        let plain = folder.path().join("Bank details.md");
        fs::write(&plain, b"PIN 4821").unwrap();
        let writer = fs::OpenOptions::new().write(true).open(&plain).unwrap();

        let deletion = delete_if_unchanged(&plain, b"PIN 4821");
        drop(writer);

        assert!(deletion.is_err());
        assert!(plain.exists());
        assert_eq!(
            delete_if_unchanged(&plain, b"PIN 4821").unwrap(),
            PlainDeletion::Deleted
        );
        assert!(!plain.exists());
    }
}
