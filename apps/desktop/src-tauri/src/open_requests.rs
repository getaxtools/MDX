use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};

use serde::Serialize;
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, PhysicalPosition, Window, WindowEvent};

use crate::attachments::{DroppedImages, is_image_path};
use crate::documents::{DocumentAccessList, is_markdown_path};

pub const OPEN_DOCUMENTS_EVENT: &str = "open-documents";
pub const IMAGES_DROPPED_EVENT: &str = "images-dropped";

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
        .map(|path| {
            if path.is_absolute() {
                path
            } else {
                working_folder.join(path)
            }
        })
        .collect()
}

pub fn grant_documents(paths: &[PathBuf], access: &DocumentAccessList) -> Vec<String> {
    paths
        .iter()
        .filter_map(|path| access.grant_folder_of(path).ok())
        .map(|location| location.display_path)
        .collect()
}

pub fn forward_second_instance(app: &AppHandle, arguments: &[String], working_folder: &str) {
    let paths = markdown_paths_from_arguments(arguments, Path::new(working_folder));
    let display_paths = grant_documents(&paths, &app.state::<Arc<DocumentAccessList>>());
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit(OPEN_DOCUMENTS_EVENT, display_paths);
    }
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
        let _ = window.emit(OPEN_DOCUMENTS_EVENT, display_paths);
    }
    if !image_paths.is_empty() {
        window
            .state::<Arc<DroppedImages>>()
            .remember(image_paths.iter().cloned());
        let scale = window.scale_factor().unwrap_or(1.0);
        let _ = window.emit(
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
