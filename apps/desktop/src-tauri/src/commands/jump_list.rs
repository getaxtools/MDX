use serde::{Deserialize, Serialize};

use crate::app_windows::{WorkspaceArgument, workspace_argument, workspace_launch_argument};
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

/// What an update did, and the workspaces whose entries the user removed from the Jump List.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpListAnswer {
    outcome: JumpListOutcome,
    removed_workspace_ids: Vec<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum JumpListOutcome {
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
    let (result, removed_arguments) =
        run_blocking(move || show_jump_list_category(&category, &links))
            .await?
            .map_err(|_| DocumentError::Unreadable)?;
    let outcome = match result {
        JumpListResult::Written => JumpListOutcome::Written,
        JumpListResult::RefusedByPrivacySetting => JumpListOutcome::RefusedByPrivacySetting,
        #[cfg(not(windows))]
        JumpListResult::Unavailable => JumpListOutcome::Unavailable,
    };
    Ok(JumpListAnswer {
        outcome,
        removed_workspace_ids: removed_workspace_ids_of(&removed_arguments),
    })
}

/// The workspaces of removed links that this app wrote; links in any other form are left alone.
fn removed_workspace_ids_of(removed_arguments: &[String]) -> Vec<String> {
    removed_arguments
        .iter()
        .filter_map(
            |arguments| match workspace_argument(&[String::new(), arguments.clone()]) {
                Some(WorkspaceArgument::Named(id)) => Some(id.as_str().to_owned()),
                _ => None,
            },
        )
        .collect()
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

/// Direction controls, zero-width characters and line or paragraph separators: they hide or reorder
/// a name without showing.
fn is_hidden_in_a_name(character: char) -> bool {
    character.is_control()
        || matches!(
            character,
            '\u{061C}' | '\u{200B}'..='\u{200F}' | '\u{2028}'..='\u{202E}' | '\u{2066}'..='\u{2069}' | '\u{FEFF}'
        )
}

/// A name as the taskbar shows it: on one line, without hidden characters; refused when empty or long.
fn shown_text(text: &str) -> Option<String> {
    let shown: String = text
        .chars()
        .filter(|character| !is_hidden_in_a_name(*character))
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
    fn strips_direction_controls_zero_width_characters_and_separators_from_a_name() {
        let name = "\u{202E}Re\u{200B}ad\u{2066}ing\u{2069}\u{061C}\u{FEFF}\u{2028}\u{2029}";

        assert_eq!(shown_text(name).as_deref(), Some("Reading"));
        assert_eq!(shown_text("\u{200E}\u{200F}\u{202A}"), None);
    }

    #[test]
    fn reports_the_workspaces_of_removed_links_it_wrote() {
        let removed = [
            "--workspace=reading-1".to_owned(),
            "--workspace=../x".to_owned(),
            "--other".to_owned(),
        ];

        assert_eq!(removed_workspace_ids_of(&removed), ["reading-1"]);
    }

    #[test]
    fn the_window_sends_only_ids_and_names() {
        let with_path = r#"{"id":"w-1","name":"W","path":"C:\\notes"}"#;

        assert!(serde_json::from_str::<JumpListWorkspace>(with_path).is_err());
    }
}
