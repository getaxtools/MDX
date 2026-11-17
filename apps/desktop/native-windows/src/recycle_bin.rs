use std::cell::Cell;
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::thread;

use windows::Win32::Foundation::ERROR_CANCELLED;
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE, CoCreateInstance,
    CoInitializeEx, CoUninitialize,
};
use windows::Win32::UI::Shell::{
    FILEOPERATION_FLAGS, FOF_ALLOWUNDO, FOF_NO_UI, FOFX_RECYCLEONDELETE, FileOperation,
    IFileOperation, IFileOperationProgressSink, IFileOperationProgressSink_Impl, IShellItem,
    SHCreateItemFromParsingName, TSF_DELETE_RECYCLE_IF_POSSIBLE,
};
use windows::core::{Error, HRESULT, PCWSTR, Ref, implement};

use crate::com_error::{io_error_of, io_error_of_hresult};

/// Undoable deletes go to the Recycle Bin, with no dialog of any kind. A delete the shell could
/// not recycle is refused item by item through the progress sink, so nothing is deleted for good.
const RECYCLE_FLAGS: FILEOPERATION_FLAGS =
    FILEOPERATION_FLAGS(FOF_ALLOWUNDO.0 | FOF_NO_UI.0 | FOFX_RECYCLEONDELETE.0);
const BACKSLASH: u16 = b'\\' as u16;
const QUESTION_MARK: u16 = b'?' as u16;
const COLON: u16 = b':' as u16;

/// What happened to one file of the operation, as its progress sink saw it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ItemOutcome {
    Waiting,
    Recycled,
    NotRecycled,
}

/// Moves the files to the Recycle Bin on a thread of its own, which sets up COM for the shell and
/// takes it down again. Returns the files that did not go to the Recycle Bin, so they can be kept
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
    let outcomes: Vec<Rc<Cell<ItemOutcome>>> = paths
        .iter()
        .map(|path| queue_delete(&operation, path))
        .collect();
    let is_anything_queued = outcomes
        .iter()
        .any(|outcome| outcome.get() == ItemOutcome::Waiting);
    if is_anything_queued {
        // SAFETY: `operation` is a live COM object created on this thread, which stays in its
        // apartment until every object of the operation is released at the end of this function.
        let performed = unsafe { operation.PerformOperations() };
        if let Err(error) = performed
            && !outcomes
                .iter()
                .any(|outcome| outcome.get() == ItemOutcome::Recycled)
        {
            return Err(io_error_of(&error));
        }
    }
    Ok(paths
        .iter()
        .zip(&outcomes)
        .filter(|(path, outcome)| outcome.get() != ItemOutcome::Recycled || is_still_there(path))
        .map(|(path, _)| path.clone())
        .collect())
}

/// Queues one delete with a sink of its own; a file the shell cannot even name stays.
fn queue_delete(operation: &IFileOperation, path: &Path) -> Rc<Cell<ItemOutcome>> {
    let Ok(item) = shell_item_of(path) else {
        return Rc::new(Cell::new(ItemOutcome::NotRecycled));
    };
    let outcome = Rc::new(Cell::new(ItemOutcome::Waiting));
    let sink: IFileOperationProgressSink = RecycleOnlySink {
        outcome: Rc::clone(&outcome),
    }
    .into();
    // SAFETY: `operation`, `item` and `sink` are live COM objects created on this thread; the
    // operation keeps its own references to the item and the sink until it is released.
    if unsafe { operation.DeleteItem(&item, &sink) }.is_err() {
        outcome.set(ItemOutcome::NotRecycled);
    }
    outcome
}

/// A file whose existence cannot be checked counts as still there, so it is listed.
fn is_still_there(path: &Path) -> bool {
    path.try_exists().unwrap_or(true)
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
/// becomes `\\s\h`; any other `\\?\` path is passed as it is. The result ends with a zero.
fn shell_parsing_name(path: &Path) -> Vec<u16> {
    let wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    let verbatim = [BACKSLASH, BACKSLASH, QUESTION_MARK, BACKSLASH];
    let share: Vec<u16> = "UNC\\".encode_utf16().collect();
    let plain = match wide.strip_prefix(&verbatim) {
        Some(rest) if rest.starts_with(&share) => [
            &[BACKSLASH, BACKSLASH][..],
            rest.get(share.len()..).unwrap_or_default(),
        ]
        .concat(),
        Some(rest) if is_drive_letter_start(rest) => rest.to_vec(),
        _ => wide,
    };
    plain.into_iter().chain(std::iter::once(0)).collect()
}

fn is_drive_letter_start(path: &[u16]) -> bool {
    matches!(path, [letter, colon, ..] if *colon == COLON && char::from_u32(u32::from(*letter)).is_some_and(|letter| letter.is_ascii_alphabetic()))
}

/// Watches one delete: refuses it before it starts unless the shell will recycle it, and records
/// afterwards whether the file reached the Recycle Bin.
#[implement(IFileOperationProgressSink)]
struct RecycleOnlySink {
    outcome: Rc<Cell<ItemOutcome>>,
}

fn will_recycle(flags: u32) -> bool {
    flags & TSF_DELETE_RECYCLE_IF_POSSIBLE.0.cast_unsigned() != 0
}

fn refused() -> Error {
    Error::from_hresult(HRESULT::from_win32(ERROR_CANCELLED.0))
}

impl IFileOperationProgressSink_Impl for RecycleOnlySink_Impl {
    fn PreDeleteItem(&self, flags: u32, _item: Ref<IShellItem>) -> windows::core::Result<()> {
        if will_recycle(flags) {
            Ok(())
        } else {
            self.outcome.set(ItemOutcome::NotRecycled);
            Err(refused())
        }
    }

    fn PostDeleteItem(
        &self,
        _flags: u32,
        _item: Ref<IShellItem>,
        result: HRESULT,
        recycled_item: Ref<IShellItem>,
    ) -> windows::core::Result<()> {
        let is_recycled = result.is_ok() && !recycled_item.is_null();
        self.outcome.set(if is_recycled {
            ItemOutcome::Recycled
        } else {
            ItemOutcome::NotRecycled
        });
        Ok(())
    }

    fn StartOperations(&self) -> windows::core::Result<()> {
        Ok(())
    }

    fn FinishOperations(&self, _result: HRESULT) -> windows::core::Result<()> {
        Ok(())
    }

    fn PreRenameItem(
        &self,
        _flags: u32,
        _item: Ref<IShellItem>,
        _new_name: &PCWSTR,
    ) -> windows::core::Result<()> {
        Ok(())
    }

    fn PostRenameItem(
        &self,
        _flags: u32,
        _item: Ref<IShellItem>,
        _new_name: &PCWSTR,
        _result: HRESULT,
        _created: Ref<IShellItem>,
    ) -> windows::core::Result<()> {
        Ok(())
    }

    fn PreMoveItem(
        &self,
        _flags: u32,
        _item: Ref<IShellItem>,
        _destination: Ref<IShellItem>,
        _new_name: &PCWSTR,
    ) -> windows::core::Result<()> {
        Ok(())
    }

    fn PostMoveItem(
        &self,
        _flags: u32,
        _item: Ref<IShellItem>,
        _destination: Ref<IShellItem>,
        _new_name: &PCWSTR,
        _result: HRESULT,
        _created: Ref<IShellItem>,
    ) -> windows::core::Result<()> {
        Ok(())
    }

    fn PreCopyItem(
        &self,
        _flags: u32,
        _item: Ref<IShellItem>,
        _destination: Ref<IShellItem>,
        _new_name: &PCWSTR,
    ) -> windows::core::Result<()> {
        Ok(())
    }

    fn PostCopyItem(
        &self,
        _flags: u32,
        _item: Ref<IShellItem>,
        _destination: Ref<IShellItem>,
        _new_name: &PCWSTR,
        _result: HRESULT,
        _created: Ref<IShellItem>,
    ) -> windows::core::Result<()> {
        Ok(())
    }

    fn PreNewItem(
        &self,
        _flags: u32,
        _destination: Ref<IShellItem>,
        _new_name: &PCWSTR,
    ) -> windows::core::Result<()> {
        Ok(())
    }

    fn PostNewItem(
        &self,
        _flags: u32,
        _destination: Ref<IShellItem>,
        _new_name: &PCWSTR,
        _template_name: &PCWSTR,
        _attributes: u32,
        _result: HRESULT,
        _new_item: Ref<IShellItem>,
    ) -> windows::core::Result<()> {
        Ok(())
    }

    fn UpdateProgress(&self, _total: u32, _done: u32) -> windows::core::Result<()> {
        Ok(())
    }

    fn ResetTimer(&self) -> windows::core::Result<()> {
        Ok(())
    }

    fn PauseTimer(&self) -> windows::core::Result<()> {
        Ok(())
    }

    fn ResumeTimer(&self) -> windows::core::Result<()> {
        Ok(())
    }
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
    fn a_delete_the_shell_would_not_recycle_is_refused_as_cancelled() {
        let recycling = TSF_DELETE_RECYCLE_IF_POSSIBLE.0.cast_unsigned();

        assert!(will_recycle(recycling));
        assert!(will_recycle(recycling | 0x1));
        assert!(!will_recycle(0));
        assert_eq!(refused().code(), HRESULT(0x8007_04C7_u32.cast_signed()));
    }

    #[test]
    fn the_sink_refuses_a_delete_for_good_and_records_what_happened() {
        let outcome = Rc::new(Cell::new(ItemOutcome::Waiting));
        let sink: IFileOperationProgressSink = RecycleOnlySink {
            outcome: Rc::clone(&outcome),
        }
        .into();
        let recycling = TSF_DELETE_RECYCLE_IF_POSSIBLE.0.cast_unsigned();

        // SAFETY: `sink` is a live object of this test; the calls pass no items.
        let refused_for_good = unsafe { sink.PreDeleteItem(0, None) };
        // SAFETY: as above.
        let allowed = unsafe { sink.PreDeleteItem(recycling, None) };
        // SAFETY: as above.
        unsafe { sink.PostDeleteItem(recycling, None, HRESULT(0), None) }.unwrap();

        assert!(refused_for_good.is_err());
        assert!(allowed.is_ok());
        assert_eq!(outcome.get(), ItemOutcome::NotRecycled);
    }

    #[test]
    fn long_path_prefixes_are_left_out_only_before_a_drive_or_a_share() {
        assert_eq!(
            text_of(&shell_parsing_name(Path::new(r"\\?\C:\Notes\a.md"))),
            r"C:\Notes\a.md"
        );
        assert_eq!(
            text_of(&shell_parsing_name(Path::new(r"\\?\UNC\server\share\a.md"))),
            r"\\server\share\a.md"
        );
        assert_eq!(
            text_of(&shell_parsing_name(Path::new(r"\\?\Volume{1234}\a.md"))),
            r"\\?\Volume{1234}\a.md"
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

        let not_recycled = move_to_recycle_bin(std::slice::from_ref(&file)).unwrap();

        assert_eq!(not_recycled, Vec::<PathBuf>::new());
        assert!(!file.exists());
    }

    #[test]
    fn a_missing_file_is_kept_while_the_others_still_go() {
        let folder = tempfile::tempdir().unwrap();
        let missing = folder.path().join("missing.md");
        let present = folder.path().join("present.md");
        std::fs::write(&present, "# Present").unwrap();

        let not_recycled = move_to_recycle_bin(&[missing.clone(), present.clone()]).unwrap();

        assert_eq!(not_recycled, [missing]);
        assert!(!present.exists());
    }
}
