use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::move_journal::{
    FileState, JournalFile, is_same_or_inside, nanoseconds_of, relative_path_of,
};
use super::{ListedProblem, MoveError, MoveFileSystem};
use crate::notes_location::is_refused_place;

/// Windows paths stop at 32,767 UTF-16 units; the rest is room for the long-path prefix.
pub const MAX_TARGET_PATH_UNITS: usize = 32_000;
/// Every copy is written under a pending name first, which the path must also fit. Only the move
/// uses this name, so a leftover from an interrupted move is never taken for a note.
pub const PENDING_SUFFIX: &str = ".mdx-moving";
/// A file name stops at 255 UTF-16 units, and the pending name must fit too.
const MAX_NAME_UNITS: usize = 255;
/// The copy may need a little more room than the files themselves, for folders and the file table.
const FREE_SPACE_MARGIN_DIVISOR: u64 = 10;

/// Every file and folder below a notes folder, read from metadata alone, so an online-only file
/// is counted without being downloaded.
#[derive(Debug, Default)]
pub struct SourceTree {
    pub files: Vec<JournalFile>,
    pub folders: Vec<String>,
    pub links: Vec<String>,
    pub online_only_count: usize,
    pub online_only_bytes: u64,
}

#[derive(Debug)]
pub struct MovePlan {
    pub files: Vec<JournalFile>,
    pub folders: Vec<String>,
    pub online_only_count: usize,
    pub online_only_bytes: u64,
    pub required_bytes: u64,
    pub available_bytes: u64,
    pub is_target_new: bool,
}

/// What the window shows before the user starts the move.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovePlanSummary {
    pub file_count: usize,
    pub total_bytes: u64,
    /// The total and a margin of 10 percent, which the new folder's drive must have free.
    pub required_bytes: u64,
    pub online_only_count: usize,
    pub online_only_bytes: u64,
    pub available_bytes: u64,
}

impl MovePlan {
    pub fn summary(&self) -> MovePlanSummary {
        MovePlanSummary {
            file_count: self.files.len(),
            total_bytes: self.files.iter().map(|file| file.size).sum(),
            required_bytes: self.required_bytes,
            online_only_count: self.online_only_count,
            online_only_bytes: self.online_only_bytes,
            available_bytes: self.available_bytes,
        }
    }
}

/// Where a plan may copy to, and the longest path it accepts there.
pub struct MoveTarget<'a> {
    pub target: &'a Path,
    pub user_folder: Option<&'a Path>,
    pub max_path_units: usize,
}

/// Lists the notes folder and checks the new folder before anything is copied. Both paths must
/// come from `canonical_folder`.
pub fn plan_move(
    source: &Path,
    target: &MoveTarget,
    file_system: &dyn MoveFileSystem,
) -> Result<MovePlan, MoveError> {
    check_target_place(source, target)?;
    let is_target_new = check_target_is_empty(target.target)?;
    let tree = list_source_tree(source, file_system)?;
    if !tree.links.is_empty() {
        return Err(MoveError::listing(ListedProblem::Links, tree.links));
    }
    let too_long = paths_too_long(&tree.files, target);
    if !too_long.is_empty() {
        return Err(MoveError::listing(ListedProblem::LongPaths, too_long));
    }
    let total_bytes: u64 = tree.files.iter().map(|file| file.size).sum();
    let required_bytes =
        total_bytes.saturating_add(total_bytes.div_ceil(FREE_SPACE_MARGIN_DIVISOR));
    let available_bytes = file_system
        .available_bytes(target.target)
        .map_err(|_| MoveError::FreeSpaceUnknown)?;
    if available_bytes < required_bytes {
        return Err(MoveError::NotEnoughSpace {
            required_bytes,
            available_bytes,
        });
    }
    Ok(MovePlan {
        files: tree.files,
        folders: tree.folders,
        online_only_count: tree.online_only_count,
        online_only_bytes: tree.online_only_bytes,
        required_bytes,
        available_bytes,
        is_target_new,
    })
}

fn check_target_place(source: &Path, target: &MoveTarget) -> Result<(), MoveError> {
    if is_same_or_inside(target.target, source) {
        return Err(MoveError::TargetInsideLocation);
    }
    if is_same_or_inside(source, target.target) {
        return Err(MoveError::TargetContainsLocation);
    }
    if is_refused_place(target.target, target.user_folder) {
        return Err(MoveError::TargetRefused);
    }
    Ok(())
}

/// True when the folder does not exist yet; any entry at all, hidden ones too, refuses it.
pub fn check_target_is_empty(target: &Path) -> Result<bool, MoveError> {
    match fs::symlink_metadata(target) {
        Err(_) => Ok(true),
        Ok(metadata) if !metadata.is_dir() => Err(MoveError::TargetNotEmpty),
        Ok(_) => {
            let mut entries =
                fs::read_dir(target).map_err(|error| MoveError::writing(&error, ""))?;
            if entries.next().is_some() {
                Err(MoveError::TargetNotEmpty)
            } else {
                Ok(false)
            }
        }
    }
}

/// Links are listed, never followed, so nothing from outside the notes folder is copied.
pub fn list_source_tree(
    source: &Path,
    file_system: &dyn MoveFileSystem,
) -> Result<SourceTree, MoveError> {
    let mut tree = SourceTree::default();
    let mut folders = vec![source.to_path_buf()];
    while let Some(folder) = folders.pop() {
        let relative = relative_path_of(source, &folder).unwrap_or_default();
        let entries =
            fs::read_dir(&folder).map_err(|error| MoveError::reading(&error, &relative))?;
        for entry in entries {
            let entry = entry.map_err(|error| MoveError::reading(&error, &relative))?;
            if let Some(subfolder) = add_entry(&mut tree, source, &entry, file_system)? {
                folders.push(subfolder);
            }
        }
    }
    tree.folders.sort();
    tree.files
        .sort_by(|first, second| first.path.cmp(&second.path));
    Ok(tree)
}

/// Adds one entry to the tree and returns it when it is a folder to look into.
fn add_entry(
    tree: &mut SourceTree,
    source: &Path,
    entry: &fs::DirEntry,
    file_system: &dyn MoveFileSystem,
) -> Result<Option<PathBuf>, MoveError> {
    let path = entry.path();
    let relative = relative_path_of(source, &path).ok_or_else(|| MoveError::SourceUnreadable {
        path: path.to_string_lossy().into_owned(),
    })?;
    if relative.ends_with(PENDING_SUFFIX) {
        return Ok(None);
    }
    let file_type = entry
        .file_type()
        .map_err(|error| MoveError::reading(&error, &relative))?;
    if file_type.is_symlink() {
        tree.links.push(relative);
        return Ok(None);
    }
    if file_type.is_dir() {
        tree.folders.push(relative);
        return Ok(Some(path));
    }
    let metadata = entry
        .metadata()
        .map_err(|error| MoveError::reading(&error, &relative))?;
    if file_system.is_online_only(&path, &metadata) {
        tree.online_only_count += 1;
        tree.online_only_bytes += metadata.len();
    }
    tree.files.push(JournalFile {
        path: relative,
        size: metadata.len(),
        modified_ns: metadata.modified().map(nanoseconds_of).unwrap_or_default(),
        target_modified_ns: None,
        sha256: None,
        state: FileState::Pending,
    });
    Ok(None)
}

fn paths_too_long(files: &[JournalFile], target: &MoveTarget) -> Vec<String> {
    let target_units = target.target.to_string_lossy().encode_utf16().count();
    files
        .iter()
        .filter(|file| {
            let units = target_units + 1 + file.path.encode_utf16().count() + PENDING_SUFFIX.len();
            let name_units = file
                .path
                .rsplit('/')
                .next()
                .unwrap_or_default()
                .encode_utf16()
                .count();
            units > target.max_path_units || name_units + PENDING_SUFFIX.len() > MAX_NAME_UNITS
        })
        .map(|file| file.path.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use std::fs::{File, Metadata};
    use std::io;

    use super::*;

    struct FakeDisk {
        available_bytes: u64,
        online_only_names: Vec<&'static str>,
    }

    impl MoveFileSystem for FakeDisk {
        fn available_bytes(&self, _folder: &Path) -> io::Result<u64> {
            Ok(self.available_bytes)
        }

        fn is_online_only(&self, path: &Path, _metadata: &Metadata) -> bool {
            path.file_name()
                .is_some_and(|name| self.online_only_names.iter().any(|online| name == *online))
        }

        fn create_copy(&self, pending: &Path) -> io::Result<File> {
            File::create(pending)
        }
    }

    fn plenty_of_space() -> FakeDisk {
        FakeDisk {
            available_bytes: u64::MAX,
            online_only_names: Vec::new(),
        }
    }

    fn notes_folder() -> tempfile::TempDir {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("Plan.md"), "# Plan").unwrap();
        fs::create_dir_all(folder.path().join("Projects").join("Empty")).unwrap();
        fs::write(folder.path().join("Projects").join("Ideas.md"), "# Ideas").unwrap();
        fs::create_dir(folder.path().join(".mdx-notes")).unwrap();
        fs::write(
            folder.path().join(".mdx-notes").join("notes-location.json"),
            "{}",
        )
        .unwrap();
        folder
    }

    fn target_at(target: &Path) -> MoveTarget<'_> {
        MoveTarget {
            target,
            user_folder: None,
            max_path_units: MAX_TARGET_PATH_UNITS,
        }
    }

    #[test]
    fn lists_every_file_and_folder_with_the_app_folder() {
        let source = notes_folder();
        let place = tempfile::tempdir().unwrap();
        let target = place.path().join("New Notes");

        let plan = plan_move(source.path(), &target_at(&target), &plenty_of_space()).unwrap();

        let paths: Vec<&str> = plan.files.iter().map(|file| file.path.as_str()).collect();
        assert_eq!(
            paths,
            [
                ".mdx-notes/notes-location.json",
                "Plan.md",
                "Projects/Ideas.md"
            ]
        );
        assert_eq!(plan.folders, [".mdx-notes", "Projects", "Projects/Empty"]);
        assert_eq!(plan.summary().total_bytes, 2 + 6 + 7);
        assert!(plan.is_target_new);
    }

    #[test]
    fn a_non_empty_target_is_refused() {
        let source = notes_folder();
        let target = tempfile::tempdir().unwrap();
        fs::write(target.path().join(".hidden"), "").unwrap();

        let refusal = plan_move(source.path(), &target_at(target.path()), &plenty_of_space());

        assert_eq!(refusal.unwrap_err(), MoveError::TargetNotEmpty);
    }

    #[test]
    fn an_empty_existing_target_is_accepted() {
        let source = notes_folder();
        let target = tempfile::tempdir().unwrap();

        let plan = plan_move(source.path(), &target_at(target.path()), &plenty_of_space()).unwrap();

        assert!(!plan.is_target_new);
    }

    #[test]
    fn a_target_inside_or_around_the_location_is_refused() {
        let source = notes_folder();
        let inside = source.path().join("Copy");
        let around = source.path().parent().unwrap().to_path_buf();

        let disk = plenty_of_space();
        assert_eq!(
            plan_move(source.path(), &target_at(&inside), &disk).unwrap_err(),
            MoveError::TargetInsideLocation
        );
        assert_eq!(
            plan_move(source.path(), &target_at(&around), &disk).unwrap_err(),
            MoveError::TargetContainsLocation
        );
        assert_eq!(
            plan_move(source.path(), &target_at(source.path()), &disk).unwrap_err(),
            MoveError::TargetInsideLocation
        );
    }

    #[test]
    fn too_little_free_space_is_refused_with_both_sizes() {
        let source = notes_folder();
        let place = tempfile::tempdir().unwrap();
        let disk = FakeDisk {
            available_bytes: 10,
            online_only_names: Vec::new(),
        };

        let refusal = plan_move(source.path(), &target_at(&place.path().join("N")), &disk);

        assert_eq!(
            refusal.unwrap_err(),
            MoveError::NotEnoughSpace {
                required_bytes: 15 + 2,
                available_bytes: 10
            }
        );
    }

    #[test]
    fn online_only_files_are_counted_without_downloading() {
        let source = notes_folder();
        let place = tempfile::tempdir().unwrap();
        let disk = FakeDisk {
            available_bytes: u64::MAX,
            online_only_names: vec!["Ideas.md"],
        };

        let plan = plan_move(source.path(), &target_at(&place.path().join("N")), &disk).unwrap();

        assert_eq!((plan.online_only_count, plan.online_only_bytes), (1, 7));
        assert!(plan.files.iter().all(|file| file.sha256.is_none()));
    }

    #[test]
    fn long_paths_over_the_limit_are_listed() {
        let source = notes_folder();
        let place = tempfile::tempdir().unwrap();
        let target = place.path().join("N");
        let short_enough = target.to_string_lossy().encode_utf16().count() + 1 + 7 + 11;
        let limit = MoveTarget {
            max_path_units: short_enough,
            ..target_at(&target)
        };

        let refusal = plan_move(source.path(), &limit, &plenty_of_space()).unwrap_err();

        assert_eq!(
            refusal,
            MoveError::PathsTooLong {
                paths: vec![
                    ".mdx-notes/notes-location.json".to_owned(),
                    "Projects/Ideas.md".to_owned()
                ],
                count: 2
            }
        );
    }

    #[test]
    fn a_name_too_long_for_its_pending_copy_is_listed() {
        let source = notes_folder();
        let long_name = format!("{}.md", "n".repeat(250));
        fs::write(source.path().join(&long_name), "# Long").unwrap();
        let place = tempfile::tempdir().unwrap();

        let refusal = plan_move(
            source.path(),
            &target_at(&place.path().join("N")),
            &plenty_of_space(),
        );

        assert_eq!(
            refusal.unwrap_err(),
            MoveError::PathsTooLong {
                paths: vec![long_name],
                count: 1
            }
        );
    }

    #[cfg(windows)]
    #[test]
    fn links_inside_the_location_are_listed_and_not_followed() {
        let source = notes_folder();
        let outside = tempfile::tempdir().unwrap();
        let created = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(source.path().join("Elsewhere"))
            .arg(outside.path())
            .output()
            .unwrap();
        assert!(created.status.success());
        let place = tempfile::tempdir().unwrap();

        let refusal = plan_move(
            source.path(),
            &target_at(&place.path().join("N")),
            &plenty_of_space(),
        );

        assert_eq!(
            refusal.unwrap_err(),
            MoveError::LinksInside {
                paths: vec!["Elsewhere".to_owned()],
                count: 1
            }
        );
    }

    #[test]
    fn a_drive_root_is_refused_as_a_target() {
        let source = notes_folder();

        let refusal = plan_move(
            source.path(),
            &target_at(Path::new(r"Q:\")),
            &plenty_of_space(),
        );

        assert_eq!(refusal.unwrap_err(), MoveError::TargetRefused);
    }
}
