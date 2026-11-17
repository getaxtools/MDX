use std::fs::{self, DirEntry, Metadata};
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::scan_pattern::{PatternState, ScanPattern};
use crate::documents::{
    DocumentAccessList, DocumentError, DocumentLocation, decode_document_bytes, locate_document,
    location_of_resolved_path, modified_at_ms,
};

pub const MAX_SCANNED_FILES: usize = 5_000;
pub const MAX_SCAN_DEPTH: usize = 12;
const MAX_SCANNED_FOLDERS: usize = 10_000;
const MAX_CONFIGURATION_FILE_BYTES: u64 = 64 * 1024;
const MAX_CONFIGURATION_TEXT_BYTES: usize = 4 * 1024 * 1024;
const CONFIGURATION_EXTENSIONS: [&str; 3] = ["yaml", "yml", "json"];
/// Build output, package and environment folders: never part of a spec project, often huge and busy.
const NEVER_ENTERED_FOLDERS: [&str; 7] = [
    "node_modules",
    ".git",
    "target",
    "dist",
    "venv",
    ".venv",
    "__pycache__",
];
const GIT_FOLDER: &str = ".git";
const GIT_HEAD_FILE: &str = "HEAD";

/// Where spec, plan and decision documents live in the layouts the spec viewer reads.
pub const SPEC_LOCATIONS: [&str; 10] = [
    "openspec/**",
    ".openspec-store/**",
    ".specify/**",
    "specs/**",
    ".kiro/specs/**",
    ".kiro/steering/**",
    "docs/decisions/**",
    "docs/adr/**",
    "doc/adr/**",
    "adr/**",
];

/// What a scan found below a project root; paths are relative to the root with `/` between parts.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecProjectManifest {
    pub root: DocumentLocation,
    /// The folders inside spec locations, so an empty `specs` folder still counts.
    pub folders: Vec<String>,
    pub files: Vec<ManifestFile>,
    pub links: Vec<ManifestLink>,
    /// True when a limit stopped the scan, so the project was only partly read.
    pub is_incomplete: bool,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestFile {
    pub path: String,
    pub size_bytes: u64,
    pub modified_at_ms: u64,
    /// The text of a small YAML or JSON file, so configuration is read without one call per file.
    pub text: Option<String>,
}

/// A linked folder or file; it is followed only when its target is in a folder the user granted.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestLink {
    pub path: String,
    pub is_followed: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct ScanLimits {
    pub max_files: usize,
    pub max_depth: usize,
    pub max_folders: usize,
}

impl ScanLimits {
    pub const DEFAULT: Self = Self {
        max_files: MAX_SCANNED_FILES,
        max_depth: MAX_SCAN_DEPTH,
        max_folders: MAX_SCANNED_FOLDERS,
    };
}

/// Scans the spec locations and `additional_locations` of a granted root and of its direct subfolders.
pub fn scan_granted_project(
    root: &Path,
    additional_locations: &[ScanPattern],
    access: &DocumentAccessList,
) -> Result<SpecProjectManifest, DocumentError> {
    scan_granted_project_within(root, additional_locations, access, ScanLimits::DEFAULT)
}

fn scan_granted_project_within(
    root: &Path,
    additional_locations: &[ScanPattern],
    access: &DocumentAccessList,
    limits: ScanLimits,
) -> Result<SpecProjectManifest, DocumentError> {
    let root_location = locate_document(root)?;
    if !root_location.path().is_dir() {
        return Err(DocumentError::NotFound);
    }
    if !access.is_folder_allowed(&root_location) {
        return Err(DocumentError::AccessDenied);
    }
    let patterns = project_patterns(additional_locations);
    let start: Vec<PatternState<'_>> = patterns.iter().map(ScanPattern::start).collect();
    let mut scan = ProjectScan::new(access, limits);
    scan.walk(&ScanPlace::root(root_location.path()), &start);
    scan.add_git_head(&root_location.path());
    Ok(SpecProjectManifest {
        root: root_location,
        folders: scan.folders,
        files: scan.files,
        links: scan.links,
        is_incomplete: scan.is_incomplete,
    })
}

fn project_patterns(additional_locations: &[ScanPattern]) -> Vec<ScanPattern> {
    let at_root: Vec<ScanPattern> = SPEC_LOCATIONS
        .iter()
        .filter_map(|location| ScanPattern::parse(location).ok())
        .chain(additional_locations.iter().cloned())
        .collect();
    let in_subfolders: Vec<ScanPattern> =
        at_root.iter().map(ScanPattern::in_each_subfolder).collect();
    at_root.into_iter().chain(in_subfolders).collect()
}

/// A folder or file the walk reached, with its path relative to the root and its folder depth.
struct ScanPlace {
    path: PathBuf,
    relative: String,
    depth: usize,
}

impl ScanPlace {
    fn root(path: PathBuf) -> Self {
        Self {
            path,
            relative: String::new(),
            depth: 0,
        }
    }

    fn child(&self, entry: &DirEntry) -> Self {
        let name = entry.file_name().to_string_lossy().into_owned();
        let relative = if self.relative.is_empty() {
            name
        } else {
            format!("{}/{name}", self.relative)
        };
        Self {
            path: entry.path(),
            relative,
            depth: self.depth + 1,
        }
    }
}

struct ProjectScan<'access> {
    access: &'access DocumentAccessList,
    limits: ScanLimits,
    folders_left: usize,
    configuration_bytes_left: usize,
    folders: Vec<String>,
    files: Vec<ManifestFile>,
    links: Vec<ManifestLink>,
    is_incomplete: bool,
}

impl<'access> ProjectScan<'access> {
    fn new(access: &'access DocumentAccessList, limits: ScanLimits) -> Self {
        Self {
            access,
            limits,
            folders_left: limits.max_folders,
            configuration_bytes_left: MAX_CONFIGURATION_TEXT_BYTES,
            folders: Vec::new(),
            files: Vec::new(),
            links: Vec::new(),
            is_incomplete: false,
        }
    }

    /// Visits a folder's entries in name order, depth first.
    fn walk(&mut self, folder: &ScanPlace, states: &[PatternState<'_>]) {
        if self.folders_left == 0 {
            self.is_incomplete = true;
            return;
        }
        self.folders_left -= 1;
        for entry in sorted_entries(&folder.path) {
            if self.files.len() >= self.limits.max_files {
                self.is_incomplete = true;
                return;
            }
            self.visit_entry(&entry, folder.child(&entry), states);
        }
    }

    fn visit_entry(&mut self, entry: &DirEntry, place: ScanPlace, states: &[PatternState<'_>]) {
        let Ok(file_type) = entry.file_type() else {
            return;
        };
        if file_type.is_symlink() {
            self.visit_link(&place, states);
        } else if file_type.is_dir() {
            self.visit_folder(&place, states);
        } else if file_type.is_file()
            && matches_file(states, &file_name_of(&place.path))
            && let Ok(metadata) = entry.metadata()
        {
            self.add_file(&place.path, place.relative, &metadata);
        }
    }

    fn visit_folder(&mut self, folder: &ScanPlace, states: &[PatternState<'_>]) {
        let next_states = states_inside(&folder.path, states);
        if next_states.is_empty() {
            return;
        }
        if folder.depth > self.limits.max_depth {
            self.is_incomplete = true;
            return;
        }
        if next_states.iter().any(PatternState::is_whole_tree) {
            self.folders.push(folder.relative.clone());
        }
        self.walk(folder, &next_states);
    }

    /// Follows a link only into a granted folder; any other link is listed for the user to confirm.
    fn visit_link(&mut self, link: &ScanPlace, states: &[PatternState<'_>]) {
        let Ok(target) = dunce::canonicalize(&link.path) else {
            return;
        };
        let target_location = location_of_resolved_path(&target);
        if target.is_dir() {
            if states_inside(&link.path, states).is_empty() {
                return;
            }
            let is_followed = self.access.is_folder_allowed(&target_location);
            self.add_link(link, is_followed);
            if is_followed {
                self.visit_folder(link, states);
            }
        } else if matches_file(states, &file_name_of(&link.path)) {
            let is_followed = self.access.is_allowed(&target_location);
            self.add_link(link, is_followed);
            if let (true, Ok(metadata)) = (is_followed, fs::metadata(&target)) {
                self.add_file(&target, link.relative.clone(), &metadata);
            }
        }
    }

    fn add_link(&mut self, link: &ScanPlace, is_followed: bool) {
        self.links.push(ManifestLink {
            path: link.relative.clone(),
            is_followed,
        });
    }

    /// The branch a feature-numbered project is on, read from a plain `.git` folder of the root.
    /// A worktree's `.git` file points elsewhere and is not followed.
    fn add_git_head(&mut self, root: &Path) {
        let git = root.join(GIT_FOLDER);
        let is_git_folder = fs::symlink_metadata(&git).is_ok_and(|metadata| metadata.is_dir());
        let head = git.join(GIT_HEAD_FILE);
        let Ok(metadata) = fs::symlink_metadata(&head) else {
            return;
        };
        if !is_git_folder || !metadata.is_file() || metadata.len() > MAX_CONFIGURATION_FILE_BYTES {
            return;
        }
        let Ok(bytes) = fs::read(&head) else {
            return;
        };
        self.files.push(ManifestFile {
            path: format!("{GIT_FOLDER}/{GIT_HEAD_FILE}"),
            size_bytes: metadata.len(),
            modified_at_ms: modified_at_ms(&metadata),
            text: Some(decode_document_bytes(&bytes).text),
        });
    }

    fn add_file(&mut self, path: &Path, relative: String, metadata: &Metadata) {
        let text = self.configuration_text(path, metadata);
        self.files.push(ManifestFile {
            path: relative,
            size_bytes: metadata.len(),
            modified_at_ms: modified_at_ms(metadata),
            text,
        });
    }

    fn configuration_text(&mut self, path: &Path, metadata: &Metadata) -> Option<String> {
        let is_configuration = path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                CONFIGURATION_EXTENSIONS.contains(&extension.to_lowercase().as_str())
            });
        let size = usize::try_from(metadata.len()).ok()?;
        if !is_configuration
            || metadata.len() > MAX_CONFIGURATION_FILE_BYTES
            || size > self.configuration_bytes_left
        {
            return None;
        }
        let bytes = fs::read(path).ok()?;
        self.configuration_bytes_left -= size;
        Some(decode_document_bytes(&bytes).text)
    }
}

fn states_inside<'pattern>(
    folder: &Path,
    states: &[PatternState<'pattern>],
) -> Vec<PatternState<'pattern>> {
    let name = file_name_of(folder);
    if is_never_entered(&name) {
        return Vec::new();
    }
    let mut next_states: Vec<PatternState<'pattern>> = Vec::new();
    for state in states.iter().flat_map(|state| state.enter_folder(&name)) {
        if !next_states.contains(&state) {
            next_states.push(state);
        }
    }
    next_states
}

fn matches_file(states: &[PatternState<'_>], file_name: &str) -> bool {
    states.iter().any(|state| state.matches_file(file_name))
}

fn sorted_entries(folder: &Path) -> Vec<DirEntry> {
    let Ok(entries) = fs::read_dir(folder) else {
        return Vec::new();
    };
    let mut entries: Vec<DirEntry> = entries.filter_map(Result::ok).collect();
    entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_lowercase());
    entries
}

fn is_never_entered(folder_name: &str) -> bool {
    NEVER_ENTERED_FOLDERS
        .iter()
        .any(|skipped| skipped.eq_ignore_ascii_case(folder_name))
}

/// What a changed path is now: a path that is gone may have been a file or a folder.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangedEntry {
    File,
    Folder,
    Gone,
}

/// Whether a change to a path below a project root can change what a scan lists: a file a location
/// matches, or a folder inside a location. A folder outside the locations changes on every save below it.
pub fn may_hold_project_files(
    relative_path: &Path,
    entry: ChangedEntry,
    additional_locations: &[ScanPattern],
) -> bool {
    let names: Vec<String> = relative_path
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect();
    let Some((last, folders)) = names.split_last() else {
        return true;
    };
    let patterns = project_patterns(additional_locations);
    let mut states: Vec<PatternState<'_>> = patterns.iter().map(ScanPattern::start).collect();
    for folder in folders {
        if is_never_entered(folder) {
            return false;
        }
        states = states
            .iter()
            .flat_map(|state| state.enter_folder(folder))
            .collect();
    }
    if is_never_entered(last) {
        return false;
    }
    let is_listed_file = || states.iter().any(|state| state.matches_file(last));
    let inner_states = || states.iter().flat_map(|state| state.enter_folder(last));
    match entry {
        ChangedEntry::File => is_listed_file(),
        ChangedEntry::Folder => inner_states().any(|state| state.is_whole_tree()),
        ChangedEntry::Gone => is_listed_file() || inner_states().next().is_some(),
    }
}

fn file_name_of(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn write_files(root: &Path, files: &[&str]) {
        for file in files {
            let path = root.join(file);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, "# Text").unwrap();
        }
    }

    pub(crate) fn granted(root: &Path) -> DocumentAccessList {
        let access = DocumentAccessList::default();
        access.grant_folder(root).unwrap();
        access
    }

    /// Makes a folder link the way the platform does without extra rights: a junction on Windows.
    pub(crate) fn link_folder(link: &Path, target: &Path) {
        #[cfg(windows)]
        {
            let status = std::process::Command::new("cmd")
                .args(["/C", "mklink", "/J"])
                .arg(link)
                .arg(target)
                .output()
                .unwrap()
                .status;
            assert!(status.success());
        }
        #[cfg(not(windows))]
        std::os::unix::fs::symlink(target, link).unwrap();
    }

    fn scan(root: &Path) -> SpecProjectManifest {
        scan_granted_project(root, &[], &granted(root)).unwrap()
    }

    fn file_paths(manifest: &SpecProjectManifest) -> Vec<&str> {
        manifest
            .files
            .iter()
            .map(|file| file.path.as_str())
            .collect()
    }

    #[test]
    fn lists_spec_folders_including_hidden_ones() {
        let root = tempfile::tempdir().unwrap();
        write_files(
            root.path(),
            &[
                ".kiro/specs/checkout/requirements.md",
                ".specify/memory/constitution.md",
                "openspec/changes/add-tabs/.openspec.yaml",
                "openspec/specs/tabs/spec.md",
                "README.md",
                "src/notes.md",
            ],
        );

        let manifest = scan(root.path());

        assert_eq!(
            file_paths(&manifest),
            vec![
                ".kiro/specs/checkout/requirements.md",
                ".specify/memory/constitution.md",
                "openspec/changes/add-tabs/.openspec.yaml",
                "openspec/specs/tabs/spec.md",
            ]
        );
        assert!(!manifest.is_incomplete);
    }

    #[test]
    fn lists_spec_folders_of_direct_subfolders() {
        let root = tempfile::tempdir().unwrap();
        write_files(
            root.path(),
            &["api/openspec/specs/auth/spec.md", "api/src/deep/specs/x.md"],
        );

        let manifest = scan(root.path());

        assert_eq!(
            file_paths(&manifest),
            vec!["api/openspec/specs/auth/spec.md"]
        );
    }

    #[test]
    fn lists_empty_spec_folders() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("openspec").join("specs")).unwrap();

        let manifest = scan(root.path());

        assert_eq!(manifest.folders, vec!["openspec", "openspec/specs"]);
        assert!(manifest.files.is_empty());
    }

    #[test]
    fn lists_files_of_additional_locations() {
        let root = tempfile::tempdir().unwrap();
        write_files(
            root.path(),
            &[
                "GEMINI.md",
                "packages/api/GEMINI.md",
                ".cursor/rules/style/naming.mdc",
                ".cursor/other.md",
            ],
        );
        let additional = ["GEMINI.md", "*/*/GEMINI.md", ".cursor/rules/**/*.mdc"]
            .map(|location| ScanPattern::parse(location).unwrap());

        let manifest =
            scan_granted_project(root.path(), &additional, &granted(root.path())).unwrap();

        assert_eq!(
            file_paths(&manifest),
            vec![
                ".cursor/rules/style/naming.mdc",
                "GEMINI.md",
                "packages/api/GEMINI.md",
            ]
        );
    }

    #[test]
    fn never_enters_package_git_or_build_folders() {
        let root = tempfile::tempdir().unwrap();
        write_files(
            root.path(),
            &[
                "node_modules/openspec/specs/a/spec.md",
                "specs/.git/notes.md",
                "specs/target/report.md",
                "specs/001-albums/spec.md",
            ],
        );

        let manifest = scan(root.path());

        assert_eq!(file_paths(&manifest), vec!["specs/001-albums/spec.md"]);
    }

    #[test]
    fn records_size_and_modified_time() {
        let root = tempfile::tempdir().unwrap();
        write_files(root.path(), &["adr/0001-use-sqlite.md"]);

        let manifest = scan(root.path());

        let file = manifest.files.first().unwrap();
        assert_eq!(file.size_bytes, 6);
        assert!(file.modified_at_ms > 0);
        assert_eq!(file.text, None);
    }

    #[test]
    fn includes_the_text_of_small_configuration_files_only() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("openspec");
        fs::create_dir_all(&folder).unwrap();
        fs::write(
            folder.join("config.yaml"),
            "\u{feff}schema: spec-driven\r\n",
        )
        .unwrap();
        let oversized = "x".repeat(usize::try_from(MAX_CONFIGURATION_FILE_BYTES).unwrap() + 1);
        fs::write(folder.join("big.json"), oversized).unwrap();

        let manifest = scan(root.path());

        let texts: Vec<(&str, Option<&str>)> = manifest
            .files
            .iter()
            .map(|file| (file.path.as_str(), file.text.as_deref()))
            .collect();
        assert_eq!(
            texts,
            vec![
                ("openspec/big.json", None),
                ("openspec/config.yaml", Some("schema: spec-driven\r\n")),
            ]
        );
    }

    #[test]
    fn stops_at_the_file_limit_and_says_the_scan_is_incomplete() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("specs");
        fs::create_dir(&folder).unwrap();
        for index in 0..=MAX_SCANNED_FILES {
            fs::write(folder.join(format!("{index:05}.md")), "").unwrap();
        }

        let manifest = scan(root.path());

        assert_eq!(manifest.files.len(), MAX_SCANNED_FILES);
        assert!(manifest.is_incomplete);
    }

    #[test]
    fn stops_below_twelve_folder_levels_and_says_the_scan_is_incomplete() {
        let root = tempfile::tempdir().unwrap();
        let deep: PathBuf = std::iter::once("specs")
            .chain(std::iter::repeat_n("level", MAX_SCAN_DEPTH))
            .collect();
        write_files(root.path(), &["specs/top.md"]);
        write_files(&root.path().join(&deep), &["too-deep.md"]);
        write_files(&root.path().join(deep.parent().unwrap()), &["deepest.md"]);

        let manifest = scan(root.path());

        let paths = file_paths(&manifest);
        assert!(paths.contains(&"specs/top.md"));
        assert!(paths.iter().any(|path| path.ends_with("/deepest.md")));
        assert!(!paths.iter().any(|path| path.ends_with("/too-deep.md")));
        assert!(manifest.is_incomplete);
    }

    #[test]
    fn stops_after_the_folder_limit() {
        let root = tempfile::tempdir().unwrap();
        write_files(root.path(), &["specs/a/one.md", "specs/b/two.md"]);
        let limits = ScanLimits {
            max_folders: 2,
            ..ScanLimits::DEFAULT
        };

        let manifest =
            scan_granted_project_within(root.path(), &[], &granted(root.path()), limits).unwrap();

        assert_eq!(file_paths(&manifest), Vec::<&str>::new());
        assert!(manifest.is_incomplete);
    }

    #[test]
    fn refuses_a_root_the_user_has_not_chosen() {
        let root = tempfile::tempdir().unwrap();
        write_files(root.path(), &["specs/001-a/spec.md"]);

        let result = scan_granted_project(root.path(), &[], &DocumentAccessList::default());

        assert!(matches!(result, Err(DocumentError::AccessDenied)));
    }

    #[test]
    fn lists_a_link_to_an_ungranted_folder_without_reading_through_it() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        write_files(outside.path(), &["specs/secret/spec.md"]);
        link_folder(&root.path().join("openspec"), outside.path());

        let manifest = scan(root.path());

        assert_eq!(
            manifest.links,
            vec![ManifestLink {
                path: "openspec".to_owned(),
                is_followed: false
            }]
        );
        assert!(manifest.files.is_empty());
        assert!(manifest.folders.is_empty());
    }

    #[test]
    fn follows_a_link_to_a_granted_folder() {
        let root = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        write_files(other.path(), &["specs/tabs/spec.md"]);
        link_folder(&root.path().join("openspec"), other.path());
        let access = granted(root.path());
        access.grant_folder(other.path()).unwrap();

        let manifest = scan_granted_project(root.path(), &[], &access).unwrap();

        assert_eq!(
            manifest.links,
            vec![ManifestLink {
                path: "openspec".to_owned(),
                is_followed: true
            }]
        );
        assert_eq!(file_paths(&manifest), vec!["openspec/specs/tabs/spec.md"]);
    }

    #[test]
    fn reads_the_branch_from_the_git_folder_of_the_root() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join(".git")).unwrap();
        fs::write(
            root.path().join(".git").join("HEAD"),
            "ref: refs/heads/002-sharing\n",
        )
        .unwrap();

        let manifest = scan(root.path());

        let head = manifest
            .files
            .iter()
            .find(|file| file.path == ".git/HEAD")
            .unwrap();
        assert_eq!(head.text.as_deref(), Some("ref: refs/heads/002-sharing\n"));
    }

    #[test]
    fn ignores_the_git_file_of_a_worktree() {
        let root = tempfile::tempdir().unwrap();
        fs::write(
            root.path().join(".git"),
            "gitdir: C:/elsewhere/.git/worktrees/a\n",
        )
        .unwrap();

        let manifest = scan(root.path());

        assert!(manifest.files.is_empty());
    }

    #[test]
    fn every_spec_location_is_a_valid_pattern() {
        for location in SPEC_LOCATIONS {
            assert!(ScanPattern::parse(location).is_ok(), "{location}");
        }
    }
}
