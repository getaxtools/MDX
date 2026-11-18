use std::fs::File;
use std::io;
use std::os::windows::io::AsRawHandle;

use windows::Win32::Foundation::HANDLE;
use windows::Win32::Storage::FileSystem::{BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle};

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
}
