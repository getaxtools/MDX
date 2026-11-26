use std::fs::{self, DirEntry};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use crate::documents::DocumentError;

/// A walk stops past this many files, so a mistaken pick such as a whole drive cannot run for hours.
pub const MAX_WALKED_FILES: usize = 100_000;

/// A file found under a folder, with its path relative to that folder and `/` between the parts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WalkedFile {
    pub path: PathBuf,
    pub relative: String,
}

#[derive(Debug, Default)]
pub struct FolderWalk {
    pub files: Vec<WalkedFile>,
    /// Dot entries, hidden entries and links, which are never followed or copied.
    pub skipped_entries: usize,
    /// Folders below the walked one that could not be listed, relative to it; the walk goes on without them.
    pub unreadable_folders: Vec<String>,
    /// The walk was stopped before it listed everything.
    pub was_stopped: bool,
}

/// Lets a long walk be stopped and tell how far it is.
pub struct WalkControl<'control> {
    pub stop: &'control AtomicBool,
    /// Called with the number of files found so far, once per folder listed.
    pub on_listed: &'control mut dyn FnMut(usize),
}

/// Every file under the folder, in a stable order, without entering dot folders, hidden entries or
/// links: symbolic links, junctions and mount points all count as links. Cloud files that are only
/// placeholders, such as OneDrive's, are ordinary files here.
pub fn walk_folder(folder: &Path) -> Result<FolderWalk, DocumentError> {
    let stop = AtomicBool::new(false);
    let mut on_listed = |_: usize| {};
    walk_folder_with(
        folder,
        &mut WalkControl {
            stop: &stop,
            on_listed: &mut on_listed,
        },
    )
}

pub fn walk_folder_with(
    folder: &Path,
    control: &mut WalkControl<'_>,
) -> Result<FolderWalk, DocumentError> {
    let mut walk = FolderWalk::default();
    let mut pending: Vec<(PathBuf, String)> = vec![(folder.to_path_buf(), String::new())];
    while let Some((current, prefix)) = pending.pop() {
        if control.stop.load(Ordering::Relaxed) {
            walk.was_stopped = true;
            break;
        }
        let entries = match sorted_entries(&current) {
            Ok(entries) => entries,
            Err(error) if prefix.is_empty() => return Err(error.into()),
            Err(_) => {
                walk.unreadable_folders.push(prefix);
                continue;
            }
        };
        for entry in entries.into_iter().rev() {
            take_entry(&mut walk, &mut pending, entry, &prefix)?;
        }
        (control.on_listed)(walk.files.len());
    }
    walk.files
        .sort_by(|first, second| first.relative.cmp(&second.relative));
    Ok(walk)
}

fn sorted_entries(folder: &Path) -> std::io::Result<Vec<DirEntry>> {
    let mut entries: Vec<DirEntry> = fs::read_dir(folder)?.collect::<Result<_, _>>()?;
    entries.sort_by_key(DirEntry::file_name);
    Ok(entries)
}

fn take_entry(
    walk: &mut FolderWalk,
    pending: &mut Vec<(PathBuf, String)>,
    entry: DirEntry,
    prefix: &str,
) -> Result<(), DocumentError> {
    let Ok(kind) = entry.file_type() else {
        walk.skipped_entries += 1;
        return Ok(());
    };
    if kind.is_symlink() || crate::commands::folders::is_hidden(&entry) {
        walk.skipped_entries += 1;
        return Ok(());
    }
    let name = entry.file_name().to_string_lossy().into_owned();
    let relative = if prefix.is_empty() {
        name
    } else {
        format!("{prefix}/{name}")
    };
    if kind.is_dir() {
        pending.push((entry.path(), relative));
        return Ok(());
    }
    walk.files.push(WalkedFile {
        path: entry.path(),
        relative,
    });
    if walk.files.len() > MAX_WALKED_FILES {
        return Err(DocumentError::TooLarge);
    }
    Ok(())
}

/// Whether one folder is the other or inside it, comparing canonical paths without regard to case.
pub fn is_same_or_inside(path: &Path, folder: &Path) -> bool {
    let path = path.to_string_lossy().to_lowercase();
    let folder = folder.to_string_lossy().to_lowercase();
    let folder = folder.trim_end_matches(['\\', '/']);
    path == folder
        || path
            .strip_prefix(folder)
            .is_some_and(|rest| rest.starts_with(['\\', '/']))
}

/// The canonical path of a path that may not exist yet: its nearest existing ancestor resolved, with the
/// missing parts added, so a junction anywhere above it is seen through.
pub fn canonical_even_if_missing(path: &Path) -> Result<PathBuf, DocumentError> {
    let mut missing: Vec<&std::ffi::OsStr> = Vec::new();
    let mut existing = path;
    loop {
        if let Ok(canonical) = dunce::canonicalize(existing) {
            return Ok(missing
                .iter()
                .rev()
                .fold(canonical, |path, part| path.join(part)));
        }
        missing.push(existing.file_name().ok_or(DocumentError::InvalidRequest)?);
        existing = existing.parent().ok_or(DocumentError::InvalidRequest)?;
    }
}

/// Makes a junction for tests, the link kind ordinary users can make without extra rights.
#[cfg(all(test, windows))]
pub fn make_junction(link: &Path, target: &Path) -> std::io::Result<bool> {
    std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .stdout(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_files_in_folders_and_skips_dot_entries() {
        let folder = tempfile::tempdir().unwrap();
        fs::create_dir_all(folder.path().join("Projects/2026")).unwrap();
        fs::create_dir_all(folder.path().join(".app-settings")).unwrap();
        fs::write(folder.path().join("Plan.md"), "a").unwrap();
        fs::write(folder.path().join("Projects/2026/Goals.md"), "b").unwrap();
        fs::write(folder.path().join("Projects/chart.png"), "c").unwrap();
        fs::write(folder.path().join(".app-settings/app.json"), "{}").unwrap();
        fs::write(folder.path().join(".hidden.md"), "d").unwrap();

        let walk = walk_folder(folder.path()).unwrap();

        let relative: Vec<&str> = walk
            .files
            .iter()
            .map(|file| file.relative.as_str())
            .collect();
        assert_eq!(
            relative,
            vec!["Plan.md", "Projects/2026/Goals.md", "Projects/chart.png"]
        );
        assert_eq!(walk.skipped_entries, 2);
    }

    #[cfg(windows)]
    #[test]
    fn a_junction_is_skipped_and_not_entered_while_a_plain_file_is_listed() {
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("Secret.md"), "outside").unwrap();
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("Plan.md"), "a").unwrap();
        assert!(make_junction(&folder.path().join("Linked"), outside.path()).unwrap());

        let walk = walk_folder(folder.path()).unwrap();

        let relative: Vec<&str> = walk
            .files
            .iter()
            .map(|file| file.relative.as_str())
            .collect();
        assert_eq!(relative, vec!["Plan.md"]);
        assert_eq!(walk.skipped_entries, 1);
    }

    #[test]
    fn a_stopped_walk_says_so_and_progress_follows_each_folder() {
        let folder = tempfile::tempdir().unwrap();
        fs::create_dir_all(folder.path().join("A")).unwrap();
        fs::write(folder.path().join("A/One.md"), "1").unwrap();
        fs::write(folder.path().join("Two.md"), "2").unwrap();
        let stop = AtomicBool::new(false);
        let mut counts = Vec::new();
        let mut on_listed = |count: usize| {
            counts.push(count);
            stop.store(true, Ordering::Relaxed);
        };

        let walk = walk_folder_with(
            folder.path(),
            &mut WalkControl {
                stop: &stop,
                on_listed: &mut on_listed,
            },
        )
        .unwrap();

        assert!(walk.was_stopped);
        assert_eq!(counts, vec![1]);
    }

    #[test]
    fn a_subfolder_that_cannot_be_listed_is_reported_and_the_walk_goes_on() {
        let folder = tempfile::tempdir().unwrap();
        fs::create_dir_all(folder.path().join("Gone")).unwrap();
        fs::write(folder.path().join("Plan.md"), "a").unwrap();
        let gone = folder.path().join("Gone");
        let stop = AtomicBool::new(false);
        let mut on_listed = |_: usize| {
            let _ = fs::remove_dir(&gone);
        };

        let walk = walk_folder_with(
            folder.path(),
            &mut WalkControl {
                stop: &stop,
                on_listed: &mut on_listed,
            },
        )
        .unwrap();

        assert_eq!(walk.unreadable_folders, vec!["Gone"]);
        assert_eq!(walk.files.len(), 1);
    }

    #[test]
    fn a_missing_path_is_resolved_through_its_existing_ancestor() {
        let folder = tempfile::tempdir().unwrap();
        let missing = folder.path().join("New").join("Plan.md");

        let resolved = canonical_even_if_missing(&missing).unwrap();

        assert_eq!(
            resolved,
            dunce::canonicalize(folder.path())
                .unwrap()
                .join("New")
                .join("Plan.md")
        );
    }

    #[test]
    fn tells_a_folder_inside_another_from_one_with_a_longer_name() {
        assert!(is_same_or_inside(
            Path::new(r"C:\Notes\Sub"),
            Path::new(r"C:\notes")
        ));
        assert!(is_same_or_inside(
            Path::new(r"C:\Notes"),
            Path::new(r"C:\Notes")
        ));
        assert!(!is_same_or_inside(
            Path::new(r"C:\Notes old"),
            Path::new(r"C:\Notes")
        ));
    }
}
