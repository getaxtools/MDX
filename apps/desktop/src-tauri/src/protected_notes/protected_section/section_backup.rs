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
/// Gives up rather than trying names forever in a folder full of backups or set-aside folders.
const MAX_NAME_SUFFIX: u32 = 1_000;
/// No file of a section is larger: the largest note or picture, sealed.
const MAX_SECTION_FILE_BYTES: u64 = 128 * 1_024 * 1_024;
const RESTORING_SUFFIX: &str = "restoring";
const REPLACED_SUFFIX: &str = "replaced";

impl SectionFolder {
    /// Copies the section's files as they are into a new folder inside `into`, each read back and
    /// compared; returns that folder. Nothing is decrypted, so this works while locked too.
    pub fn back_up(&self, into: &Path) -> Result<PathBuf, ProtectedError> {
        self.read_vault()?;
        let files = self.section_files()?;
        ensure_room_for(&self.folder, &files, into)?;
        let backup = new_folder(into, |number| match number {
            1 => BACKUP_FOLDER_NAME.to_owned(),
            _ => format!("{BACKUP_FOLDER_NAME} {number}"),
        })?;
        let copied = copy_checked(&self.folder, &backup, &files);
        if copied.is_err() {
            let _ = fs::remove_dir_all(&backup);
        }
        copied.map(|()| backup)
    }

    /// Puts a backup in place of a section that is not set up here. The backup is copied and
    /// checked into a new folder beside the section, which takes its place only once every file is
    /// there and still no section has appeared; a folder in the way is set aside, never deleted.
    /// The section then unlocks with the password or recovery key it had when it was backed up.
    pub fn restore_from(&self, backup: &Path) -> Result<(), ProtectedError> {
        self.restore_from_with(backup, || {})
    }

    fn restore_from_with(
        &self,
        backup: &Path,
        before_swap: impl FnOnce(),
    ) -> Result<(), ProtectedError> {
        let source = self.checked_backup(backup)?;
        let files = source.section_files()?;
        let parent = self.folder.parent().ok_or(ProtectedError::Storage)?;
        fs::create_dir_all(parent)?;
        ensure_room_for(backup, &files, parent)?;
        let staging = new_folder(parent, |number| self.beside_name(RESTORING_SUFFIX, number))?;
        let restored = copy_checked(backup, &staging, &files).and_then(|()| {
            before_swap();
            self.refuse_a_section_here()?;
            self.swap_in(parent, &staging)
        });
        if restored.is_err() {
            let _ = fs::remove_dir_all(&staging);
        }
        restored
    }

    /// The backup as a section, once its folders are plain folders and it has a vault, and once
    /// there is no section here to replace.
    fn checked_backup(&self, backup: &Path) -> Result<Self, ProtectedError> {
        ensure_plain(backup, true)?;
        let notes = backup.join(NOTES_FOLDER);
        if fs::symlink_metadata(&notes).is_ok() {
            ensure_plain(&notes, true)?;
        }
        let source = Self::new(backup.to_path_buf());
        source.read_vault()?;
        self.refuse_a_section_here()?;
        Ok(source)
    }

    fn refuse_a_section_here(&self) -> Result<(), ProtectedError> {
        let mut names = self.note_file_names()?;
        for name in [VAULT_FILE_NAME, MANIFEST_FILE_NAME] {
            if fs::symlink_metadata(self.folder.join(name)).is_ok() {
                names.push(name.to_owned());
            }
        }
        match set_up_refusal(names.iter().map(String::as_str)) {
            Some(SetUpRefusal::AlreadySetUp) => Err(ProtectedError::AlreadySetUp),
            Some(SetUpRefusal::VaultFileMissing) => Err(ProtectedError::VaultFileMissing),
            None => Ok(()),
        }
    }

    /// Moves whatever is where the section goes aside, then the restored folder into its place.
    fn swap_in(&self, parent: &Path, staging: &Path) -> Result<(), ProtectedError> {
        if fs::symlink_metadata(&self.folder).is_ok() {
            let aside = free_name(parent, |number| self.beside_name(REPLACED_SUFFIX, number))?;
            fs::rename(&self.folder, aside).map_err(|_| ProtectedError::Storage)?;
        }
        fs::rename(staging, &self.folder).map_err(|_| ProtectedError::Storage)
    }

    /// `protected.restoring-1`, `protected.replaced-2` and so on, beside the section's folder.
    fn beside_name(&self, suffix: &str, number: u32) -> String {
        let name = self
            .folder
            .file_name()
            .unwrap_or_default()
            .to_string_lossy();
        format!("{name}.{suffix}-{number}")
    }

    /// The section's files, relative to its folder: the vault, the manifests there are, and every
    /// file named by a note id.
    fn section_files(&self) -> Result<Vec<PathBuf>, ProtectedError> {
        let mut files = vec![PathBuf::from(VAULT_FILE_NAME)];
        for name in [MANIFEST_FILE_NAME, STAGED_MANIFEST_FILE_NAME] {
            if fs::symlink_metadata(self.folder.join(name)).is_ok() {
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

/// Refuses a symbolic link, a junction or any other reparse point, and a folder or file that is
/// not what is expected, so a crafted backup cannot make MDX read or write somewhere else.
fn ensure_plain(path: &Path, is_folder: bool) -> Result<(), ProtectedError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| ProtectedError::NotSetUp)?;
    let is_expected = if is_folder {
        metadata.is_dir()
    } else {
        metadata.is_file()
    };
    if !is_expected || metadata.file_type().is_symlink() || is_reparse_point(&metadata) {
        return Err(ProtectedError::Tampered);
    }
    Ok(())
}

#[cfg(windows)]
fn is_reparse_point(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn is_reparse_point(_metadata: &fs::Metadata) -> bool {
    false
}

#[cfg(windows)]
fn is_hard_link(file: &File) -> Result<bool, ProtectedError> {
    let count = mdx_native_windows::link_count_of(file).map_err(|_| ProtectedError::Storage)?;
    Ok(count != 1)
}

#[cfg(not(windows))]
fn is_hard_link(_file: &File) -> Result<bool, ProtectedError> {
    Ok(false)
}

/// The files' total size must fit in the free space where they go, with room to spare for the
/// file system, so a copy never fills the drive.
fn ensure_room_for(from: &Path, files: &[PathBuf], into: &Path) -> Result<(), ProtectedError> {
    let needed = files.iter().try_fold(0_u64, |total, file| {
        let size = fs::symlink_metadata(from.join(file))
            .map_err(|_| ProtectedError::Storage)?
            .len();
        Ok::<u64, ProtectedError>(total.saturating_add(size))
    })?;
    let free = fs4::available_space(into).map_err(|_| ProtectedError::Storage)?;
    if has_room(needed, free) {
        Ok(())
    } else {
        Err(ProtectedError::TooLarge)
    }
}

/// Twice what is copied must be free: the copy, and as much again for the file system and the
/// files the user saves meanwhile.
const fn has_room(needed: u64, free: u64) -> bool {
    matches!(needed.checked_mul(2), Some(twice) if twice <= free)
}

/// The first name `name_of` gives that nothing has in `parent`.
fn free_name(parent: &Path, name_of: impl Fn(u32) -> String) -> Result<PathBuf, ProtectedError> {
    (1..=MAX_NAME_SUFFIX)
        .map(|number| parent.join(name_of(number)))
        .find(|path| fs::symlink_metadata(path).is_err())
        .ok_or(ProtectedError::TooLarge)
}

/// A new folder in `parent` under the first name `name_of` gives, never one that is there already.
fn new_folder(parent: &Path, name_of: impl Fn(u32) -> String) -> Result<PathBuf, ProtectedError> {
    for number in 1..=MAX_NAME_SUFFIX {
        let folder = parent.join(name_of(number));
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

/// Reads one plain file, never a link, no larger than a section file can be; one byte past the
/// limit is read, so a file that grew after it was checked is refused, not cut.
fn read_section_file(path: &Path) -> Result<Vec<u8>, ProtectedError> {
    ensure_plain(path, false)?;
    let file = File::open(path).map_err(|_| ProtectedError::Storage)?;
    if is_hard_link(&file)? {
        return Err(ProtectedError::Tampered);
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
