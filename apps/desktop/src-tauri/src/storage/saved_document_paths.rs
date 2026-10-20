use std::path::PathBuf;

use serde_json::Value;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct SavedDocumentPaths {
    pub documents: Vec<PathBuf>,
    pub folders: Vec<PathBuf>,
}

pub fn saved_document_paths(state_json: &str) -> SavedDocumentPaths {
    let Ok(state) = serde_json::from_str::<Value>(state_json) else {
        return SavedDocumentPaths::default();
    };
    let tabs = state.pointer("/tabs/tabs");
    let recent_files = state.get("recentFiles");
    let favourites = state.get("favourites");

    let mut paths = SavedDocumentPaths::default();
    for entry in [tabs, recent_files, favourites]
        .into_iter()
        .flatten()
        .filter_map(Value::as_array)
        .flatten()
    {
        let Some(display_path) = entry
            .pointer("/location/displayPath")
            .and_then(Value::as_str)
        else {
            continue;
        };
        let is_folder = entry.get("kind").and_then(Value::as_str) == Some("folder");
        let target = if is_folder {
            &mut paths.folders
        } else {
            &mut paths.documents
        };
        target.push(PathBuf::from(display_path));
    }
    paths.folders.extend(explorer_folder_paths(&state));
    paths
}

fn explorer_folder_paths(state: &Value) -> impl Iterator<Item = PathBuf> + '_ {
    state
        .get("explorerFolders")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|folder| folder.get("displayPath").and_then(Value::as_str))
        .map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_documents_and_folders_from_tabs_recent_files_and_favourites() {
        let state = r#"{
            "schemaVersion": 1,
            "tabs": { "tabs": [{ "location": { "displayPath": "C:/docs/a.md" } }] },
            "recentFiles": [{ "location": { "displayPath": "C:/docs/b.md" } }],
            "favourites": [
                { "location": { "displayPath": "C:/specs" }, "kind": "folder" },
                { "location": { "displayPath": "C:/notes/c.md" }, "kind": "file" }
            ]
        }"#;

        let paths = saved_document_paths(state);

        assert_eq!(
            paths.documents,
            vec![
                PathBuf::from("C:/docs/a.md"),
                PathBuf::from("C:/docs/b.md"),
                PathBuf::from("C:/notes/c.md")
            ]
        );
        assert_eq!(paths.folders, vec![PathBuf::from("C:/specs")]);
    }

    #[test]
    fn collects_the_folders_opened_in_the_explorer() {
        let state = r#"{
            "explorerFolders": [{ "displayPath": "D:/notes" }, { "displayPath": 3 }, "text"]
        }"#;

        let paths = saved_document_paths(state);

        assert_eq!(paths.folders, vec![PathBuf::from("D:/notes")]);
        assert!(paths.documents.is_empty());
    }

    #[test]
    fn ignores_malformed_entries() {
        let state = r#"{ "recentFiles": [{ "location": {} }, "text", { "location": { "displayPath": 7 } }] }"#;

        assert_eq!(saved_document_paths(state), SavedDocumentPaths::default());
    }

    #[test]
    fn returns_nothing_for_invalid_json() {
        assert_eq!(
            saved_document_paths("{ broken"),
            SavedDocumentPaths::default()
        );
    }
}
