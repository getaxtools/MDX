use std::fs::File;
use std::io;
use std::os::windows::io::AsRawHandle;

use windows::Win32::Foundation::HANDLE;
use windows::Win32::Storage::FileSystem::{
    BY_HANDLE_FILE_INFORMATION, FILE_DISPOSITION_FLAG_DELETE,
    FILE_DISPOSITION_FLAG_POSIX_SEMANTICS, FILE_DISPOSITION_INFO_EX,
    FILE_DISPOSITION_INFO_EX_FLAGS, FileDispositionInfoEx, GetFileInformationByHandle,
    SetFileInformationByHandle,
};

use crate::com_error::io_error_of;

/// How many names an open file has on its volume; more than one means it is a hard link, which a
/// file restored or copied by MDX should never be.
pub fn link_count_of(file: &File) -> io::Result<u32> {
    let mut information = BY_HANDLE_FILE_INFORMATION::default();
    // SAFETY: the handle belongs to `file`, which is borrowed and so stays open for the call; the
    // function only writes the structure it is given.
    unsafe { GetFileInformationByHandle(HANDLE(file.as_raw_handle()), &mut information) }
        .map_err(|error| io_error_of(&error))?;
    Ok(information.nNumberOfLinks)
}

/// Deletes the file this handle is open on, by the handle, so it is the very file that was read
/// that goes, even if its name was given to another file meanwhile. The handle must have been
/// opened with delete access. The name goes at once where the file system allows it, and at the
/// latest when the handle closes.
pub fn delete_open_file(file: &File) -> io::Result<()> {
    let disposition = FILE_DISPOSITION_INFO_EX {
        Flags: FILE_DISPOSITION_INFO_EX_FLAGS(
            FILE_DISPOSITION_FLAG_DELETE.0 | FILE_DISPOSITION_FLAG_POSIX_SEMANTICS.0,
        ),
    };
    // SAFETY: the handle belongs to `file`, which is borrowed and so stays open for the call; the
    // function reads exactly `size_of` bytes of `disposition`, which lives for the call.
    unsafe {
        SetFileInformationByHandle(
            HANDLE(file.as_raw_handle()),
            FileDispositionInfoEx,
            std::ptr::from_ref(&disposition).cast(),
            u32::try_from(size_of::<FILE_DISPOSITION_INFO_EX>()).unwrap_or(u32::MAX),
        )
    }
    .map_err(|error| io_error_of(&error))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_has_one_name_until_a_hard_link_gives_it_another() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("vault.json");
        std::fs::write(&path, b"{}").unwrap();
        assert_eq!(link_count_of(&File::open(&path).unwrap()).unwrap(), 1);

        std::fs::hard_link(&path, folder.path().join("other.json")).unwrap();

        assert_eq!(link_count_of(&File::open(&path).unwrap()).unwrap(), 2);
    }

    #[test]
    fn an_open_file_is_deleted_by_its_handle_once_it_closes() {
        use std::os::windows::fs::OpenOptionsExt;
        const DELETE: u32 = 0x0001_0000;
        const GENERIC_READ: u32 = 0x8000_0000;
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("note.md");
        std::fs::write(&path, b"PIN").unwrap();
        let file = std::fs::OpenOptions::new()
            .access_mode(GENERIC_READ | DELETE)
            .share_mode(0x1)
            .open(&path)
            .unwrap();

        delete_open_file(&file).unwrap();
        drop(file);

        assert!(!path.exists());
    }
}
