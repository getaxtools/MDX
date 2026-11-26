use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::documents::{DocumentAccessList, locate_document};
use crate::spec_projects::project_link::validated_link_path;

/// A scanned folder of a Spec viewer workspace and the links in it the user chose to follow.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WatchedProject {
    pub root: String,
    /// Relative to the root, as the scan lists them.
    pub followed_links: Vec<String>,
}

/// A folder watched with every folder below it, and where it sits in the project it belongs to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WatchedTree {
    /// Resolved, so a followed link is watched at the folder it leads to.
    pub path: PathBuf,
    /// Where the folder sits below the project root: empty for the root, the link's path for a link.
    pub place_in_project: PathBuf,
    /// The root as the window asked for it, which is what a change is reported by.
    pub root: String,
}

/// The granted roots and the granted targets of their followed links; anything else is left out.
pub fn watched_trees(projects: &[WatchedProject], access: &DocumentAccessList) -> Vec<WatchedTree> {
    projects
        .iter()
        .flat_map(|project| trees_of(project, access))
        .collect()
}

fn trees_of(project: &WatchedProject, access: &DocumentAccessList) -> Vec<WatchedTree> {
    let Some(root) = granted_folder(Path::new(&project.root), access) else {
        return Vec::new();
    };
    let links = project.followed_links.iter().filter_map(|link_path| {
        let relative = validated_link_path(link_path).ok()?;
        let target = granted_folder(&root.join(&relative), access)?;
        Some(WatchedTree {
            path: target,
            place_in_project: relative,
            root: project.root.clone(),
        })
    });
    let root_tree = WatchedTree {
        path: root.clone(),
        place_in_project: PathBuf::new(),
        root: project.root.clone(),
    };
    std::iter::once(root_tree).chain(links).collect()
}

fn granted_folder(path: &Path, access: &DocumentAccessList) -> Option<PathBuf> {
    let location = locate_document(path).ok()?;
    let folder = location.path();
    (folder.is_dir() && access.is_folder_allowed(&location)).then_some(folder)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spec_projects::test_support::{granted, link_folder};

    fn project(root: &Path, followed_links: &[&str]) -> WatchedProject {
        WatchedProject {
            root: root.to_string_lossy().into_owned(),
            followed_links: followed_links
                .iter()
                .map(|link| (*link).to_owned())
                .collect(),
        }
    }

    #[test]
    fn watches_a_followed_link_at_its_target_once_the_target_is_granted() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        link_folder(&root.path().join("openspec"), outside.path());
        let access = granted(root.path());
        let projects = [project(root.path(), &["openspec"])];

        assert_eq!(watched_trees(&projects, &access).len(), 1);

        access.grant_folder(outside.path()).unwrap();
        let trees = watched_trees(&projects, &access);

        assert_eq!(trees.len(), 2);
        assert_eq!(trees[1].path, dunce::canonicalize(outside.path()).unwrap());
        assert_eq!(trees[1].place_in_project, PathBuf::from("openspec"));
    }

    #[test]
    fn leaves_out_an_ungranted_root_and_a_climbing_link() {
        let root = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let access = granted(root.path());

        let trees = watched_trees(
            &[
                project(other.path(), &[]),
                project(root.path(), &["../x", "C:/x"]),
            ],
            &access,
        );

        assert_eq!(trees.len(), 1);
        assert_eq!(trees[0].root, root.path().to_string_lossy());
    }
}
