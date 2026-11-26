use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

use crate::commands::documents::{run_blocking, validated_path};
use crate::commands::folders::pick_folder_in_dialog;
use crate::commands::notes::allowed_root;
use crate::documents::{DocumentAccessList, DocumentError, locate_document};
use crate::notes_index::ExcludedPaths;
use crate::notes_transfer::{
    ExportItem, ExportOptions, ExportOutcome, ExportRequest, ImportControl, ImportProgress,
    ImportReport, export_notes, import_folder, is_same_or_inside,
};

pub const NOTES_IMPORT_PROGRESS_EVENT: &str = "notes-import-progress";
/// Progress goes to the window at most this often, so a folder of small files cannot flood it.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

/// A language name is short; the list holds the highlighter's languages and their aliases.
const MAX_KNOWN_LANGUAGES: usize = 2_000;
const MAX_LANGUAGE_NAME_CHARACTERS: usize = 64;

/// The import running now, if any; only one runs at a time, and Cancel stops it before its next file.
#[derive(Debug, Default)]
pub struct NotesImports {
    running: Mutex<Option<Arc<AtomicBool>>>,
}

/// Marks the import as running for as long as it lives, so a failed or panicking import never blocks
/// the next one.
pub struct RunningImport {
    imports: Arc<NotesImports>,
    stop: Arc<AtomicBool>,
}

impl Drop for RunningImport {
    fn drop(&mut self) {
        *self
            .imports
            .running
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = None;
    }
}

impl NotesImports {
    fn start(imports: &Arc<Self>) -> Result<RunningImport, DocumentError> {
        let mut running = imports
            .running
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        if running.is_some() {
            return Err(DocumentError::ImportRunning);
        }
        let stop = Arc::new(AtomicBool::new(false));
        *running = Some(Arc::clone(&stop));
        Ok(RunningImport {
            imports: Arc::clone(imports),
            stop,
        })
    }

    fn cancel(&self) {
        if let Some(stop) = self
            .running
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .as_ref()
        {
            stop.store(true, Ordering::Relaxed);
        }
    }
}

/// The folder each window picked for its next import. The window may read from it only to import it
/// once: it gets no general access, so it can never become a notes folder or be written to through
/// other commands.
#[derive(Debug, Default)]
pub struct PendingImportSource(Mutex<HashMap<String, PathBuf>>);

impl PendingImportSource {
    fn remember(&self, window_label: &str, folder: PathBuf) {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(window_label.to_owned(), folder);
    }

    /// Uses up the window's pick, so one pick allows one import of that folder only.
    fn take(&self, window_label: &str) -> Option<PathBuf> {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(window_label)
    }
}

/// Asks for the folder to import; `None` when the user cancels.
#[tauri::command]
pub async fn pick_notes_import_folder(
    window: WebviewWindow,
    pending: State<'_, Arc<PendingImportSource>>,
) -> Result<Option<String>, DocumentError> {
    let pending = Arc::clone(&pending);
    run_blocking(move || {
        let Some(folder) = pick_folder_in_dialog(window.app_handle())? else {
            return Ok(None);
        };
        let folder = dunce::canonicalize(folder)?;
        let shown = folder.to_string_lossy().into_owned();
        pending.remember(window.label(), folder);
        Ok(Some(shown))
    })
    .await?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesImportRequest {
    location: String,
    /// The folder picked through `pick_notes_import_folder`.
    source: String,
    excluded_paths: Vec<String>,
    /// The code block languages the app highlights, so blocks in other languages are reported.
    known_code_languages: Vec<String>,
}

/// Copies a vault-style folder into the location off the window's thread, sending progress events.
#[tauri::command]
pub async fn import_notes_folder(
    request: NotesImportRequest,
    window: WebviewWindow,
    access: State<'_, Arc<DocumentAccessList>>,
    imports: State<'_, Arc<NotesImports>>,
) -> Result<ImportReport, DocumentError> {
    let source = validated_path(&request.source)?;
    let excluded =
        ExcludedPaths::new(&request.excluded_paths).map_err(|_| DocumentError::InvalidRequest)?;
    let known_languages = validated_languages(&request.known_code_languages)?;
    let access = Arc::clone(&access);
    let running = NotesImports::start(&imports)?;
    let picked = window
        .state::<Arc<PendingImportSource>>()
        .take(window.label());
    run_blocking(move || {
        let root = allowed_root(&request.location, &access)?;
        require_picked_source(&source, picked.as_deref())?;
        let mut last_sent: Option<Instant> = None;
        let mut on_progress = |progress: ImportProgress| {
            let is_due = last_sent.is_none_or(|sent| sent.elapsed() >= PROGRESS_INTERVAL);
            if is_due || progress.done == progress.total {
                last_sent = Some(Instant::now());
                let _ = window.emit_to(window.label(), NOTES_IMPORT_PROGRESS_EVENT, progress);
            }
        };
        let mut control = ImportControl {
            excluded: &excluded,
            known_languages: &known_languages,
            stop: &running.stop,
            on_progress: &mut on_progress,
        };
        import_folder(&source, &root, &mut control)
    })
    .await?
}

fn validated_languages(languages: &[String]) -> Result<HashSet<String>, DocumentError> {
    let is_valid = languages.len() <= MAX_KNOWN_LANGUAGES
        && languages.iter().all(|language| {
            (1..=MAX_LANGUAGE_NAME_CHARACTERS).contains(&language.chars().count())
                && !language.contains(char::is_whitespace)
        });
    if !is_valid {
        return Err(DocumentError::InvalidRequest);
    }
    Ok(languages
        .iter()
        .map(|language| language.to_lowercase())
        .collect())
}

/// Only the folder the user picked for this import may be read.
fn require_picked_source(source: &Path, picked: Option<&Path>) -> Result<(), DocumentError> {
    let source = dunce::canonicalize(source)?;
    if picked.is_some_and(|picked| picked == source) {
        Ok(())
    } else {
        Err(DocumentError::AccessDenied)
    }
}

#[tauri::command]
pub fn cancel_notes_import(imports: State<'_, Arc<NotesImports>>) {
    imports.cancel();
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "choice",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ExportFolderChoice {
    Picked {
        path: String,
    },
    /// The folder is the location or inside it, where exported files would mix with the notes.
    InsideLocation,
    Cancelled,
}

/// Asks for the folder to export into; one outside the location becomes writable for the export.
#[tauri::command]
pub async fn pick_notes_export_folder(
    location: String,
    app: AppHandle,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<ExportFolderChoice, DocumentError> {
    let access = Arc::clone(&access);
    run_blocking(move || {
        let root = allowed_root(&location, &access)?;
        let Some(folder) = pick_folder_in_dialog(&app)? else {
            return Ok(ExportFolderChoice::Cancelled);
        };
        let folder = dunce::canonicalize(folder)?;
        if is_same_or_inside(&folder, root.folder()) {
            return Ok(ExportFolderChoice::InsideLocation);
        }
        access.grant_folder(&folder)?;
        Ok(ExportFolderChoice::Picked {
            path: folder.to_string_lossy().into_owned(),
        })
    })
    .await?
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ExportedNotes {
    Note { path: String },
    Folder { path: String },
    Location,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesExportRequest {
    location: String,
    notes: ExportedNotes,
    /// A folder picked through `pick_notes_export_folder`.
    destination: String,
    use_relative_links: bool,
    replace_existing: bool,
    excluded_paths: Vec<String>,
}

#[tauri::command]
pub async fn export_notes_to_folder(
    request: NotesExportRequest,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<ExportOutcome, DocumentError> {
    let destination = validated_path(&request.destination)?;
    let item = match &request.notes {
        ExportedNotes::Note { path } => ExportItem::Note(validated_path(path)?),
        ExportedNotes::Folder { path } => ExportItem::Folder(validated_path(path)?),
        ExportedNotes::Location => ExportItem::Location,
    };
    let excluded =
        ExcludedPaths::new(&request.excluded_paths).map_err(|_| DocumentError::InvalidRequest)?;
    let options = ExportOptions {
        use_relative_links: request.use_relative_links,
        replace_existing: request.replace_existing,
    };
    let access = Arc::clone(&access);
    run_blocking(move || {
        let root = allowed_root(&request.location, &access)?;
        require_granted_folder(&destination, &access)?;
        export_notes(
            &root,
            &ExportRequest {
                item: &item,
                destination: &destination,
                excluded: &excluded,
                options,
            },
        )
    })
    .await?
}

fn require_granted_folder(folder: &Path, access: &DocumentAccessList) -> Result<(), DocumentError> {
    if access.is_folder_allowed(&locate_document(folder)?) {
        Ok(())
    } else {
        Err(DocumentError::AccessDenied)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_one_import_runs_and_cancel_stops_it() {
        let imports = Arc::new(NotesImports::default());

        let running = NotesImports::start(&imports).unwrap();
        let second = NotesImports::start(&imports);
        imports.cancel();
        let was_stopped = running.stop.load(Ordering::Relaxed);
        drop(running);

        assert_eq!(second.err(), Some(DocumentError::ImportRunning));
        assert!(was_stopped);
        assert!(NotesImports::start(&imports).is_ok());
    }

    #[test]
    fn only_the_picked_folder_may_be_imported() {
        let picked = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let picked_path = dunce::canonicalize(picked.path()).unwrap();

        assert_eq!(
            require_picked_source(picked.path(), Some(&picked_path)),
            Ok(())
        );
        assert_eq!(
            require_picked_source(other.path(), Some(&picked_path)),
            Err(DocumentError::AccessDenied)
        );
        assert_eq!(
            require_picked_source(picked.path(), None),
            Err(DocumentError::AccessDenied)
        );
    }

    #[test]
    fn each_window_keeps_its_own_pick_and_a_pick_is_used_once() {
        let pending = PendingImportSource::default();
        pending.remember("main", PathBuf::from(r"D:\Vault A"));
        pending.remember("window-2", PathBuf::from(r"D:\Vault B"));

        assert_eq!(pending.take("main"), Some(PathBuf::from(r"D:\Vault A")));
        assert_eq!(pending.take("main"), None);
        assert_eq!(pending.take("window-2"), Some(PathBuf::from(r"D:\Vault B")));
    }

    #[test]
    fn language_names_are_checked_and_read_in_lower_case() {
        let languages = validated_languages(&["Rust".to_owned(), "ts".to_owned()]).unwrap();

        assert!(languages.contains("rust"));
        assert_eq!(
            validated_languages(&["has space".to_owned()]),
            Err(DocumentError::InvalidRequest)
        );
    }

    #[test]
    fn a_folder_the_window_was_not_granted_is_refused() {
        let folder = tempfile::tempdir().unwrap();

        let result = require_granted_folder(folder.path(), &DocumentAccessList::default());

        assert_eq!(result, Err(DocumentError::AccessDenied));
    }
}
