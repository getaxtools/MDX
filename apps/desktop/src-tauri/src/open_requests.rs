use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};

use serde::Serialize;
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, PhysicalPosition, Window, WindowEvent};

use crate::app_windows::{
    FileRoute, OpenWindows, WorkspaceArgument, is_known_workspace, target_window_label,
    workspace_argument,
};
use crate::attachments::{DroppedImages, is_image_path};
use crate::documents::canonical_key_of;
use crate::documents::{DocumentAccessList, is_markdown_path};
use crate::storage::{WorkspaceDatabase, is_workspace_file_path, read_workspace_file};

pub const OPEN_DOCUMENTS_EVENT: &str = "open-documents";
pub const OPEN_WORKSPACE_FILE_EVENT: &str = "open-workspace-file";
pub const IMAGES_DROPPED_EVENT: &str = "images-dropped";
/// A second launch named a workspace no window shows; the window focused last shows it.
pub const SHOW_WORKSPACE_EVENT: &str = "show-workspace";
pub const WORKSPACE_NOT_FOUND_EVENT: &str = "workspace-not-found";

/// Pictures dropped on the window and where, in CSS pixels, so the editor can place their links.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DroppedImagesEvent {
    pub paths: Vec<String>,
    pub x: f64,
    pub y: f64,
}
pub const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Debug, Default)]
pub struct StartupDocuments(Mutex<Vec<String>>);

impl StartupDocuments {
    pub fn new(display_paths: Vec<String>) -> Self {
        Self(Mutex::new(display_paths))
    }

    pub fn take(&self) -> Vec<String> {
        std::mem::take(&mut *self.0.lock().unwrap_or_else(PoisonError::into_inner))
    }
}

pub fn markdown_paths_from_arguments(arguments: &[String], working_folder: &Path) -> Vec<PathBuf> {
    arguments
        .iter()
        .skip(1)
        .map(PathBuf::from)
        .filter(|path| is_markdown_path(path))
        .map(|path| absolute_from(path, working_folder))
        .collect()
}

/// The first workspace file among the arguments; Markdown files in the same launch still open as tabs.
pub fn workspace_file_from_arguments(
    arguments: &[String],
    working_folder: &Path,
) -> Option<PathBuf> {
    arguments
        .iter()
        .skip(1)
        .map(PathBuf::from)
        .find(|path| is_workspace_file_path(path))
        .map(|path| absolute_from(path, working_folder))
}

fn absolute_from(path: PathBuf, working_folder: &Path) -> PathBuf {
    if path.is_absolute() {
        path
    } else {
        working_folder.join(path)
    }
}

/// A workspace file the app was started with, kept until the webview is ready to ask about it.
#[derive(Debug, Default)]
pub struct StartupWorkspaceFile(Mutex<Option<PathBuf>>);

impl StartupWorkspaceFile {
    pub fn new(path: Option<PathBuf>) -> Self {
        Self(Mutex::new(path))
    }

    pub fn take(&self) -> Option<PathBuf> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner).take()
    }
}

/// Grants the documents and folders saved in state shaped like the earlier state file.
pub fn grant_saved_paths(saved_json: &str, access: &DocumentAccessList) {
    let paths = crate::storage::saved_document_paths(saved_json);
    grant_documents(&paths.documents, access);
    for folder in &paths.folders {
        let _ = access.grant_folder(folder);
    }
}

pub fn grant_documents(paths: &[PathBuf], access: &DocumentAccessList) -> Vec<String> {
    paths
        .iter()
        .filter_map(|path| access.grant_folder_of(path).ok())
        .map(|location| location.display_path)
        .collect()
}

/// A second launch hands its files to the running app: each goes to the window that has it open, else to
/// the window whose workspace has the deepest root containing it, else to the window focused last. No
/// window switches its workspace for a file; only an explicit workspace argument does that, and then
/// the files open in that workspace once it is shown.
pub fn forward_second_instance(app: &AppHandle, arguments: &[String], working_folder: &str) {
    let paths = markdown_paths_from_arguments(arguments, Path::new(working_folder));
    let display_paths = grant_documents(&paths, &app.state::<Arc<DocumentAccessList>>());
    let mut focused = match workspace_argument(arguments) {
        Some(argument) => Some(forward_workspace_argument(app, argument, display_paths)),
        None => forward_documents(app, display_paths),
    };
    if let Some(contents) = workspace_file_from_arguments(arguments, Path::new(working_folder))
        .and_then(|path| read_workspace_file(&path).ok())
    {
        let label = focused.clone().unwrap_or_else(|| target_window_label(app));
        let _ = app.emit_to(label.as_str(), OPEN_WORKSPACE_FILE_EVENT, contents);
        focused = Some(label);
    }
    let label = focused.unwrap_or_else(|| target_window_label(app));
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Sends each document to its window and returns the window of the last one.
fn forward_documents(app: &AppHandle, display_paths: Vec<String>) -> Option<String> {
    let windows = app.state::<Arc<OpenWindows>>();
    let mut last = None;
    for display_path in display_paths {
        let label = match windows.route(&canonical_key_of(&display_path)) {
            FileRoute::OpenTab(label)
            | FileRoute::ContainingRoot(label)
            | FileRoute::LastFocused(label) => label,
            FileRoute::NoWindow => MAIN_WINDOW_LABEL.to_owned(),
        };
        let _ = app.emit_to(label.as_str(), OPEN_DOCUMENTS_EVENT, vec![display_path]);
        last = Some(label);
    }
    last
}

/// A workspace for a window to show, and the files to open in it once it shows it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceToShow {
    workspace_id: String,
    document_paths: Vec<String>,
}

/// Shows a named workspace with the files: in a window that shows it already, else in the window
/// focused last. A malformed or unknown id makes that window say the workspace was not found, and the
/// files are routed as usual.
fn forward_workspace_argument(
    app: &AppHandle,
    argument: WorkspaceArgument,
    display_paths: Vec<String>,
) -> String {
    let windows = app.state::<Arc<OpenWindows>>();
    let target = target_window_label(app);
    let known = match argument {
        WorkspaceArgument::Named(id)
            if is_known_workspace(&app.state::<WorkspaceDatabase>(), &id) =>
        {
            id
        }
        WorkspaceArgument::Named(_) | WorkspaceArgument::Malformed => {
            let _ = app.emit_to(target.as_str(), WORKSPACE_NOT_FOUND_EVENT, ());
            forward_documents(app, display_paths);
            return target;
        }
    };
    if let Some(label) = windows.other_window_showing(known.as_str(), "") {
        if !display_paths.is_empty() {
            let _ = app.emit_to(label.as_str(), OPEN_DOCUMENTS_EVENT, display_paths);
        }
        return label;
    }
    let shown = WorkspaceToShow {
        workspace_id: known.as_str().to_owned(),
        document_paths: display_paths,
    };
    let _ = app.emit_to(target.as_str(), SHOW_WORKSPACE_EVENT, shown);
    target
}

/// Markdown files dropped on the window open as tabs; pictures go to the editor as attachments.
pub fn handle_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::DragDrop(DragDropEvent::Drop { paths, position }) = event else {
        return;
    };
    let (markdown_paths, image_paths) = split_dropped_paths(paths);
    let display_paths =
        grant_documents(&markdown_paths, &window.state::<Arc<DocumentAccessList>>());
    if !display_paths.is_empty() {
        let _ = window.emit_to(window.label(), OPEN_DOCUMENTS_EVENT, display_paths);
    }
    if !image_paths.is_empty() {
        window
            .state::<Arc<DroppedImages>>()
            .remember(image_paths.iter().cloned());
        let scale = window.scale_factor().unwrap_or(1.0);
        let _ = window.emit_to(
            window.label(),
            IMAGES_DROPPED_EVENT,
            dropped_images_event(&image_paths, *position, scale),
        );
    }
}

fn split_dropped_paths(paths: &[PathBuf]) -> (Vec<PathBuf>, Vec<PathBuf>) {
    let markdown = paths
        .iter()
        .filter(|path| is_markdown_path(path))
        .cloned()
        .collect();
    let images = paths
        .iter()
        .filter(|path| is_image_path(path))
        .cloned()
        .collect();
    (markdown, images)
}

fn dropped_images_event(
    paths: &[PathBuf],
    position: PhysicalPosition<f64>,
    scale: f64,
) -> DroppedImagesEvent {
    let logical = position.to_logical::<f64>(scale);
    DroppedImagesEvent {
        paths: paths
            .iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect(),
        x: logical.x,
        y: logical.y,
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    #[test]
    fn workspace_file_arguments_are_kept_with_markdown_arguments() {
        let arguments = [
            "mdx.exe".to_owned(),
            "guide.md".to_owned(),
            r"D:\team\handbook.mdxworkspace".to_owned(),
        ];

        let markdown = markdown_paths_from_arguments(&arguments, Path::new(r"C:\work"));
        let workspace_file = workspace_file_from_arguments(&arguments, Path::new(r"C:\work"));

        assert_eq!(markdown, [PathBuf::from(r"C:\work\guide.md")]);
        assert_eq!(
            workspace_file,
            Some(PathBuf::from(r"D:\team\handbook.mdxworkspace"))
        );
    }

    #[test]
    fn a_second_launch_forwards_a_relative_workspace_file_from_its_folder() {
        let arguments = ["mdx.exe".to_owned(), "handbook.MDXWORKSPACE".to_owned()];

        assert_eq!(
            workspace_file_from_arguments(&arguments, Path::new(r"D:\team")),
            Some(PathBuf::from(r"D:\team\handbook.MDXWORKSPACE"))
        );
        assert_eq!(
            workspace_file_from_arguments(&arguments[..1], Path::new(r"D:\team")),
            None
        );
    }

    #[test]
    fn image_paths_go_to_the_attachment_event_and_markdown_paths_still_open() {
        let paths = ["guide.md", "chart.PNG", "notes.txt", "photo.jpeg"].map(PathBuf::from);

        let (markdown, images) = split_dropped_paths(&paths);

        assert_eq!(markdown, vec![PathBuf::from("guide.md")]);
        assert_eq!(
            images,
            vec![PathBuf::from("chart.PNG"), PathBuf::from("photo.jpeg")]
        );
    }

    #[test]
    fn reports_the_drop_position_in_css_pixels() {
        let event = dropped_images_event(
            &[PathBuf::from("chart.png")],
            PhysicalPosition::new(300.0, 150.0),
            1.5,
        );

        assert_eq!(event.x, 200.0);
        assert_eq!(event.y, 100.0);
        assert_eq!(event.paths, vec!["chart.png".to_owned()]);
    }

    #[test]
    fn keeps_only_markdown_arguments_after_the_program_name() {
        let arguments = ["mdx.exe", "a.md", "--flag", "notes.txt", "B.MARKDOWN"].map(String::from);

        let paths = markdown_paths_from_arguments(&arguments, Path::new("/work"));

        assert_eq!(
            paths,
            vec![
                Path::new("/work").join("a.md"),
                Path::new("/work").join("B.MARKDOWN")
            ]
        );
    }

    #[test]
    fn keeps_absolute_arguments_as_they_are() {
        let folder = tempfile::tempdir().unwrap();
        let absolute = folder.path().join("guide.md");
        let arguments = vec![
            "mdx.exe".to_owned(),
            absolute.to_string_lossy().into_owned(),
        ];

        let paths = markdown_paths_from_arguments(&arguments, Path::new("/elsewhere"));

        assert_eq!(paths, vec![absolute]);
    }

    #[test]
    fn grants_existing_documents_and_skips_missing_ones() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("guide.md"), "#").unwrap();
        let access = DocumentAccessList::default();

        let granted = grant_documents(
            &[
                folder.path().join("guide.md"),
                folder.path().join("gone.md"),
            ],
            &access,
        );

        assert_eq!(granted.len(), 1);
        assert!(granted[0].ends_with("guide.md"));
    }

    #[test]
    fn hands_out_startup_documents_only_once() {
        let startup = StartupDocuments::new(vec!["a.md".to_owned()]);

        assert_eq!(startup.take(), vec!["a.md".to_owned()]);
        assert!(startup.take().is_empty());
    }
}
