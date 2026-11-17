use std::io;
use std::thread;
use std::time::Duration;

use windows::Win32::Foundation::{HANDLE, HGLOBAL};
use windows::Win32::System::DataExchange::{
    CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
};
use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
use windows::Win32::System::Ole::CF_UNICODETEXT;

use crate::com_error::io_error_of;

/// Another program may hold the clipboard for a moment, such as while it copies.
const OPEN_ATTEMPTS: u32 = 5;
const OPEN_RETRY_DELAY: Duration = Duration::from_millis(20);
const UTF16_UNIT_BYTES: usize = 2;

/// The clipboard is open while this lives and closed when it is dropped, on every path.
struct OpenedClipboard;

impl OpenedClipboard {
    fn open() -> io::Result<Self> {
        let mut attempt = 1;
        loop {
            // SAFETY: no window owns the clipboard here, which OpenClipboard allows; it is closed
            // by the guard returned on success.
            match unsafe { OpenClipboard(None) } {
                Ok(()) => return Ok(Self),
                Err(_) if attempt < OPEN_ATTEMPTS => {
                    attempt += 1;
                    thread::sleep(OPEN_RETRY_DELAY);
                }
                Err(error) => return Err(io_error_of(&error)),
            }
        }
    }
}

impl Drop for OpenedClipboard {
    fn drop(&mut self) {
        // SAFETY: this guard exists only while this thread has the clipboard open.
        let _ = unsafe { CloseClipboard() };
    }
}

/// Clipboard memory locked for reading, unlocked when this is dropped.
struct LockedMemory {
    memory: HGLOBAL,
    units: *const u16,
}

impl LockedMemory {
    fn lock(memory: HGLOBAL) -> io::Result<Self> {
        // SAFETY: `memory` is the clipboard's own handle, valid while the clipboard is open, which
        // the caller's guard keeps; a null result is handled below.
        let units = unsafe { GlobalLock(memory) }.cast::<u16>().cast_const();
        if units.is_null() {
            return Err(io::Error::last_os_error());
        }
        Ok(Self { memory, units })
    }
}

impl Drop for LockedMemory {
    fn drop(&mut self) {
        // SAFETY: the memory was locked by `lock` and is unlocked exactly once, here.
        let _ = unsafe { GlobalUnlock(self.memory) };
    }
}

/// Whether text of this many bytes, with its closing zero, stays within a limit of UTF-16 units.
fn is_within_limit(size_bytes: usize, max_units: usize) -> bool {
    size_bytes / UTF16_UNIT_BYTES <= max_units.saturating_add(1)
}

/// Clipboard text ends at its first zero; anything after it is not part of the text.
fn text_before_zero(units: &[u16]) -> String {
    let end = units
        .iter()
        .position(|&unit| unit == 0)
        .unwrap_or(units.len());
    String::from_utf16_lossy(units.get(..end).unwrap_or_default())
}

/// The clipboard's Unicode text, or `None` when it holds no text. Text longer than `max_units`
/// UTF-16 units is refused with `FileTooLarge` before any of it is copied.
pub fn read_clipboard_text(max_units: usize) -> io::Result<Option<String>> {
    let _clipboard = OpenedClipboard::open()?;
    let format = u32::from(CF_UNICODETEXT.0);
    // SAFETY: the clipboard is open; this only asks whether a format is on it.
    if unsafe { IsClipboardFormatAvailable(format) }.is_err() {
        return Ok(None);
    }
    // SAFETY: the clipboard is open, so the handle stays valid until it is closed, after this
    // function has finished with it.
    let handle: HANDLE =
        unsafe { GetClipboardData(format) }.map_err(|error| io_error_of(&error))?;
    let memory = HGLOBAL(handle.0);
    // SAFETY: `memory` is the clipboard's handle for its text; a size of 0 means it failed.
    let size_bytes = unsafe { GlobalSize(memory) };
    if size_bytes == 0 {
        return Err(io::Error::last_os_error());
    }
    if !is_within_limit(size_bytes, max_units) {
        return Err(io::Error::from(io::ErrorKind::FileTooLarge));
    }
    let locked = LockedMemory::lock(memory)?;
    // SAFETY: the locked block is at least `size_bytes` long, its start is aligned for `u16` as
    // all global memory is, and it is only read while `locked` keeps it locked.
    let units = unsafe { std::slice::from_raw_parts(locked.units, size_bytes / UTF16_UNIT_BYTES) };
    Ok(Some(text_before_zero(units)))
}

#[cfg(test)]
mod tests {
    use windows::Win32::System::DataExchange::{EmptyClipboard, SetClipboardData};
    use windows::Win32::System::Memory::{GMEM_MOVEABLE, GlobalAlloc};

    use super::*;

    fn units_of(text: &str) -> Vec<u16> {
        text.encode_utf16().collect()
    }

    #[test]
    fn text_ends_at_its_first_zero() {
        let mut units = units_of("plain");
        units.extend([0, u16::from(b'x')]);

        assert_eq!(text_before_zero(&units), "plain");
        assert_eq!(text_before_zero(&units_of("no zero")), "no zero");
    }

    #[test]
    fn keeps_text_outside_the_basic_plane() {
        assert_eq!(text_before_zero(&units_of("日本語 👩‍💻")), "日本語 👩‍💻");
    }

    #[test]
    fn the_limit_counts_units_and_allows_the_closing_zero() {
        assert!(is_within_limit(12, 5));
        assert!(!is_within_limit(14, 5));
        assert!(is_within_limit(usize::MAX, usize::MAX));
    }

    /// Puts text on the clipboard the way another program would, or clears it.
    fn set_clipboard_text(text: Option<&str>) {
        let _clipboard = OpenedClipboard::open().unwrap();
        // SAFETY: the clipboard is open on this thread.
        unsafe { EmptyClipboard() }.unwrap();
        let Some(text) = text else { return };
        let mut units = units_of(text);
        units.push(0);
        let bytes = units.len() * UTF16_UNIT_BYTES;
        // SAFETY: a fresh block of `bytes` bytes, filled through its lock and then given to the
        // clipboard, which owns it from then on.
        unsafe {
            let memory = GlobalAlloc(GMEM_MOVEABLE, bytes).unwrap();
            let target = GlobalLock(memory).cast::<u16>();
            std::ptr::copy_nonoverlapping(units.as_ptr(), target, units.len());
            let _ = GlobalUnlock(memory);
            SetClipboardData(u32::from(CF_UNICODETEXT.0), Some(HANDLE(memory.0))).unwrap();
        }
    }

    #[test]
    fn reads_back_text_put_on_the_clipboard_and_refuses_text_over_the_limit() {
        let earlier = read_clipboard_text(usize::MAX).unwrap_or_default();
        set_clipboard_text(Some("Area \\(x\\)\tdone\r\nnext"));

        let read = read_clipboard_text(100);
        let refused = read_clipboard_text(3);
        set_clipboard_text(earlier.as_deref());

        assert_eq!(read.unwrap(), Some("Area \\(x\\)\tdone\r\nnext".to_owned()));
        assert_eq!(refused.unwrap_err().kind(), io::ErrorKind::FileTooLarge);
    }
}
