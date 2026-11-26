use std::io;

use windows::Win32::Foundation::WIN32_ERROR;
use windows::core::{Error, HRESULT};

/// HRESULTs in this range wrap a Win32 error code in their low 16 bits.
const FACILITY_WIN32_HRESULT: u32 = 0x8007_0000;
const FACILITY_MASK: u32 = 0xFFFF_0000;
const CODE_MASK: u32 = 0x0000_FFFF;

/// A Win32 error wrapped in an HRESULT becomes that error, so its kind (not found, access denied)
/// survives; any other failure keeps its HRESULT in the message.
pub fn io_error_of_hresult(hresult: HRESULT) -> io::Error {
    // HRESULTs are bit patterns; reading the signed value as unsigned keeps every bit.
    let bits = hresult.0.cast_unsigned();
    if bits & FACILITY_MASK == FACILITY_WIN32_HRESULT {
        return io::Error::from_raw_os_error(i32::from(
            u16::try_from(bits & CODE_MASK).unwrap_or(0),
        ));
    }
    io::Error::other(format!("Windows reported 0x{bits:08X}"))
}

pub fn io_error_of(error: &Error) -> io::Error {
    io_error_of_hresult(error.code())
}

pub fn io_error_of_win32(error: WIN32_ERROR) -> io::Error {
    io::Error::from_raw_os_error(i32::try_from(error.0).unwrap_or(i32::MAX))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_wrapped_win32_error_keeps_its_kind() {
        let access_denied = HRESULT(0x8007_0005_u32.cast_signed());
        let not_found = HRESULT(0x8007_0002_u32.cast_signed());

        assert_eq!(
            io_error_of_hresult(access_denied).kind(),
            io::ErrorKind::PermissionDenied
        );
        assert_eq!(
            io_error_of_hresult(not_found).kind(),
            io::ErrorKind::NotFound
        );
        assert_eq!(io_error_of_hresult(not_found).raw_os_error(), Some(2));
    }

    #[test]
    fn another_failure_names_its_hresult() {
        let unspecified = HRESULT(0x8000_4005_u32.cast_signed());

        let error = io_error_of_hresult(unspecified);

        assert_eq!(error.kind(), io::ErrorKind::Other);
        assert_eq!(error.to_string(), "Windows reported 0x80004005");
    }

    #[test]
    fn a_registry_error_becomes_the_same_os_error() {
        assert_eq!(
            io_error_of_win32(WIN32_ERROR(2)).kind(),
            io::ErrorKind::NotFound
        );
    }
}
