use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, PoisonError};

use serde::Deserialize;
use tauri::{Manager, State, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use crate::commands::documents::{run_blocking, validated_path};
use crate::documents::{DocumentAccessList, DocumentError};
use crate::menu::{MainMenu, MenuLabels};
use crate::spec_projects;

const TARGET_PLACEHOLDER: &str = "{path}";
const TITLE_KEY: &str = "specViewer.link.question.title";
const MESSAGE_KEY: &str = "specViewer.link.question.message";
const FOLLOW_KEY: &str = "specViewer.link.question.follow";
const CANCEL_KEY: &str = "specViewer.link.question.cancel";

/// A linked folder of a chosen project root, named by its path relative to the root. Only the link
/// comes from the window: the dialog's words come from the app's own catalog.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectLink {
    root: String,
    link_path: String,
}

/// Lets one link question be open at a time, so a page cannot stack dialogs.
#[derive(Debug, Default)]
pub struct LinkQuestions {
    is_asking: AtomicBool,
}

struct OpenQuestion(Arc<LinkQuestions>);

impl Drop for OpenQuestion {
    fn drop(&mut self) {
        self.0.is_asking.store(false, Ordering::Release);
    }
}

fn start_asking(questions: &Arc<LinkQuestions>) -> Option<OpenQuestion> {
    questions
        .is_asking
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .ok()
        .map(|_| OpenQuestion(Arc::clone(questions)))
}

#[derive(Debug, PartialEq, Eq)]
struct LinkDialogText {
    title: String,
    message: String,
    follow_label: String,
    cancel_label: String,
}

/// The question in the display language, naming the target on a line of its own.
fn link_dialog_text(labels: &MenuLabels, target: &Path) -> LinkDialogText {
    LinkDialogText {
        title: labels.label(TITLE_KEY),
        message: labels
            .label(MESSAGE_KEY)
            .replace(TARGET_PLACEHOLDER, &shown_path(target)),
        follow_label: labels.label(FOLLOW_KEY),
        cancel_label: labels.label(CANCEL_KEY),
    }
}

/// A path as the dialog shows it, without characters that could hide or reorder its text.
fn shown_path(path: &Path) -> String {
    path.to_string_lossy()
        .chars()
        .filter(|character| !is_invisible_or_reordering(*character))
        .collect()
}

/// Control characters, and format characters such as bidirectional overrides and zero-width marks.
fn is_invisible_or_reordering(character: char) -> bool {
    character.is_control()
        || matches!(
            u32::from(character),
            0x00AD
                | 0x0600..=0x0605
                | 0x061C
                | 0x06DD
                | 0x070F
                | 0x0890..=0x0891
                | 0x08E2
                | 0x180E
                | 0x200B..=0x200F
                | 0x202A..=0x202E
                | 0x2060..=0x2064
                | 0x2066..=0x206F
                | 0xFEFF
                | 0xFFF9..=0xFFFB
                | 0x110BD
                | 0x110CD
                | 0x13430..=0x1343F
                | 0x1BCA0..=0x1BCA3
                | 0x1D173..=0x1D17A
                | 0xE0001
                | 0xE0020..=0xE007F
        )
}

/// The menu holds the labels of the language the window shows; English until it has them.
fn dialog_text_in_display_language(window: &WebviewWindow, target: &Path) -> LinkDialogText {
    match window.try_state::<MainMenu>() {
        Some(menu) => {
            let parts = menu.0.lock().unwrap_or_else(PoisonError::into_inner);
            link_dialog_text(&parts.labels, target)
        }
        None => link_dialog_text(&MenuLabels::english(), target),
    }
}

/// Asks the user in a dialog of the window, naming the folder the link really leads to, before a linked
/// folder of a project is followed; returns whether the user agreed, after which that folder's tree is
/// granted for the session and the next scan follows the link. A question already open answers no.
#[tauri::command]
pub async fn follow_spec_project_link(
    link: ProjectLink,
    window: WebviewWindow,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<bool, DocumentError> {
    let root = validated_path(&link.root)?;
    let access = Arc::clone(&access);
    let questions = Arc::clone(&window.state::<Arc<LinkQuestions>>());
    let Some(open_question) = start_asking(&questions) else {
        return Ok(false);
    };
    run_blocking(move || {
        let _open_question = open_question;
        spec_projects::follow_linked_folder(&root, &link.link_path, &access, |target| {
            let text = dialog_text_in_display_language(&window, &target.path());
            window
                .dialog()
                .message(text.message)
                .title(text.title)
                .kind(MessageDialogKind::Warning)
                .parent(&window)
                .buttons(MessageDialogButtons::OkCancelCustom(
                    text.follow_label,
                    text.cancel_label,
                ))
                .blocking_show()
        })
    })
    .await?
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn words_the_question_from_the_catalog_and_names_the_target_on_its_own_line() {
        let text = link_dialog_text(&MenuLabels::english(), Path::new(r"C:\Shared\specs"));

        assert_eq!(text.title, MenuLabels::english().label(TITLE_KEY));
        assert_eq!(text.follow_label, "Follow the Link");
        assert_eq!(text.cancel_label, "Cancel");
        assert!(text.message.contains("\n\nC:\\Shared\\specs\n\n"));
    }

    #[test]
    fn the_window_cannot_word_the_question() {
        let worded = r#"{"root":"C:\\p","linkPath":"openspec","followLabel":"Cancel"}"#;
        let plain = r#"{"root":"C:\\p","linkPath":"openspec"}"#;

        assert!(serde_json::from_str::<ProjectLink>(worded).is_err());
        assert!(serde_json::from_str::<ProjectLink>(plain).is_ok());
    }

    #[test]
    fn strips_control_and_bidirectional_characters_from_the_shown_path() {
        let path = PathBuf::from("C:\\Shared\u{202E}cod.exe\u{200B}\u{2066}\u{0007}\nnext");

        assert_eq!(shown_path(&path), "C:\\Sharedcod.exenext");
    }

    #[test]
    fn asks_one_question_at_a_time() {
        let questions = Arc::new(LinkQuestions::default());

        let first = start_asking(&questions);
        assert!(first.is_some());
        assert!(start_asking(&questions).is_none());
        drop(first);
        assert!(start_asking(&questions).is_some());
    }
}
