use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use notify::EventKind;
use notify::event::ModifyKind;

use super::debounced_watcher::{DebouncedWatcher, WHOLE_TREE};
use super::lock;
use crate::spec_projects::{ChangedEntry, ScanPattern, WatchedTree, may_hold_project_files};

pub const SPEC_PROJECTS_CHANGED_EVENT: &str = "spec-projects-changed";

/// The watched folders and the scan's extra locations, which together tell a change that matters.
#[derive(Debug, Default)]
struct WatchedProjects {
    trees: Vec<WatchedTree>,
    additional_locations: Vec<ScanPattern>,
}

impl WatchedProjects {
    /// The roots below which a changed path could change a scan; an empty path stands for a watcher
    /// error, after which anything may have changed. Each root is reported once.
    fn roots_holding(&self, changed_paths: &[PathBuf]) -> Vec<String> {
        let changes = meaningful_changes(changed_paths);
        let mut roots: Vec<String> = Vec::new();
        for tree in &self.trees {
            let is_changed = changes.iter().any(|(path, entry)| {
                path.as_os_str().is_empty()
                    || path.strip_prefix(&tree.path).is_ok_and(|below| {
                        let in_project = tree.place_in_project.join(below);
                        in_project.as_os_str().is_empty()
                            || may_hold_project_files(
                                &in_project,
                                *entry,
                                &self.additional_locations,
                            )
                    })
            });
            if is_changed && !roots.contains(&tree.root) {
                roots.push(tree.root.clone());
            }
        }
        roots
    }
}

/// Each changed path with what it is now. A folder is left out when a path below it changed in the same
/// batch: the file system reports such folders too, and the change below tells what happened.
fn meaningful_changes(changed_paths: &[PathBuf]) -> Vec<(&PathBuf, ChangedEntry)> {
    changed_paths
        .iter()
        .map(|path| (path, entry_at(path)))
        .filter(|(path, entry)| {
            *entry != ChangedEntry::Folder
                || !changed_paths
                    .iter()
                    .any(|other| other != *path && other.starts_with(path))
        })
        .collect()
}

fn entry_at(path: &std::path::Path) -> ChangedEntry {
    match fs::metadata(path) {
        Ok(metadata) if metadata.is_dir() => ChangedEntry::Folder,
        Ok(_) => ChangedEntry::File,
        Err(_) => ChangedEntry::Gone,
    }
}

/// Reports the spec project roots where a file a scan could list was added, saved, renamed or removed,
/// at any depth and through followed links. Only the roots are reported: the window scans them again.
pub struct SpecProjectWatcher {
    watched: Arc<Mutex<WatchedProjects>>,
    changes: DebouncedWatcher,
}

impl SpecProjectWatcher {
    pub fn start(on_changes: impl Fn(Vec<String>) + Send + 'static) -> Self {
        let watched = Arc::new(Mutex::new(WatchedProjects::default()));
        let delivery_watched = Arc::clone(&watched);
        let changes =
            DebouncedWatcher::start_in_mode(WHOLE_TREE, is_content_change, move |changed_paths| {
                let roots = lock(&delivery_watched).roots_holding(&changed_paths);
                if !roots.is_empty() {
                    on_changes(roots);
                }
            });
        Self { watched, changes }
    }

    pub fn watch(&self, trees: Vec<WatchedTree>, additional_locations: Vec<ScanPattern>) {
        let paths: BTreeSet<PathBuf> = trees.iter().map(|tree| tree.path.clone()).collect();
        *lock(&self.watched) = WatchedProjects {
            trees,
            additional_locations,
        };
        self.changes.watch_folders(&paths);
    }
}

/// A ticked task changes a file's contents; a new delta or a renamed change folder changes its names.
fn is_content_change(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Any
            | EventKind::Create(_)
            | EventKind::Remove(_)
            | EventKind::Modify(ModifyKind::Data(_) | ModifyKind::Name(_) | ModifyKind::Any)
    )
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
    use std::time::Duration;

    use super::*;
    use crate::documents::DocumentAccessList;
    use crate::spec_projects::{WatchedProject, watched_trees};

    const WAIT_FOR_CHANGE: Duration = Duration::from_secs(5);
    /// Longer than the quiet period and the longest batch, so a second report would have arrived.
    const WAIT_FOR_SILENCE: Duration = Duration::from_secs(3);

    fn start() -> (SpecProjectWatcher, Receiver<Vec<String>>) {
        let (sender, changes) = mpsc::channel();
        let watcher = SpecProjectWatcher::start(move |roots| {
            let _ = sender.send(roots);
        });
        (watcher, changes)
    }

    fn tree(path: &Path, place_in_project: &str) -> WatchedTree {
        WatchedTree {
            path: dunce::canonicalize(path).unwrap(),
            place_in_project: PathBuf::from(place_in_project),
            root: "shop".to_owned(),
        }
    }

    fn watch(root: &Path) -> (SpecProjectWatcher, Receiver<Vec<String>>) {
        let (watcher, changes) = start();
        watcher.watch(vec![tree(root, "")], Vec::new());
        (watcher, changes)
    }

    fn assert_reported_once(changes: &Receiver<Vec<String>>) {
        assert_eq!(
            changes.recv_timeout(WAIT_FOR_CHANGE),
            Ok(vec!["shop".to_owned()])
        );
        assert_eq!(
            changes.recv_timeout(WAIT_FOR_SILENCE),
            Err(RecvTimeoutError::Timeout)
        );
    }

    #[test]
    fn reports_a_new_delta_file_in_a_deep_folder_once() {
        let root = tempfile::tempdir().unwrap();
        let delta_folder = root.path().join("openspec/changes/add-pins/specs/tabs");
        fs::create_dir_all(&delta_folder).unwrap();
        let (_watcher, changes) = watch(root.path());

        fs::write(delta_folder.join("spec.md"), "## ADDED Requirements\n").unwrap();

        assert_reported_once(&changes);
    }

    #[test]
    fn reports_a_ticked_task_once() {
        let root = tempfile::tempdir().unwrap();
        let change = root.path().join("openspec/changes/add-pins");
        fs::create_dir_all(&change).unwrap();
        fs::write(change.join("tasks.md"), "- [ ] 1.1 Pin\n").unwrap();
        let (_watcher, changes) = watch(root.path());

        fs::write(change.join("tasks.md"), "- [x] 1.1 Pin\n").unwrap();

        assert_reported_once(&changes);
    }

    #[test]
    fn reports_a_change_below_a_followed_link_by_its_root() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::create_dir_all(outside.path().join("specs/tabs")).unwrap();
        crate::spec_projects::test_support::link_folder(
            &root.path().join("openspec"),
            outside.path(),
        );
        let access = DocumentAccessList::default();
        access.grant_folder(root.path()).unwrap();
        access.grant_folder(outside.path()).unwrap();
        let root_path = dunce::canonicalize(root.path()).unwrap();
        let projects = [WatchedProject {
            root: root_path.to_string_lossy().into_owned(),
            followed_links: vec!["openspec".to_owned()],
        }];
        let (watcher, changes) = start();
        watcher.watch(watched_trees(&projects, &access), Vec::new());

        fs::write(outside.path().join("specs/tabs/spec.md"), "# tabs\n").unwrap();

        assert_eq!(
            changes.recv_timeout(WAIT_FOR_CHANGE),
            Ok(vec![projects[0].root.clone()])
        );
    }

    #[test]
    fn stays_quiet_about_files_no_scan_lists() {
        let root = tempfile::tempdir().unwrap();
        for folder in [
            ".git/refs",
            "openspec/node_modules/x",
            "openspec/dist",
            "src",
        ] {
            fs::create_dir_all(root.path().join(folder)).unwrap();
        }
        let (_watcher, changes) = watch(root.path());

        fs::write(root.path().join(".git/refs/head"), "1").unwrap();
        fs::write(root.path().join("openspec/node_modules/x/a.md"), "#").unwrap();
        fs::write(root.path().join("openspec/dist/a.md"), "#").unwrap();
        fs::write(root.path().join("src/main.rs"), "fn main() {}").unwrap();

        assert_eq!(
            changes.recv_timeout(WAIT_FOR_SILENCE),
            Err(RecvTimeoutError::Timeout)
        );
    }

    #[test]
    fn tells_relevant_paths_inside_a_project_and_through_a_link() {
        let watched = WatchedProjects {
            trees: vec![
                WatchedTree {
                    path: PathBuf::from(r"C:\node_modules\shop"),
                    place_in_project: PathBuf::new(),
                    root: "shop".to_owned(),
                },
                WatchedTree {
                    path: PathBuf::from(r"D:\shared"),
                    place_in_project: PathBuf::from("openspec"),
                    root: "shop".to_owned(),
                },
            ],
            additional_locations: vec![ScanPattern::parse("GEMINI.md").unwrap()],
        };
        let changed = |path: &str| watched.roots_holding(&[PathBuf::from(path)]);

        assert_eq!(changed(r"C:\node_modules\shop\specs\a\spec.md"), ["shop"]);
        assert_eq!(changed(r"C:\node_modules\shop\GEMINI.md"), ["shop"]);
        assert_eq!(changed(r"D:\shared\changes\x\tasks.md"), ["shop"]);
        assert!(changed(r"C:\node_modules\shop\specs\target\a.md").is_empty());
        assert!(changed(r"E:\other\specs\a.md").is_empty());
        assert_eq!(watched.roots_holding(&[PathBuf::new()]), ["shop"]);
    }

    #[test]
    fn a_folder_moved_in_alone_counts_but_one_reported_with_a_change_below_it_does_not() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("openspec").join("changes").join("add-x")).unwrap();
        let watched = WatchedProjects {
            trees: vec![tree(root.path(), "")],
            additional_locations: Vec::new(),
        };
        let root_path = dunce::canonicalize(root.path()).unwrap();
        let openspec = root_path.join("openspec");

        assert_eq!(
            watched.roots_holding(&[openspec.join("changes").join("add-x")]),
            ["shop"]
        );
        assert!(
            watched
                .roots_holding(&[openspec.clone(), openspec.join("dist").join("a.md")])
                .is_empty()
        );
    }

    #[test]
    fn a_saved_file_or_a_folder_counts_only_inside_a_scan_location() {
        let relevant = |path: &str, entry| may_hold_project_files(Path::new(path), entry, &[]);

        assert!(!relevant("README.md", ChangedEntry::File));
        assert!(!relevant("src", ChangedEntry::Folder));
        assert!(relevant("openspec", ChangedEntry::Folder));
        assert!(relevant("openspec/changes/add-x", ChangedEntry::Folder));
        assert!(relevant("web/openspec/specs/a/spec.md", ChangedEntry::File));
        assert!(relevant("openspec/changes/old", ChangedEntry::Gone));
        assert!(!relevant("openspec/target", ChangedEntry::Folder));
    }
}
