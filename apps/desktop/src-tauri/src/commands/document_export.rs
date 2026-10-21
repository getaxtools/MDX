use std::ffi::OsString;
use std::path::PathBuf;

use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::documents::{DocumentError, validated_file_name, write_text_atomically};

const MAX_EXPORTED_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExportFormat {
    Html,
    PlainText,
}

impl ExportFormat {
    fn extension(self) -> &'static str {
        match self {
            Self::Html => "html",
            Self::PlainText => "txt",
        }
    }

    fn filter_name(self) -> &'static str {
        match self {
            Self::Html => "HTML",
            Self::PlainText => "Text",
        }
    }
}

/// Asks where to save an exported copy of the shown document; returns the path, or `None` on cancel.
#[tauri::command]
pub async fn export_document(
    contents: String,
    suggested_file_name: String,
    format: ExportFormat,
    app: AppHandle,
) -> Result<Option<String>, DocumentError> {
    tauri::async_runtime::spawn_blocking(move || {
        if contents.len() > MAX_EXPORTED_BYTES {
            return Err(DocumentError::InvalidRequest);
        }
        let file_name = validated_file_name(&suggested_file_name)?;
        let Some(chosen) = app
            .dialog()
            .file()
            .add_filter(format.filter_name(), &[format.extension()])
            .set_file_name(file_name)
            .blocking_save_file()
            .and_then(|file| file.into_path().ok())
        else {
            return Ok(None);
        };
        let destination = with_extension(chosen, format);
        write_text_atomically(&destination, &contents)?;
        Ok(Some(destination.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|_| DocumentError::Unreadable)?
}

/// Adds the format's extension when the chosen name has another one, so the file opens in the right app.
fn with_extension(path: PathBuf, format: ExportFormat) -> PathBuf {
    let wanted = format.extension();
    let has_extension = path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case(wanted));
    if has_extension {
        return path;
    }
    let mut file_name = path.file_name().map(OsString::from).unwrap_or_default();
    file_name.push(format!(".{wanted}"));
    path.with_file_name(file_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_the_format_extension_when_it_is_missing() {
        assert_eq!(
            with_extension(PathBuf::from(r"C:\Out\guide"), ExportFormat::Html),
            PathBuf::from(r"C:\Out\guide.html")
        );
        assert_eq!(
            with_extension(PathBuf::from(r"C:\Out\guide.md"), ExportFormat::PlainText),
            PathBuf::from(r"C:\Out\guide.md.txt")
        );
    }

    #[test]
    fn keeps_a_name_that_already_has_the_extension_in_any_case() {
        assert_eq!(
            with_extension(PathBuf::from(r"C:\Out\Guide.HTML"), ExportFormat::Html),
            PathBuf::from(r"C:\Out\Guide.HTML")
        );
    }

    #[test]
    fn reads_the_format_names_the_window_sends() {
        let html: ExportFormat = serde_json::from_str("\"html\"").unwrap();
        let text: ExportFormat = serde_json::from_str("\"plainText\"").unwrap();

        assert_eq!((html, text), (ExportFormat::Html, ExportFormat::PlainText));
        assert!(serde_json::from_str::<ExportFormat>("\"exe\"").is_err());
    }
}
