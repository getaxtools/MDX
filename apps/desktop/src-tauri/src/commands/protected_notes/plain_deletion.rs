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

/// Opens the plain note so that no one can write, rename or delete it meanwhile, reads it again and
/// compares it with `sealed`, and only when they match deletes that very file through the same
/// handle. Overwriting it first is not attempted: on an SSD the old blocks stay until the drive
/// reuses them, so it would promise more than it does.
pub fn delete_if_unchanged(path: &Path, sealed: &[u8]) -> std::io::Result<PlainDeletion> {
    delete_if_unchanged_with(path, sealed, || {})
}

fn delete_if_unchanged_with(
    path: &Path,
    sealed: &[u8],
    before_delete: impl FnOnce(),
) -> std::io::Result<PlainDeletion> {
    let file = open_held(path)?;
    let mut current = Zeroizing::new(Vec::new());
    // Read through a borrow, so the handle that keeps others out stays open until the delete.
    (&file)
        .take(sealed.len() as u64 + 1)
        .read_to_end(&mut current)?;
    if current.as_slice() != sealed {
        return Ok(PlainDeletion::Changed);
    }
    before_delete();
    delete_held(&file, path)?;
    drop(file);
    Ok(PlainDeletion::Deleted)
}

/// Read and delete access, sharing only reading: no one else can write the file, nor rename or
/// delete it, so the name keeps pointing at the bytes compared.
#[cfg(windows)]
fn open_held(path: &Path) -> std::io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    const GENERIC_READ: u32 = 0x8000_0000;
    const DELETE: u32 = 0x0001_0000;
    const FILE_SHARE_READ: u32 = 0x1;
    fs::OpenOptions::new()
        .access_mode(GENERIC_READ | DELETE)
        .share_mode(FILE_SHARE_READ)
        .open(path)
}

#[cfg(windows)]
fn delete_held(file: &File, _path: &Path) -> std::io::Result<()> {
    mdx_native_windows::delete_open_file(file)
}

#[cfg(not(windows))]
fn open_held(path: &Path) -> std::io::Result<File> {
    File::open(path)
}

#[cfg(not(windows))]
fn delete_held(_file: &File, path: &Path) -> std::io::Result<()> {
    fs::remove_file(path)
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

    #[test]
    fn a_save_that_renames_a_new_version_over_the_note_meanwhile_is_kept_out() {
        let folder = tempfile::tempdir().unwrap();
        let plain = folder.path().join("Bank details.md");
        let saved = folder.path().join("Bank details.md.saving");
        fs::write(&plain, b"PIN 4821").unwrap();
        fs::write(&saved, b"PIN 9999, saved meanwhile").unwrap();
        let mut renamed = None;

        let deletion = delete_if_unchanged_with(&plain, b"PIN 4821", || {
            renamed = Some(fs::rename(&saved, &plain));
        });

        assert_eq!(deletion.unwrap(), PlainDeletion::Deleted);
        assert!(renamed.unwrap().is_err());
        assert_eq!(fs::read(&saved).unwrap(), b"PIN 9999, saved meanwhile");
        assert!(!plain.exists());
    }
}
