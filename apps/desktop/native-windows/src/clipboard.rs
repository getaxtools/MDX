use std::io;
use std::marker::PhantomData;
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

/// The clipboard is open while this lives and closed when it is dropped, on every path. It stays
/// on the thread that opened it, as the clipboard is opened for one thread.
pub(crate) struct OpenedClipboard {
    _not_send: PhantomData<*const ()>,
}

impl OpenedClipboard {
    pub(crate) fn open() -> io::Result<Self> {
        let mut attempt = 1;
        loop {
            // SAFETY: a null window ties the open clipboard to this thread, which OpenClipboard
            // allows; it is closed by the guard returned on success.
            match unsafe { OpenClipboard(None) } {
                Ok(()) => {
                    return Ok(Self {
                        _not_send: PhantomData,
                    });
                }
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

/// Where clipboard text ends: at its first zero, or at the end of its memory block.
fn text_length(units: &[u16]) -> usize {
    units
        .iter()
        .position(|&unit| unit == 0)
        .unwrap_or(units.len())
}

/// The text of a block of UTF-16 units, refused with `FileTooLarge` when longer than `max_units`.
fn text_within_limit(units: &[u16], max_units: usize) -> io::Result<String> {
    let length = text_length(units);
    if length > max_units {
        return Err(io::Error::from(io::ErrorKind::FileTooLarge));
    }
    Ok(String::from_utf16_lossy(
        units.get(..length).unwrap_or_default(),
    ))
}

/// The clipboard's Unicode text, or `None` when it holds no text. The text ends at its first zero,
/// and text longer than `max_units` UTF-16 units is refused with `FileTooLarge` before it is copied.
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
    // SAFETY: `memory` is the clipboard's handle for its text; a size of 0 is either an empty
    // block or a failure, which the last error tells apart.
    let size_bytes = unsafe { GlobalSize(memory) };
    if size_bytes == 0 {
        let error = io::Error::last_os_error();
        return if error.raw_os_error() == Some(0) {
            Ok(Some(String::new()))
        } else {
            Err(error)
        };
    }
    let locked = LockedMemory::lock(memory)?;
    // SAFETY: the locked block is at least `size_bytes` long, its start is aligned for `u16` as
    // all global memory is, and it is only read while `locked` keeps it locked.
    let units = unsafe { std::slice::from_raw_parts(locked.units, size_bytes / UTF16_UNIT_BYTES) };
    text_within_limit(units, max_units).map(Some)
}

/// The real clipboard is one for the whole machine, so the tests that use it take turns.
#[cfg(test)]
pub(crate) static REAL_CLIPBOARD: std::sync::Mutex<()> = std::sync::Mutex::new(());

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

        assert_eq!(text_within_limit(&units, 100).unwrap(), "plain");
        assert_eq!(
            text_within_limit(&units_of("no zero"), 100).unwrap(),
            "no zero"
        );
    }

    #[test]
    fn keeps_text_outside_the_basic_plane() {
        assert_eq!(
            text_within_limit(&units_of("日本語 👩‍💻"), 100).unwrap(),
            "日本語 👩‍💻"
        );
    }

    #[test]
    fn the_limit_counts_the_text_up_to_its_first_zero_not_the_block() {
        let mut short_text_in_a_large_block = units_of("short");
        short_text_in_a_large_block.extend([0; 1000]);

        assert_eq!(
            text_within_limit(&short_text_in_a_large_block, 5).unwrap(),
            "short"
        );
        assert_eq!(
            text_within_limit(&units_of("longer"), 5)
                .unwrap_err()
                .kind(),
            io::ErrorKind::FileTooLarge
        );
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
            assert!(!target.is_null(), "the new block could not be locked");
            std::ptr::copy_nonoverlapping(units.as_ptr(), target, units.len());
            let _ = GlobalUnlock(memory);
            SetClipboardData(u32::from(CF_UNICODETEXT.0), Some(HANDLE(memory.0))).unwrap();
        }
    }

    // It replaces the user's clipboard for a moment, so it runs only when asked for, as CI does.
    #[test]
    #[ignore = "uses the real clipboard"]
    fn reads_back_text_put_on_the_clipboard_and_refuses_text_over_the_limit() {
        let _turn = REAL_CLIPBOARD
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let earlier = read_clipboard_text(usize::MAX).unwrap_or_default();
        set_clipboard_text(Some("Area \\(x\\)\tdone\r\nnext"));

        let read = read_clipboard_text(100);
        let refused = read_clipboard_text(3);
        set_clipboard_text(earlier.as_deref());

        assert_eq!(read.unwrap(), Some("Area \\(x\\)\tdone\r\nnext".to_owned()));
        assert_eq!(refused.unwrap_err().kind(), io::ErrorKind::FileTooLarge);
    }
}
