use serde::{Deserialize, Serialize};

use crate::app_windows::workspace_launch_argument;
use crate::commands::documents::run_blocking;
use crate::documents::DocumentError;
use crate::platform::{JumpListLink, JumpListResult, show_jump_list_category};
use crate::storage::WorkspaceId;

/// The Jump List shows at most this many recent workspaces.
const MAX_JUMP_LIST_WORKSPACES: usize = 5;
const MAX_TITLE_CHARACTERS: usize = 200;

/// A recent workspace the window asks the Jump List to show: only its id and its name.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JumpListWorkspace {
    id: String,
    name: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum JumpListAnswer {
    Written,
    RefusedByPrivacySetting,
    #[cfg(not(windows))]
    Unavailable,
}

/// Replaces the Jump List's category of recent workspaces; each entry starts MDX showing its workspace.
/// When a privacy setting blocks custom lists, the list keeps its tasks only and the answer says so.
#[tauri::command]
pub async fn show_jump_list_workspaces(
    category: String,
    workspaces: Vec<JumpListWorkspace>,
) -> Result<JumpListAnswer, DocumentError> {
    let category = shown_text(&category).ok_or(DocumentError::InvalidRequest)?;
    let links = links_of(workspaces)?;
    let result = run_blocking(move || show_jump_list_category(&category, &links))
        .await?
        .map_err(|_| DocumentError::Unreadable)?;
    Ok(match result {
        JumpListResult::Written => JumpListAnswer::Written,
        JumpListResult::RefusedByPrivacySetting => JumpListAnswer::RefusedByPrivacySetting,
        #[cfg(not(windows))]
        JumpListResult::Unavailable => JumpListAnswer::Unavailable,
    })
}

fn links_of(workspaces: Vec<JumpListWorkspace>) -> Result<Vec<JumpListLink>, DocumentError> {
    if workspaces.len() > MAX_JUMP_LIST_WORKSPACES {
        return Err(DocumentError::InvalidRequest);
    }
    workspaces
        .into_iter()
        .map(|workspace| {
            let id =
                WorkspaceId::try_from(workspace.id).map_err(|_| DocumentError::InvalidRequest)?;
            let title = shown_text(&workspace.name).ok_or(DocumentError::InvalidRequest)?;
            Ok(JumpListLink {
                title,
                arguments: workspace_launch_argument(&id),
            })
        })
        .collect()
}

/// A name as the taskbar shows it: on one line, without invisible characters; refused when empty or long.
fn shown_text(text: &str) -> Option<String> {
    let shown: String = text
        .chars()
        .filter(|character| !character.is_control())
        .collect::<String>()
        .trim()
        .to_owned();
    (!shown.is_empty() && shown.chars().count() <= MAX_TITLE_CHARACTERS).then_some(shown)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace(id: &str, name: &str) -> JumpListWorkspace {
        JumpListWorkspace {
            id: id.to_owned(),
            name: name.to_owned(),
        }
    }

    #[test]
    fn each_entry_starts_the_app_showing_its_workspace() {
        let links = links_of(vec![workspace("reading-1", "Reading\n")]).unwrap();

        assert_eq!(
            links,
            [JumpListLink {
                title: "Reading".to_owned(),
                arguments: "--workspace=reading-1".to_owned(),
            }]
        );
    }

    #[test]
    fn refuses_more_than_five_workspaces_a_malformed_id_or_an_empty_name() {
        let six = (1..=6)
            .map(|number| workspace(&format!("w-{number}"), "W"))
            .collect();

        assert_eq!(links_of(six), Err(DocumentError::InvalidRequest));
        assert_eq!(
            links_of(vec![workspace("../../etc", "W")]),
            Err(DocumentError::InvalidRequest)
        );
        assert_eq!(
            links_of(vec![workspace("w-1", " \u{7} ")]),
            Err(DocumentError::InvalidRequest)
        );
    }

    #[test]
    fn the_window_sends_only_ids_and_names() {
        let with_path = r#"{"id":"w-1","name":"W","path":"C:\\notes"}"#;

        assert!(serde_json::from_str::<JumpListWorkspace>(with_path).is_err());
    }
}
