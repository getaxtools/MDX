use std::io;
use std::path::{Component, Path, PathBuf, Prefix};
use std::thread;

/// Only local drives keep a `$Recycle.Bin` folder; network shares, and drives that never had one,
/// would delete files outright, so they report none.
pub fn has_recycle_bin(folder: &Path) -> bool {
    std::fs::canonicalize(folder)
        .ok()
        .and_then(|resolved| drive_letter_of(&resolved))
        .is_some_and(|drive| Path::new(&format!(r"{drive}:\$Recycle.Bin")).is_dir())
}

/// Mapped network drives resolve to their share, so only a path on a lettered local drive has a letter.
fn drive_letter_of(resolved: &Path) -> Option<char> {
    let Some(Component::Prefix(prefix)) = resolved.components().next() else {
        return None;
    };
    match prefix.kind() {
        Prefix::VerbatimDisk(letter) | Prefix::Disk(letter) => Some(char::from(letter)),
        _ => None,
    }
}

/// The shell's file operation needs COM set up on its thread; a thread of its own starts without
/// any COM mode, so the crate's set-up cannot clash with one another library chose.
pub fn move_to_recycle_bin(paths: &[PathBuf]) -> io::Result<()> {
    let paths = paths.to_vec();
    thread::Builder::new()
        .name("recycle-bin".to_owned())
        .spawn(move || trash::delete_all(&paths).map_err(io::Error::other))?
        .join()
        .map_err(|_| io::Error::other("the Recycle Bin thread stopped"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_network_share_has_no_drive_letter() {
        assert_eq!(
            drive_letter_of(Path::new(r"\\?\UNC\server\share\Notes")),
            None
        );
        assert_eq!(drive_letter_of(Path::new(r"\\server\share\Notes")), None);
    }

    #[test]
    fn a_local_drive_has_its_letter() {
        assert_eq!(drive_letter_of(Path::new(r"\\?\D:\Notes")), Some('D'));
        assert_eq!(drive_letter_of(Path::new(r"C:\Notes")), Some('C'));
    }

    #[test]
    fn a_missing_folder_has_no_recycle_bin() {
        let folder = tempfile::tempdir().unwrap();

        assert!(!has_recycle_bin(&folder.path().join("missing")));
    }
}
