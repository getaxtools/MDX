use std::sync::Arc;

use tauri::State;

use crate::commands::documents::{run_blocking, validated_path};
use crate::documents::{DocumentAccessList, DocumentError, OpenedDocument};
use crate::spec_projects::{self, ScanPattern, SpecProjectManifest};

const MAX_ADDITIONAL_LOCATIONS: usize = 64;

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

/// Reads a Markdown, YAML or JSON file of a chosen project root by its path relative to the root.
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
