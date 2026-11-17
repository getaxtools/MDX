use std::ffi::OsStr;
use std::io;
use std::os::windows::ffi::OsStrExt;

use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
use windows::Win32::System::Registry::{
    HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_DWORD, RegGetValueW,
};
use windows::core::PCWSTR;

use crate::com_error::io_error_of_win32;

/// Which part of the registry a value is read from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegistryRoot {
    /// The settings of the signed-in user.
    CurrentUser,
    /// The settings of the whole computer, where policies set by an administrator are kept.
    LocalMachine,
}

/// A 32-bit number from the registry; `None` when the key or the value is not there.
pub fn read_registry_number(root: RegistryRoot, key: &str, value: &str) -> io::Result<Option<u32>> {
    let key = wide_text(key);
    let value = wide_text(value);
    let mut number = 0_u32;
    let mut size = u32::try_from(size_of::<u32>()).unwrap_or(u32::MAX);
    // SAFETY: both names end with a zero and live for the call; the data pointer and its size
    // describe `number`, and only a 32-bit number is accepted, so nothing larger is written.
    let result = unsafe {
        RegGetValueW(
            hkey_of(root),
            PCWSTR(key.as_ptr()),
            PCWSTR(value.as_ptr()),
            RRF_RT_REG_DWORD,
            None,
            Some((&raw mut number).cast()),
            Some(&raw mut size),
        )
    };
    match result {
        ERROR_SUCCESS => Ok(Some(number)),
        ERROR_FILE_NOT_FOUND => Ok(None),
        other => Err(io_error_of_win32(other)),
    }
}

fn hkey_of(root: RegistryRoot) -> HKEY {
    match root {
        RegistryRoot::CurrentUser => HKEY_CURRENT_USER,
        RegistryRoot::LocalMachine => HKEY_LOCAL_MACHINE,
    }
}

fn wide_text(text: &str) -> Vec<u16> {
    OsStr::new(text)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_number_windows_always_has() {
        let build = read_registry_number(
            RegistryRoot::LocalMachine,
            r"SOFTWARE\Microsoft\Windows NT\CurrentVersion",
            "CurrentMajorVersionNumber",
        )
        .unwrap();

        assert!(build.is_some_and(|major| major >= 10));
    }

    #[test]
    fn a_missing_key_or_value_is_none() {
        assert_eq!(
            read_registry_number(
                RegistryRoot::CurrentUser,
                r"Software\No Such MDX Key",
                "Value"
            )
            .unwrap(),
            None
        );
        assert_eq!(
            read_registry_number(
                RegistryRoot::LocalMachine,
                r"SOFTWARE\Microsoft\Windows NT\CurrentVersion",
                "NoSuchMdxValue"
            )
            .unwrap(),
            None
        );
    }

    #[test]
    fn a_value_of_another_type_is_an_error_not_a_number() {
        let text_value = read_registry_number(
            RegistryRoot::LocalMachine,
            r"SOFTWARE\Microsoft\Windows NT\CurrentVersion",
            "ProductName",
        );

        assert!(text_value.is_err());
    }
}
