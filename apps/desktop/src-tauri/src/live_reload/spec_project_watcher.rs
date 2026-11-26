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

/// A watched folder with the scan's extra locations of the workspace watching it, which together tell
/// a change that matters.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WatchedSpecTree {
    pub tree: WatchedTree,
    pub additional_locations: Vec<ScanPattern>,
}

impl WatchedSpecTree {
    /// The trees of one window's projects, each with that window's extra locations.
    pub fn all_of(trees: Vec<WatchedTree>, additional_locations: &[ScanPattern]) -> Vec<Self> {
        trees
            .into_iter()
            .map(|tree| Self {
                tree,
                additional_locations: additional_locations.to_vec(),
            })
            .collect()
    }

    /// The project root a change below this folder is reported by.
    pub fn root(&self) -> &str {
        &self.tree.root
    }
}

#[derive(Debug, Default)]
struct WatchedProjects {
    trees: Vec<WatchedSpecTree>,
}

impl WatchedProjects {
    /// The roots below which a changed path could change a scan; an empty path stands for a watcher
    /// error, after which anything may have changed. Each root is reported once.
    fn roots_holding(&self, changed_paths: &[PathBuf]) -> Vec<String> {
        let changes: Vec<(&PathBuf, ChangedEntry)> = changed_paths
            .iter()
            .map(|path| (path, entry_at(path)))
            .collect();
        let mut roots: Vec<String> = Vec::new();
        for WatchedSpecTree {
            tree,
            additional_locations,
        } in &self.trees
        {
            let is_changed = changes.iter().any(|(path, entry)| {
                path.as_os_str().is_empty()
                    || path.strip_prefix(&tree.path).is_ok_and(|below| {
                        let in_project = tree.place_in_project.join(below);
                        in_project.as_os_str().is_empty()
                            || may_hold_project_files(&in_project, *entry, additional_locations)
                    })
            });
            if is_changed && !roots.contains(&tree.root) {
                roots.push(tree.root.clone());
            }
        }
        roots
    }
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

    /// Watches these folders, which every window's Spec viewer workspace asks for together.
    pub fn watch(&self, trees: Vec<WatchedSpecTree>) {
        let paths: BTreeSet<PathBuf> = trees
            .iter()
            .map(|watched| watched.tree.path.clone())
            .collect();
        *lock(&self.watched) = WatchedProjects { trees };
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
    use crate::live_reload::WindowWatchSets;
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
        watcher.watch(WatchedSpecTree::all_of(vec![tree(root, "")], &[]));
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
        watcher.watch(WatchedSpecTree::all_of(
            watched_trees(&projects, &access),
            &[],
        ));

        fs::write(outside.path().join("specs/tabs/spec.md"), "# tabs\n").unwrap();

        assert_eq!(
            changes.recv_timeout(WAIT_FOR_CHANGE),
            Ok(vec![projects[0].root.clone()])
        );
    }

    #[test]
    fn stays_quiet_about_files_no_scan_lists() {
        let root = tempfile::tempdir().unwrap();
        for folder in [".git/refs", "node_modules/x", "dist", "src"] {
            fs::create_dir_all(root.path().join(folder)).unwrap();
        }
        let (_watcher, changes) = watch(root.path());

        fs::write(root.path().join(".git/refs/head"), "1").unwrap();
        fs::write(root.path().join("node_modules/x/a.md"), "#").unwrap();
        fs::write(root.path().join("dist/a.md"), "#").unwrap();
        fs::write(root.path().join("src/main.rs"), "fn main() {}").unwrap();

        assert_eq!(
            changes.recv_timeout(WAIT_FOR_SILENCE),
            Err(RecvTimeoutError::Timeout)
        );
    }

    #[test]
    fn tells_relevant_paths_inside_a_project_and_through_a_link() {
        let watched = WatchedProjects {
            trees: WatchedSpecTree::all_of(
                vec![
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
                &[ScanPattern::parse("GEMINI.md").unwrap()],
            ),
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
    fn a_new_change_folder_counts_even_with_an_ignored_file_below_it() {
        let root = tempfile::tempdir().unwrap();
        let change = root.path().join("openspec").join("changes").join("add-x");
        fs::create_dir_all(change.join("node_modules")).unwrap();
        let watched = WatchedProjects {
            trees: WatchedSpecTree::all_of(vec![tree(root.path(), "")], &[]),
        };
        let change = dunce::canonicalize(&change).unwrap();

        assert_eq!(
            watched.roots_holding(&[change.clone(), change.join("node_modules").join("a.md")]),
            ["shop"]
        );
        assert!(
            watched
                .roots_holding(&[change.join("node_modules").join("a.md")])
                .is_empty()
        );
    }

    fn tree_of(root: &str) -> WatchedTree {
        WatchedTree {
            path: PathBuf::from(root),
            place_in_project: PathBuf::new(),
            root: root.to_owned(),
        }
    }

    #[test]
    fn extra_locations_count_only_for_the_trees_of_the_window_that_asked_for_them() {
        let plans = ScanPattern::parse("plans/**").unwrap();
        let mut trees = WatchedSpecTree::all_of(vec![tree_of(r"C:\shop")], &[plans]);
        trees.extend(WatchedSpecTree::all_of(vec![tree_of(r"D:\docs")], &[]));
        let watched = WatchedProjects { trees };
        let changed = |path: &str| watched.roots_holding(&[PathBuf::from(path)]);

        assert_eq!(changed(r"C:\shop\plans\q3.md"), [r"C:\shop"]);
        assert!(changed(r"D:\docs\plans\q3.md").is_empty());
    }

    #[test]
    fn a_changed_root_goes_only_to_the_windows_watching_it() {
        let sets = WindowWatchSets::default();
        sets.replace_and(
            "main",
            WatchedSpecTree::all_of(vec![tree_of(r"C:\shop")], &[]),
            |_| (),
        );
        sets.replace_and(
            "window-2",
            WatchedSpecTree::all_of(vec![tree_of(r"D:\docs")], &[]),
            |_| (),
        );
        sets.replace_and("window-3", Vec::new(), |_| ());

        let shares = sets.share_of(&[r"c:\SHOP".to_owned()], WatchedSpecTree::root);

        assert_eq!(shares, [("main".to_owned(), vec![r"c:\SHOP".to_owned()])]);
    }

    #[test]
    fn a_window_watching_its_projects_keeps_the_other_windows_projects_watched() {
        let sets = WindowWatchSets::default();
        let mut watched = Vec::new();
        sets.replace_and(
            "main",
            WatchedSpecTree::all_of(vec![tree_of(r"C:\shop")], &[]),
            |_| (),
        );

        sets.replace_and(
            "window-2",
            WatchedSpecTree::all_of(vec![tree_of(r"D:\docs")], &[]),
            |all| watched = all,
        );

        let roots: Vec<&str> = watched.iter().map(WatchedSpecTree::root).collect();
        assert_eq!(roots, [r"C:\shop", r"D:\docs"]);
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
