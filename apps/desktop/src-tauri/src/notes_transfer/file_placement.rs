use std::ffi::{OsStr, OsString};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use crate::documents::DocumentError;

const PENDING_SUFFIX: &str = ".mdx-copying";
const MAX_NAME_ATTEMPTS: usize = 1_000;

/// What goes into a copied file: another file's bytes, or text made from it.
pub enum CopiedContent<'source> {
    BytesOf(&'source Path),
    Bytes(&'source [u8]),
}

/// How a copy treats a file already at its place.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Placement {
    /// Saved as "Name (imported).md", "Name (imported 2).md" and on; nothing is replaced.
    UnderFreeName,
    /// Refused with `NameTaken`; nothing is replaced.
    OnlyIfFree,
    /// Replaces it, once the user agreed.
    Replacing,
}

/// Writes a copy to a temporary name beside its place, and only then puts it there. Without
/// `Replacing`, the copy is hard-linked to its name, which fails when a file has that name, so nothing
/// is ever replaced, not even a file that appears meanwhile. Returns the path the copy was saved under.
pub fn place_copy(
    content: &CopiedContent<'_>,
    destination: &Path,
    placement: Placement,
) -> Result<PathBuf, DocumentError> {
    let pending = write_pending(content, destination)?;
    let placed = match placement {
        Placement::Replacing => fs::rename(&pending, destination)
            .map(|()| destination.to_path_buf())
            .map_err(DocumentError::from),
        Placement::OnlyIfFree => place_if_free(&pending, destination).and_then(|is_placed| {
            is_placed
                .then(|| destination.to_path_buf())
                .ok_or(DocumentError::NameTaken)
        }),
        Placement::UnderFreeName => place_under_free_name(&pending, destination),
    };
    let _ = fs::remove_file(&pending);
    placed
}

fn place_under_free_name(pending: &Path, destination: &Path) -> Result<PathBuf, DocumentError> {
    for attempt in 0..MAX_NAME_ATTEMPTS {
        let candidate = destination.with_file_name(imported_name(destination, attempt));
        if place_if_free(pending, &candidate)? {
            return Ok(candidate);
        }
    }
    Err(DocumentError::NameTaken)
}

/// `false` when the name is taken. Drives without hard links, such as FAT and exFAT ones, get the bytes
/// written into a file made only if the name is free.
fn place_if_free(pending: &Path, candidate: &Path) -> Result<bool, DocumentError> {
    match fs::hard_link(pending, candidate) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists || candidate.exists() => {
            Ok(false)
        }
        Err(_) => write_into_new_file(pending, candidate),
    }
}

/// Others may only read the new file while it is written, and a failed copy is removed again.
fn write_into_new_file(pending: &Path, candidate: &Path) -> Result<bool, DocumentError> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_SHARE_READ: u32 = 0x1;
        options.share_mode(FILE_SHARE_READ);
    }
    let mut file = match options.open(candidate) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => return Ok(false),
        Err(error) => return Err(error.into()),
    };
    let copied = File::open(pending)
        .and_then(|mut source| io::copy(&mut source, &mut file))
        .and_then(|_| file.sync_all());
    drop(file);
    if let Err(error) = copied {
        let _ = fs::remove_file(candidate);
        return Err(error.into());
    }
    Ok(true)
}

/// `Plan.md`, then `Plan (imported).md`, `Plan (imported 2).md` and on; a name without an extension
/// gets the words at its end.
pub fn imported_name(destination: &Path, attempt: usize) -> OsString {
    let file_name = destination.file_name().unwrap_or_default();
    if attempt == 0 {
        return file_name.to_os_string();
    }
    let suffix = match attempt {
        1 => " (imported)".to_owned(),
        _ => format!(" (imported {attempt})"),
    };
    let stem = destination.file_stem().unwrap_or(file_name);
    let mut name = stem.to_os_string();
    name.push(suffix);
    if let Some(extension) = destination.extension().filter(|_| has_stem(destination)) {
        name.push(".");
        name.push(extension);
    }
    name
}

fn has_stem(path: &Path) -> bool {
    path.file_stem() != path.file_name()
}

fn write_pending(
    content: &CopiedContent<'_>,
    destination: &Path,
) -> Result<PathBuf, DocumentError> {
    let (pending, mut file) = new_pending_file(destination)?;
    let written = write_content(content, &mut file).and_then(|()| file.sync_all());
    drop(file);
    if let Err(error) = written {
        let _ = fs::remove_file(&pending);
        return Err(error.into());
    }
    Ok(pending)
}

/// A temporary file next to the destination, under a name no other file has, so it is never
/// someone else's file.
fn new_pending_file(destination: &Path) -> Result<(PathBuf, File), DocumentError> {
    for attempt in 0..MAX_NAME_ATTEMPTS {
        let pending = destination.with_file_name(pending_name(destination.file_name(), attempt));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&pending)
        {
            Ok(file) => return Ok((pending, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.into()),
        }
    }
    Err(DocumentError::NameTaken)
}

fn pending_name(file_name: Option<&OsStr>, attempt: usize) -> OsString {
    let mut name = file_name.unwrap_or_default().to_os_string();
    name.push(PENDING_SUFFIX);
    if attempt > 0 {
        name.push(format!("-{attempt}"));
    }
    name
}

fn write_content(content: &CopiedContent<'_>, file: &mut File) -> io::Result<()> {
    match content {
        CopiedContent::BytesOf(source) => io::copy(&mut File::open(source)?, file).map(|_| ()),
        CopiedContent::Bytes(bytes) => file.write_all(bytes),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder_with(files: &[(&str, &[u8])]) -> tempfile::TempDir {
        let folder = tempfile::tempdir().unwrap();
        for (name, bytes) in files {
            fs::write(folder.path().join(name), bytes).unwrap();
        }
        folder
    }

    fn names_in(folder: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(folder)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn a_clash_is_saved_under_a_new_name_and_the_existing_file_is_kept() {
        let source = folder_with(&[("Plan.md", b"imported")]);
        let target = folder_with(&[("Plan.md", b"mine"), ("Plan (imported).md", b"older")]);

        let saved = place_copy(
            &CopiedContent::BytesOf(&source.path().join("Plan.md")),
            &target.path().join("Plan.md"),
            Placement::UnderFreeName,
        )
        .unwrap();

        assert_eq!(saved.file_name().unwrap(), "Plan (imported 2).md");
        assert_eq!(fs::read(&saved).unwrap(), b"imported");
        assert_eq!(fs::read(target.path().join("Plan.md")).unwrap(), b"mine");
        assert_eq!(
            fs::read(target.path().join("Plan (imported).md")).unwrap(),
            b"older"
        );
    }

    #[test]
    fn copied_bytes_equal_the_source_and_no_temporary_file_is_left() {
        let bytes: &[u8] = b"\xef\xbb\xbf# Plan\r\n\r\nCaf\xc3\xa9\r\n";
        let source = folder_with(&[("Plan.md", bytes)]);
        let target = tempfile::tempdir().unwrap();

        place_copy(
            &CopiedContent::BytesOf(&source.path().join("Plan.md")),
            &target.path().join("Plan.md"),
            Placement::UnderFreeName,
        )
        .unwrap();

        assert_eq!(fs::read(target.path().join("Plan.md")).unwrap(), bytes);
        assert_eq!(names_in(target.path()), vec!["Plan.md"]);
    }

    #[test]
    fn only_if_free_refuses_a_taken_name_and_changes_nothing() {
        let target = folder_with(&[("Plan.md", b"mine")]);

        let result = place_copy(
            &CopiedContent::Bytes(b"new"),
            &target.path().join("Plan.md"),
            Placement::OnlyIfFree,
        );

        assert_eq!(result, Err(DocumentError::NameTaken));
        assert_eq!(fs::read(target.path().join("Plan.md")).unwrap(), b"mine");
        assert_eq!(names_in(target.path()), vec!["Plan.md"]);
    }

    #[test]
    fn replacing_writes_through_a_temporary_file_and_keeps_a_file_with_the_temporary_name() {
        let target = folder_with(&[("Plan.md", b"old"), ("Plan.md.mdx-copying", b"someone's")]);

        place_copy(
            &CopiedContent::Bytes(b"new"),
            &target.path().join("Plan.md"),
            Placement::Replacing,
        )
        .unwrap();

        assert_eq!(fs::read(target.path().join("Plan.md")).unwrap(), b"new");
        assert_eq!(
            fs::read(target.path().join("Plan.md.mdx-copying")).unwrap(),
            b"someone's"
        );
        assert_eq!(
            names_in(target.path()),
            vec!["Plan.md", "Plan.md.mdx-copying"]
        );
    }

    #[test]
    fn a_failed_copy_leaves_neither_the_copy_nor_a_temporary_file() {
        let target = tempfile::tempdir().unwrap();
        let missing_source = target.path().join("gone.md");

        let result = place_copy(
            &CopiedContent::BytesOf(&missing_source),
            &target.path().join("Plan.md"),
            Placement::UnderFreeName,
        );

        assert_eq!(result, Err(DocumentError::NotFound));
        assert!(names_in(target.path()).is_empty());
    }

    #[test]
    fn without_hard_links_the_copy_goes_into_a_file_made_only_if_new() {
        let target = folder_with(&[("pending", b"bytes"), ("Taken.md", b"mine")]);
        let pending = target.path().join("pending");

        let is_placed = write_into_new_file(&pending, &target.path().join("Plan.md")).unwrap();
        let is_taken_placed =
            write_into_new_file(&pending, &target.path().join("Taken.md")).unwrap();

        assert!(is_placed);
        assert!(!is_taken_placed);
        assert_eq!(fs::read(target.path().join("Plan.md")).unwrap(), b"bytes");
        assert_eq!(fs::read(target.path().join("Taken.md")).unwrap(), b"mine");
    }

    #[test]
    fn names_a_clash_after_its_stem() {
        let path = Path::new("Plan.md");

        assert_eq!(imported_name(path, 1), "Plan (imported).md");
        assert_eq!(imported_name(path, 3), "Plan (imported 3).md");
        assert_eq!(imported_name(Path::new("LICENSE"), 1), "LICENSE (imported)");
    }
}
