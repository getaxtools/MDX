use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::commands::documents::{run_blocking, validated_path};
use crate::commands::folder_text_search::{
    FolderSearchResults, MAX_QUERY_CHARACTERS, TextSearchOptions, search_documents,
};
use crate::documents::{DocumentAccessList, DocumentError, OpenedDocument};
use crate::live_reload::SpecProjectWatcher;
use crate::spec_projects::{self, ScanPattern, SpecProjectManifest, WatchedProject};

const MAX_ADDITIONAL_LOCATIONS: usize = 64;
/// Each root is watched with every folder below it, so far fewer roots are taken than listed folders.
const MAX_WATCHED_SPEC_ROOTS: usize = 32;
const MAX_FOLLOWED_LINKS_PER_ROOT: usize = 64;

/// Documents of a chosen project root to search, by their paths relative to the root.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDocuments {
    root: String,
    relative_paths: Vec<String>,
}

/// Lists the spec, decision and agent instruction files of a project root the user has chosen.
#[tauri::command]
pub async fn scan_spec_project(
    root: String,
    additional_locations: Vec<String>,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<SpecProjectManifest, DocumentError> {
    let root = validated_path(&root)?;
    let additional_locations = validated_locations(&additional_locations)?;
    let access = Arc::clone(&access);
    run_blocking(move || spec_projects::scan_granted_project(&root, &additional_locations, &access))
        .await?
}

/// Reads a Markdown, YAML, JSON or instruction file of a chosen project root by its path relative to the root.
#[tauri::command]
pub async fn read_spec_project_file(
    root: String,
    relative_path: String,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<OpenedDocument, DocumentError> {
    let root = validated_path(&root)?;
    let access = Arc::clone(&access);
    run_blocking(move || spec_projects::read_granted_project_file(&root, &relative_path, &access))
        .await?
}

/// Finds text in the scanned documents of a chosen project root, hidden spec folders included.
#[tauri::command]
pub async fn search_spec_project_documents(
    documents: ProjectDocuments,
    query: String,
    options: TextSearchOptions,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<FolderSearchResults, DocumentError> {
    if query.chars().count() > MAX_QUERY_CHARACTERS {
        return Err(DocumentError::InvalidRequest);
    }
    let root = validated_path(&documents.root)?;
    let access = Arc::clone(&access);
    run_blocking(move || {
        let located =
            spec_projects::granted_project_documents(&root, &documents.relative_paths, &access)?;
        Ok(search_documents(located, &query, options))
    })
    .await?
}

/// Watches the folders of a Spec viewer workspace with every folder below them, and the folders their
/// followed links lead to; replaces the previous set. Only granted folders are watched.
#[tauri::command]
pub async fn watch_spec_projects(
    projects: Vec<WatchedProject>,
    additional_locations: Vec<String>,
    watcher: State<'_, SpecProjectWatcher>,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<(), DocumentError> {
    validate_watched_projects(&projects)?;
    let additional_locations = validated_locations(&additional_locations)?;
    let access = Arc::clone(&access);
    let trees = run_blocking(move || spec_projects::watched_trees(&projects, &access)).await?;
    watcher.watch(trees, additional_locations);
    Ok(())
}

fn validate_watched_projects(projects: &[WatchedProject]) -> Result<(), DocumentError> {
    let has_too_many_links = projects
        .iter()
        .any(|project| project.followed_links.len() > MAX_FOLLOWED_LINKS_PER_ROOT);
    if projects.len() > MAX_WATCHED_SPEC_ROOTS || has_too_many_links {
        return Err(DocumentError::InvalidRequest);
    }
    Ok(())
}

fn validated_locations(locations: &[String]) -> Result<Vec<ScanPattern>, DocumentError> {
    if locations.len() > MAX_ADDITIONAL_LOCATIONS {
        return Err(DocumentError::InvalidRequest);
    }
    locations
        .iter()
        .map(|location| ScanPattern::parse(location))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn projects(count: usize, links: usize) -> Vec<WatchedProject> {
        vec![
            WatchedProject {
                root: r"C:\p".to_owned(),
                followed_links: vec!["openspec".to_owned(); links],
            };
            count
        ]
    }

    #[test]
    fn refuses_to_watch_more_than_32_roots_or_too_many_links() {
        assert!(validate_watched_projects(&projects(MAX_WATCHED_SPEC_ROOTS, 1)).is_ok());
        assert_eq!(
            validate_watched_projects(&projects(MAX_WATCHED_SPEC_ROOTS + 1, 0)),
            Err(DocumentError::InvalidRequest)
        );
        assert_eq!(
            validate_watched_projects(&projects(1, MAX_FOLLOWED_LINKS_PER_ROOT + 1)),
            Err(DocumentError::InvalidRequest)
        );
    }

    #[test]
    fn refuses_too_many_additional_locations() {
        let locations = vec!["GEMINI.md".to_owned(); MAX_ADDITIONAL_LOCATIONS + 1];

        assert!(matches!(
            validated_locations(&locations),
            Err(DocumentError::InvalidRequest)
        ));
    }

    #[test]
    fn refuses_an_additional_location_that_climbs_out_of_the_root() {
        let locations = vec!["GEMINI.md".to_owned(), "../GEMINI.md".to_owned()];

        assert!(matches!(
            validated_locations(&locations),
            Err(DocumentError::InvalidRequest)
        ));
    }
}
