//! Backups of a section as it is on disk: its vault, manifest and sealed files, still encrypted, so
//! a backup opens only with the password or recovery key the section had when it was backed up.

use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

use super::{
    MANIFEST_FILE_NAME, NOTES_FOLDER, STAGED_MANIFEST_FILE_NAME, SectionFolder,
    note_id_of_file_name,
};
use crate::protected_notes::ProtectedError;
use crate::protected_notes::vault_file::{SetUpRefusal, VAULT_FILE_NAME, set_up_refusal};

/// The folder a backup is made in, inside the folder the user chose; numbered when taken.
pub const BACKUP_FOLDER_NAME: &str = "MDX protected notes backup";
/// Gives up rather than trying names forever in a folder full of backups.
const MAX_BACKUP_NAME_SUFFIX: u32 = 1_000;
/// No file of a section is larger: the largest note or picture, sealed.
const MAX_SECTION_FILE_BYTES: u64 = 128 * 1_024 * 1_024;
const RESTORING_SUFFIX: &str = "restoring";

impl SectionFolder {
    /// Copies the section's files as they are into a new folder inside `into`, each read back and
    /// compared; returns that folder. Nothing is decrypted, so this works while locked too.
    pub fn back_up(&self, into: &Path) -> Result<PathBuf, ProtectedError> {
        self.read_vault()?;
        let files = self.section_files()?;
        let backup = new_backup_folder(into)?;
        let copied = copy_checked(&self.folder, &backup, &files);
        if copied.is_err() {
            let _ = fs::remove_dir_all(&backup);
        }
        copied.map(|()| backup)
    }

    /// Puts a backup in place of a section that is not set up here: copied and checked into a folder
    /// beside it, which becomes the section only once every file is there. The section then unlocks
    /// with the password or recovery key it had when it was backed up.
    pub fn restore_from(&self, backup: &Path) -> Result<(), ProtectedError> {
        let source = Self::new(backup.to_path_buf());
        source.read_vault()?;
        match self.set_up_refusal()? {
            Some(SetUpRefusal::AlreadySetUp) => return Err(ProtectedError::AlreadySetUp),
            Some(SetUpRefusal::VaultFileMissing) => return Err(ProtectedError::VaultFileMissing),
            None => {}
        }
        let files = source.section_files()?;
        let staging = self.restoring_folder();
        let _ = fs::remove_dir_all(&staging);
        let restored = copy_checked(backup, &staging, &files).and_then(|()| {
            if self.folder.exists() {
                fs::remove_dir_all(&self.folder)?;
            }
            fs::rename(&staging, &self.folder).map_err(|_| ProtectedError::Storage)
        });
        if restored.is_err() {
            let _ = fs::remove_dir_all(&staging);
        }
        restored
    }

    fn set_up_refusal(&self) -> Result<Option<SetUpRefusal>, ProtectedError> {
        let mut names = self.note_file_names()?;
        for name in [VAULT_FILE_NAME, MANIFEST_FILE_NAME] {
            if self.folder.join(name).exists() {
                names.push(name.to_owned());
            }
        }
        Ok(set_up_refusal(names.iter().map(String::as_str)))
    }

    fn restoring_folder(&self) -> PathBuf {
        let mut name = self.folder.file_name().unwrap_or_default().to_os_string();
        name.push(format!(".{RESTORING_SUFFIX}"));
        self.folder.with_file_name(name)
    }

    /// The section's files, relative to its folder: the vault, the manifests there are, and every
    /// file named by a note id.
    fn section_files(&self) -> Result<Vec<PathBuf>, ProtectedError> {
        let mut files = vec![PathBuf::from(VAULT_FILE_NAME)];
        for name in [MANIFEST_FILE_NAME, STAGED_MANIFEST_FILE_NAME] {
            if self.folder.join(name).is_file() {
                files.push(PathBuf::from(name));
            }
        }
        for name in self.note_file_names()? {
            if note_id_of_file_name(&name).is_some() {
                files.push(Path::new(NOTES_FOLDER).join(name));
            }
        }
        Ok(files)
    }
}

/// A new folder for a backup, never one that is there already.
fn new_backup_folder(into: &Path) -> Result<PathBuf, ProtectedError> {
    for number in 1..=MAX_BACKUP_NAME_SUFFIX {
        let name = match number {
            1 => BACKUP_FOLDER_NAME.to_owned(),
            _ => format!("{BACKUP_FOLDER_NAME} {number}"),
        };
        let folder = into.join(name);
        match fs::create_dir(&folder) {
            Ok(()) => return Ok(folder),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err(ProtectedError::Storage),
        }
    }
    Err(ProtectedError::TooLarge)
}

fn copy_checked(from: &Path, to: &Path, files: &[PathBuf]) -> Result<(), ProtectedError> {
    fs::create_dir_all(to.join(NOTES_FOLDER))?;
    for file in files {
        let bytes = read_section_file(&from.join(file))?;
        let target = to.join(file);
        fs::write(&target, &bytes)?;
        if !fs::read(&target).is_ok_and(|written| written == bytes) {
            return Err(ProtectedError::Storage);
        }
    }
    Ok(())
}

/// Reads one byte past the limit, so a file that grew after it was checked is refused, not cut.
fn read_section_file(path: &Path) -> Result<Vec<u8>, ProtectedError> {
    let file = File::open(path).map_err(|_| ProtectedError::Storage)?;
    if !file.metadata()?.is_file() {
        return Err(ProtectedError::Storage);
    }
    let mut bytes = Vec::new();
    file.take(MAX_SECTION_FILE_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_SECTION_FILE_BYTES {
        return Err(ProtectedError::TooLarge);
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests;
