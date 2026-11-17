use std::io;

use crate::commands::documents::run_blocking;
use crate::documents::DocumentError;
use crate::platform;

/// The editor's own limit, so plain text from the clipboard can always be edited.
pub const MAX_PLAIN_TEXT_PASTE_BYTES: usize = 1024 * 1024;

/// The clipboard's plain text for Edit > Paste as Plain Text, the one place that reads it. The
/// webview has no clipboard permission of its own, so nothing else in the page can read it.
#[tauri::command]
pub async fn read_clipboard_text() -> Result<String, DocumentError> {
    run_blocking(|| {
        // UTF-16 text has at most as many units as its UTF-8 form has bytes, so this bound refuses
        // early only text that is over the limit anyway.
        let text = platform::read_clipboard_text(MAX_PLAIN_TEXT_PASTE_BYTES).map_err(|error| {
            if error.kind() == io::ErrorKind::FileTooLarge {
                DocumentError::TooLarge
            } else {
                DocumentError::Unreadable
            }
        })?;
        // A clipboard without text, such as one holding only a picture, pastes nothing.
        plain_paste_text(&text.unwrap_or_default())
    })
    .await?
}

/// Clipboard text as the editor takes it: control characters other than tab and line break left
/// out, and refused when larger than the editor's limit.
pub fn plain_paste_text(text: &str) -> Result<String, DocumentError> {
    if text.len() > MAX_PLAIN_TEXT_PASTE_BYTES {
        return Err(DocumentError::TooLarge);
    }
    Ok(text
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\t' | '\n'))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_text_tabs_and_line_breaks() {
        assert_eq!(
            plain_paste_text("Name\tValue\nArea \\(x\\)"),
            Ok("Name\tValue\nArea \\(x\\)".to_owned())
        );
    }

    #[test]
    fn leaves_out_other_control_characters_including_carriage_returns() {
        assert_eq!(
            plain_paste_text("one\r\ntwo\u{0}\u{7}\u{1b}[31m\u{7f}three"),
            Ok("one\ntwo[31mthree".to_owned())
        );
    }

    #[test]
    fn keeps_non_latin_text_and_emoji() {
        assert_eq!(
            plain_paste_text("日本語 हिन्दी 👩‍💻"),
            Ok("日本語 हिन्दी 👩‍💻".to_owned())
        );
    }

    #[test]
    fn refuses_text_over_the_editor_limit() {
        let largest = "a".repeat(MAX_PLAIN_TEXT_PASTE_BYTES);
        let too_large = "a".repeat(MAX_PLAIN_TEXT_PASTE_BYTES + 1);

        assert_eq!(
            plain_paste_text(&largest).map(|text| text.len()),
            Ok(MAX_PLAIN_TEXT_PASTE_BYTES)
        );
        assert_eq!(plain_paste_text(&too_large), Err(DocumentError::TooLarge));
    }
}
