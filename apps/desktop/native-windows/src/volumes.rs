use std::ffi::OsStr;
use std::io;
use std::os::windows::ffi::OsStrExt;

use windows::Win32::Storage::FileSystem::GetVolumeNameForVolumeMountPointW;
use windows::core::PCWSTR;

use crate::com_error::io_error_of;

/// `\\?\Volume{GUID}\` and its zero, with room to spare.
const VOLUME_NAME_UNITS: usize = 64;

/// The volume a drive such as `C:\` is, as `\\?\Volume{…}\`, the name its Recycle Bin settings
/// are kept under.
pub fn volume_name_of(mount_point: &str) -> io::Result<String> {
    let wide: Vec<u16> = OsStr::new(&with_trailing_backslash(mount_point))
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut volume_name = [0_u16; VOLUME_NAME_UNITS];
    // SAFETY: `wide` ends with a zero and lives for the call; the function writes at most the
    // buffer's length, which it is given through the slice.
    unsafe { GetVolumeNameForVolumeMountPointW(PCWSTR(wide.as_ptr()), &mut volume_name) }
        .map_err(|error| io_error_of(&error))?;
    let end = volume_name
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(VOLUME_NAME_UNITS);
    Ok(String::from_utf16_lossy(
        volume_name.get(..end).unwrap_or_default(),
    ))
}

/// The function wants a mount point that ends with a backslash, such as `C:\`.
fn with_trailing_backslash(mount_point: &str) -> String {
    if mount_point.ends_with('\\') {
        mount_point.to_owned()
    } else {
        format!(r"{mount_point}\")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_system_drive_has_a_volume_name() {
        let system_drive = std::env::var("SystemDrive").unwrap();

        let name = volume_name_of(&system_drive).unwrap();

        assert!(name.starts_with(r"\\?\Volume{"), "{name}");
        assert!(name.ends_with(r"}\"), "{name}");
    }

    #[test]
    fn a_folder_that_is_not_a_mount_point_is_an_error() {
        let folder = tempfile::tempdir().unwrap();

        assert!(volume_name_of(&folder.path().to_string_lossy()).is_err());
    }
}
