use std::io;

use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL};
use windows::Win32::System::DataExchange::{
    EmptyClipboard, GetClipboardSequenceNumber, RegisterClipboardFormatW, SetClipboardData,
};
use windows::Win32::System::Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock};
use windows::Win32::System::Ole::CF_UNICODETEXT;
use windows::core::{PCWSTR, w};

use crate::clipboard::OpenedClipboard;
use crate::com_error::io_error_of;

/// Clipboard monitors skip content that carries this format, whatever its data.
const EXCLUDE_FROM_MONITORS: PCWSTR = w!("ExcludeClipboardContentFromMonitorProcessing");
/// A zero DWORD in this format keeps the content out of clipboard history.
const CAN_INCLUDE_IN_HISTORY: PCWSTR = w!("CanIncludeInClipboardHistory");
/// A zero DWORD in this format keeps the content off the cloud clipboard.
const CAN_UPLOAD_TO_CLOUD: PCWSTR = w!("CanUploadToCloudClipboard");
const NOT_ALLOWED: u32 = 0;

/// Text this program put on the clipboard, known by the clipboard's sequence number right after.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClipboardCopy {
    sequence: u32,
}

/// Puts text on the clipboard marked so that Windows keeps it out of clipboard history, off the
/// cloud clipboard and away from clipboard monitors. Text after a zero character does not reach
/// the clipboard, as clipboard text ends at its first zero. On any failure the clipboard is left
/// empty, so the text is never there without its marks.
pub fn copy_text_outside_history(text: &str) -> io::Result<ClipboardCopy> {
    let formats = [
        registered_format(EXCLUDE_FROM_MONITORS)?,
        registered_format(CAN_INCLUDE_IN_HISTORY)?,
        registered_format(CAN_UPLOAD_TO_CLOUD)?,
    ];
    {
        let _clipboard = OpenedClipboard::open()?;
        // SAFETY: the clipboard is open on this thread, which EmptyClipboard needs.
        unsafe { EmptyClipboard() }.map_err(|error| io_error_of(&error))?;
        if let Err(error) = place_marked_text(text, formats) {
            // SAFETY: the clipboard is still open on this thread.
            let _ = unsafe { EmptyClipboard() };
            return Err(error);
        }
    }
    // Closing the clipboard counts as a change, so the number that names our copy comes after it.
    // SAFETY: GetClipboardSequenceNumber has no preconditions.
    let sequence = unsafe { GetClipboardSequenceNumber() };
    Ok(ClipboardCopy { sequence })
}

/// The marks go first and the text last, so the text never sits on the clipboard unmarked.
fn place_marked_text(text: &str, formats: [u32; 3]) -> io::Result<()> {
    for format in formats {
        hand_over(format, GlobalBlock::of_units(&dword_units(NOT_ALLOWED))?)?;
    }
    hand_over(
        u32::from(CF_UNICODETEXT.0),
        GlobalBlock::of_units(&utf16_with_terminator(text))?,
    )
}

/// Empties the clipboard when it still holds `copy`; true when it did. Anything copied since,
/// by this program or another, is left alone.
pub fn clear_clipboard_if_still(copy: &ClipboardCopy) -> io::Result<bool> {
    let _clipboard = OpenedClipboard::open()?;
    // While the clipboard is open, no other program can change it between the check and the clear.
    // SAFETY: GetClipboardSequenceNumber has no preconditions.
    if unsafe { GetClipboardSequenceNumber() } != copy.sequence {
        return Ok(false);
    }
    // SAFETY: the clipboard is open on this thread.
    unsafe { EmptyClipboard() }.map_err(|error| io_error_of(&error))?;
    Ok(true)
}

fn registered_format(name: PCWSTR) -> io::Result<u32> {
    // SAFETY: `name` is a constant, zero-terminated wide string.
    match unsafe { RegisterClipboardFormatW(name) } {
        0 => Err(io::Error::last_os_error()),
        format => Ok(format),
    }
}

/// Gives a block to the clipboard, which owns it once SetClipboardData succeeds; on failure the
/// block is freed by its guard.
fn hand_over(format: u32, block: GlobalBlock) -> io::Result<()> {
    // SAFETY: the clipboard is open on this thread and the block holds the format's data.
    unsafe { SetClipboardData(format, Some(HANDLE(block.memory.0))) }
        .map_err(|error| io_error_of(&error))?;
    block.release();
    Ok(())
}

fn utf16_with_terminator(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// A DWORD as the two UTF-16 units of its little-endian bytes, low half first.
fn dword_units(value: u32) -> [u16; 2] {
    let [first, second, third, fourth] = value.to_le_bytes();
    [
        u16::from_le_bytes([first, second]),
        u16::from_le_bytes([third, fourth]),
    ]
}

/// Movable global memory, freed when dropped unless handed to the clipboard.
struct GlobalBlock {
    memory: HGLOBAL,
}

impl GlobalBlock {
    fn of_units(units: &[u16]) -> io::Result<Self> {
        let bytes = std::mem::size_of_val(units);
        // SAFETY: allocating movable memory of a known size; failure is reported as an error.
        let memory =
            unsafe { GlobalAlloc(GMEM_MOVEABLE, bytes) }.map_err(|error| io_error_of(&error))?;
        let block = Self { memory };
        // SAFETY: the block was just allocated and is locked once, here.
        let target = unsafe { GlobalLock(block.memory) }.cast::<u16>();
        if target.is_null() {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: the locked block is `bytes` long and aligned for u16, as all global memory is,
        // and it cannot overlap the source slice.
        unsafe { std::ptr::copy_nonoverlapping(units.as_ptr(), target, units.len()) };
        // SAFETY: unlocking the lock taken above; the result only says whether locks remain.
        let _ = unsafe { GlobalUnlock(block.memory) };
        Ok(block)
    }

    fn release(self) {
        std::mem::forget(self);
    }
}

impl Drop for GlobalBlock {
    fn drop(&mut self) {
        // SAFETY: the block is still this program's, as `release` forgets the guard instead.
        let _ = unsafe { GlobalFree(Some(self.memory)) };
    }
}

#[cfg(test)]
mod tests {
    use windows::Win32::System::DataExchange::{GetClipboardData, IsClipboardFormatAvailable};
    use windows::Win32::System::Memory::GlobalSize;

    use super::*;
    use crate::clipboard::{REAL_CLIPBOARD, read_clipboard_text};

    #[test]
    fn text_ends_with_one_zero_and_a_dword_keeps_its_bytes() {
        assert_eq!(
            utf16_with_terminator("ab"),
            vec![u16::from(b'a'), u16::from(b'b'), 0]
        );
        assert_eq!(dword_units(0), [0, 0]);
        assert_eq!(dword_units(0x0001_0002), [2, 1]);
    }

    /// The DWORD a format holds on the open clipboard, or None when the format is absent.
    fn dword_on_clipboard(name: PCWSTR) -> Option<u32> {
        let format = registered_format(name).unwrap();
        let _clipboard = OpenedClipboard::open().unwrap();
        // SAFETY: the clipboard is open; this only asks whether the format is on it.
        unsafe { IsClipboardFormatAvailable(format) }.ok()?;
        // SAFETY: the clipboard is open, so the handle stays valid while it is read below.
        let memory = HGLOBAL(unsafe { GetClipboardData(format) }.unwrap().0);
        // SAFETY: the clipboard's own block, locked and read only while the clipboard is open.
        unsafe {
            assert!(GlobalSize(memory) >= 4);
            let bytes = GlobalLock(memory).cast::<u8>();
            let value = u32::from_le_bytes(std::ptr::read_unaligned(bytes.cast::<[u8; 4]>()));
            let _ = GlobalUnlock(memory);
            Some(value)
        }
    }

    fn put_text_as_another_program(text: &str) {
        let _clipboard = OpenedClipboard::open().unwrap();
        // SAFETY: the clipboard is open on this thread.
        unsafe { EmptyClipboard() }.unwrap();
        hand_over(
            u32::from(CF_UNICODETEXT.0),
            GlobalBlock::of_units(&utf16_with_terminator(text)).unwrap(),
        )
        .unwrap();
    }

    // It replaces the user's clipboard for a moment, so it runs only when asked for, as CI does.
    #[test]
    #[ignore = "uses the real clipboard"]
    fn copied_text_carries_the_history_exclusion_formats() {
        let _turn = REAL_CLIPBOARD
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let earlier = read_clipboard_text(usize::MAX).unwrap_or_default();

        copy_text_outside_history("salary 4200").unwrap();
        let text = read_clipboard_text(100).unwrap();
        let history = dword_on_clipboard(CAN_INCLUDE_IN_HISTORY);
        let cloud = dword_on_clipboard(CAN_UPLOAD_TO_CLOUD);
        let monitors = dword_on_clipboard(EXCLUDE_FROM_MONITORS);
        put_text_as_another_program(earlier.as_deref().unwrap_or_default());

        assert_eq!(text.as_deref(), Some("salary 4200"));
        assert_eq!(history, Some(0));
        assert_eq!(cloud, Some(0));
        assert!(monitors.is_some());
    }

    #[test]
    #[ignore = "uses the real clipboard"]
    fn the_clipboard_is_cleared_only_while_it_still_holds_our_copy() {
        let _turn = REAL_CLIPBOARD
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let earlier = read_clipboard_text(usize::MAX).unwrap_or_default();

        let ours = copy_text_outside_history("secret").unwrap();
        let cleared = clear_clipboard_if_still(&ours).unwrap();
        let after_clearing = read_clipboard_text(100).unwrap();
        let replaced = copy_text_outside_history("secret").unwrap();
        put_text_as_another_program("copied elsewhere");
        let cleared_over_other = clear_clipboard_if_still(&replaced).unwrap();
        let kept = read_clipboard_text(100).unwrap();
        put_text_as_another_program(earlier.as_deref().unwrap_or_default());

        assert!(cleared);
        assert_eq!(after_clearing, None);
        assert!(!cleared_over_other);
        assert_eq!(kept.as_deref(), Some("copied elsewhere"));
    }
}
