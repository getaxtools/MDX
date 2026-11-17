use std::ffi::OsStr;
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::thread;

use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE, CoCreateInstance,
    CoInitializeEx, CoUninitialize,
};
use windows::Win32::UI::Shell::{
    FILEOPERATION_FLAGS, FOF_ALLOWUNDO, FOF_NO_UI, FOFX_RECYCLEONDELETE, FileOperation,
    IFileOperation, IShellItem, SHCreateItemFromParsingName,
};
use windows::core::PCWSTR;

use crate::com_error::{io_error_of, io_error_of_hresult};

/// Undoable deletes go to the Recycle Bin, with no dialog of any kind. The shell would delete a
/// file outright where it cannot recycle it, so callers send only files the Recycle Bin can hold.
const RECYCLE_FLAGS: FILEOPERATION_FLAGS =
    FILEOPERATION_FLAGS(FOF_ALLOWUNDO.0 | FOF_NO_UI.0 | FOFX_RECYCLEONDELETE.0);
const VERBATIM_PREFIX: &str = r"\\?\";
const VERBATIM_SHARE_PREFIX: &str = r"\\?\UNC\";

/// Moves the files to the Recycle Bin on a thread of its own, which sets up COM for the shell and
/// takes it down again. Returns the files that are still there afterwards, so they can be kept
/// and listed; an error means the Recycle Bin could not be asked at all.
pub fn move_to_recycle_bin(paths: &[PathBuf]) -> io::Result<Vec<PathBuf>> {
    let paths = paths.to_vec();
    thread::Builder::new()
        .name("recycle-bin".to_owned())
        .spawn(move || recycle_on_this_thread(&paths))?
        .join()
        .map_err(|_| io::Error::other("the Recycle Bin thread stopped"))?
}

fn recycle_on_this_thread(paths: &[PathBuf]) -> io::Result<Vec<PathBuf>> {
    let _com = ApartmentComGuard::start()?;
    let operation = file_operation()?;
    for path in paths {
        let item = shell_item_of(path)?;
        // SAFETY: `operation` and `item` are live COM objects created on this thread, which
        // stays in its apartment until they are released at the end of this function.
        unsafe { operation.DeleteItem(&item, None) }.map_err(|error| io_error_of(&error))?;
    }
    // SAFETY: as above; the operation only reads the items queued on it.
    let performed = unsafe { operation.PerformOperations() };
    let remaining: Vec<PathBuf> = paths.iter().filter(|path| path.exists()).cloned().collect();
    match performed {
        Err(error) if remaining.len() == paths.len() => Err(io_error_of(&error)),
        _ => Ok(remaining),
    }
}

fn file_operation() -> io::Result<IFileOperation> {
    // SAFETY: COM is set up on this thread; `FileOperation` is the shell's class id for the
    // `IFileOperation` interface asked for.
    let operation: IFileOperation =
        unsafe { CoCreateInstance(&FileOperation, None, CLSCTX_INPROC_SERVER) }
            .map_err(|error| io_error_of(&error))?;
    // SAFETY: `operation` was just created on this thread.
    unsafe { operation.SetOperationFlags(RECYCLE_FLAGS) }.map_err(|error| io_error_of(&error))?;
    Ok(operation)
}

fn shell_item_of(path: &Path) -> io::Result<IShellItem> {
    let wide = shell_parsing_name(path);
    // SAFETY: `wide` ends with a zero and outlives the call, which copies what it reads.
    unsafe { SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None) }
        .map_err(|error| io_error_of(&error))
}

/// The shell does not accept long-path prefixes: `\\?\C:\a` becomes `C:\a` and `\\?\UNC\s\h`
/// becomes `\\s\h`. The result ends with a zero, as the shell expects.
fn shell_parsing_name(path: &Path) -> Vec<u16> {
    let text = path.to_string_lossy();
    let plain = if let Some(share) = text.strip_prefix(VERBATIM_SHARE_PREFIX) {
        format!(r"\\{share}")
    } else {
        text.strip_prefix(VERBATIM_PREFIX)
            .unwrap_or(&text)
            .to_owned()
    };
    OsStr::new(&plain)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

/// COM in a single-threaded apartment for as long as the guard lives.
struct ApartmentComGuard;

impl ApartmentComGuard {
    fn start() -> io::Result<Self> {
        // SAFETY: called once on a thread this module made, which has no COM mode yet.
        let result =
            unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };
        if result.is_err() {
            return Err(io_error_of_hresult(result));
        }
        Ok(Self)
    }
}

impl Drop for ApartmentComGuard {
    fn drop(&mut self) {
        // SAFETY: pairs the successful `CoInitializeEx` above, on the same thread; every COM
        // object of the operation was released before the guard, which was made first.
        unsafe { CoUninitialize() };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::UI::Shell::{FOF_NOCONFIRMATION, FOF_SILENT, FOF_WANTNUKEWARNING};

    fn text_of(wide: &[u16]) -> String {
        String::from_utf16_lossy(wide.strip_suffix(&[0]).unwrap_or(wide))
    }

    #[test]
    fn deletes_are_undoable_silent_and_never_warn() {
        let flags = RECYCLE_FLAGS.0;

        assert_ne!(flags & FOF_ALLOWUNDO.0, 0);
        assert_ne!(flags & FOFX_RECYCLEONDELETE.0, 0);
        assert_ne!(flags & FOF_SILENT.0, 0);
        assert_ne!(flags & FOF_NOCONFIRMATION.0, 0);
        assert_eq!(flags & FOF_WANTNUKEWARNING.0, 0);
    }

    #[test]
    fn long_path_prefixes_are_left_out_for_the_shell() {
        assert_eq!(
            text_of(&shell_parsing_name(Path::new(r"\\?\C:\Notes\a.md"))),
            r"C:\Notes\a.md"
        );
        assert_eq!(
            text_of(&shell_parsing_name(Path::new(r"\\?\UNC\server\share\a.md"))),
            r"\\server\share\a.md"
        );
        assert_eq!(
            text_of(&shell_parsing_name(Path::new(r"D:\Notes\a.md"))),
            r"D:\Notes\a.md"
        );
        assert_eq!(shell_parsing_name(Path::new("a")).last(), Some(&0));
    }

    #[test]
    fn a_temp_file_goes_to_the_recycle_bin() {
        let folder = tempfile::tempdir().unwrap();
        let file = folder.path().join("recycled by the MDX tests.md");
        std::fs::write(&file, "# Recycled").unwrap();

        let remaining = move_to_recycle_bin(std::slice::from_ref(&file)).unwrap();

        assert_eq!(remaining, Vec::<PathBuf>::new());
        assert!(!file.exists());
    }

    #[test]
    fn a_missing_file_is_reported_without_a_crash() {
        let folder = tempfile::tempdir().unwrap();

        let result = move_to_recycle_bin(&[folder.path().join("missing.md")]);

        assert!(result.is_err());
    }
}
