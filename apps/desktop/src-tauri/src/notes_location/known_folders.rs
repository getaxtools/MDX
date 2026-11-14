use std::ffi::OsString;

/// OneDrive sets these to its sync roots: personal, and work or school.
const ONE_DRIVE_VARIABLES: [&str; 3] = ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"];

/// The OneDrive sync roots on this account, without repeats; only a notice depends on them.
pub fn one_drive_folders(read_variable: impl Fn(&str) -> Option<OsString>) -> Vec<String> {
    let mut folders: Vec<String> = Vec::new();
    for name in ONE_DRIVE_VARIABLES {
        let Some(value) = read_variable(name) else {
            continue;
        };
        let folder = value.to_string_lossy().trim().to_owned();
        let is_known = folders
            .iter()
            .any(|known| known.eq_ignore_ascii_case(&folder));
        if !folder.is_empty() && !is_known {
            folders.push(folder);
        }
    }
    folders
}

#[cfg(test)]
mod tests {
    use super::*;

    fn variables(values: &[(&str, &str)]) -> impl Fn(&str) -> Option<OsString> {
        let values: Vec<(String, String)> = values
            .iter()
            .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
            .collect();
        move |name| {
            values
                .iter()
                .find(|(known, _)| known == name)
                .map(|(_, value)| OsString::from(value))
        }
    }

    #[test]
    fn lists_the_personal_and_work_sync_roots_once() {
        let read = variables(&[
            ("OneDrive", r"C:\Users\Ana\OneDrive"),
            ("OneDriveConsumer", r"c:\users\ana\onedrive"),
            ("OneDriveCommercial", r"C:\Users\Ana\OneDrive - Contoso"),
        ]);

        assert_eq!(
            one_drive_folders(read),
            [r"C:\Users\Ana\OneDrive", r"C:\Users\Ana\OneDrive - Contoso"]
        );
    }

    #[test]
    fn has_none_without_onedrive() {
        assert!(one_drive_folders(variables(&[("OneDrive", "  ")])).is_empty());
        assert!(one_drive_folders(variables(&[])).is_empty());
    }
}
