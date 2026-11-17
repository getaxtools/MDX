use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;

use super::file_placement::{CopiedContent, Placement, place_copy};
use super::folder_walk::{
    FolderWalk, WalkControl, WalkedFile, canonical_even_if_missing, is_same_or_inside,
    walk_folder_with,
};
use crate::documents::{DocumentError, MAX_DOCUMENT_BYTES, is_markdown_path};
use crate::notes::NotesRoot;
use crate::notes_index::{ExcludedPaths, UnsupportedKind, unsupported_syntax_of};

/// The report lists at most this many entries of each kind and counts the rest.
pub const MAX_REPORTED_ENTRIES: usize = 500;

/// A file saved under another name because the location already had one with its name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamedFile {
    /// Paths inside the location, with `/` between the parts.
    pub wanted: String,
    pub saved_as: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportedSyntax {
    /// The imported note, as a path inside the location.
    pub note: String,
    pub kind: UnsupportedKind,
    /// One-based, as people count lines.
    pub line: usize,
    pub detail: String,
}

/// What an import copied, renamed and could not carry over.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub copied_files: usize,
    pub renamed_files: Vec<RenamedFile>,
    pub renamed_not_listed: usize,
    pub unsupported_syntax: Vec<ReportedSyntax>,
    pub unsupported_not_listed: usize,
    /// Dot entries, hidden entries and links in the source, which are never copied.
    pub skipped_entries: usize,
    /// Files that could not be copied, such as ones another program has locked.
    pub failed_files: Vec<String>,
    /// Folders in the source that could not be listed, so nothing in them was copied.
    pub unreadable_folders: Vec<String>,
    pub was_cancelled: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub done: usize,
    pub total: usize,
    /// Files are still being found; `total` is how many so far.
    pub is_listing: bool,
}

pub struct ImportControl<'control> {
    /// Excluded paths of the location: files that land under one are copied without being read.
    pub excluded: &'control ExcludedPaths,
    /// Code block languages the app highlights, in lower case; blocks in others are reported.
    pub known_languages: &'control HashSet<String>,
    pub stop: &'control AtomicBool,
    pub on_progress: &'control mut dyn FnMut(ImportProgress),
}

/// Copies every file of a vault-style folder into the location byte for byte, keeping its folders.
/// The source is only read; a name the location already has is never replaced, the copy is saved
/// under a new name instead. Markdown notes are then read for syntax this app does not support.
pub fn import_folder(
    source: &Path,
    root: &NotesRoot,
    control: &mut ImportControl<'_>,
) -> Result<ImportReport, DocumentError> {
    let source = dunce::canonicalize(source)?;
    if !source.is_dir() {
        return Err(DocumentError::NotFound);
    }
    if is_same_or_inside(&source, root.folder()) || is_same_or_inside(root.folder(), &source) {
        return Err(DocumentError::SourceOverlapsLocation);
    }
    let walk = list_source(&source, control)?;
    let mut report = ImportReport {
        skipped_entries: walk.skipped_entries,
        unreadable_folders: walk.unreadable_folders,
        was_cancelled: walk.was_stopped,
        ..ImportReport::default()
    };
    let total = walk.files.len();
    for (done, file) in walk.files.iter().enumerate() {
        if control.stop.load(Ordering::Relaxed) {
            report.was_cancelled = true;
            break;
        }
        import_file(file, root, control, &mut report);
        (control.on_progress)(ImportProgress {
            done: done + 1,
            total,
            is_listing: false,
        });
    }
    Ok(report)
}

/// Finding the files of a large folder takes a while too, so it can be stopped and shows its count.
fn list_source(
    source: &Path,
    control: &mut ImportControl<'_>,
) -> Result<FolderWalk, DocumentError> {
    let on_progress = &mut control.on_progress;
    let mut on_listed = |found: usize| {
        on_progress(ImportProgress {
            done: 0,
            total: found,
            is_listing: true,
        });
    };
    walk_folder_with(
        source,
        &mut WalkControl {
            stop: control.stop,
            on_listed: &mut on_listed,
        },
    )
}

/// Makes the file's folder and checks that it really is inside the location, before making it and again
/// after, so a junction in the location can neither get folders made outside nor the copy sent there.
fn prepared_folder_of(root: &NotesRoot, destination: &Path) -> Result<(), DocumentError> {
    let folder = destination.parent().ok_or(DocumentError::InvalidRequest)?;
    if !is_same_or_inside(&canonical_even_if_missing(folder)?, root.folder()) {
        return Err(DocumentError::AccessDenied);
    }
    fs::create_dir_all(folder)?;
    root.resolve_inside(folder).map(|_| ())
}

fn import_file(
    file: &WalkedFile,
    root: &NotesRoot,
    control: &ImportControl<'_>,
    report: &mut ImportReport,
) {
    let destination = destination_of(root.folder(), &file.relative);
    let saved = prepared_folder_of(root, &destination).and_then(|()| {
        place_copy(
            &CopiedContent::BytesOf(&file.path),
            &destination,
            Placement::UnderFreeName,
        )
    });
    let Ok(saved) = saved else {
        report.failed_files.push(file.relative.clone());
        return;
    };
    report.copied_files += 1;
    if saved != destination {
        record_rename(
            report,
            &file.relative,
            &relative_saved_name(&file.relative, &saved),
        );
    }
    if is_markdown_path(&saved) && !control.excluded.contains(&file.relative) {
        let note = relative_saved_name(&file.relative, &saved);
        record_unsupported_syntax(report, (&note, &saved), control.known_languages);
    }
}

fn destination_of(root: &Path, relative: &str) -> PathBuf {
    relative
        .split('/')
        .fold(root.to_path_buf(), |path, part| path.join(part))
}

/// The saved file's path inside the location: the wanted folder with the name it was saved under.
fn relative_saved_name(wanted: &str, saved: &Path) -> String {
    let name = saved.file_name().unwrap_or_default().to_string_lossy();
    match wanted.rsplit_once('/') {
        Some((folder, _)) => format!("{folder}/{name}"),
        None => name.into_owned(),
    }
}

fn record_rename(report: &mut ImportReport, wanted: &str, saved_as: &str) {
    if report.renamed_files.len() < MAX_REPORTED_ENTRIES {
        report.renamed_files.push(RenamedFile {
            wanted: wanted.to_owned(),
            saved_as: saved_as.to_owned(),
        });
    } else {
        report.renamed_not_listed += 1;
    }
}

/// Reads the copy, never the source again; a note too large to open is copied but not read.
fn record_unsupported_syntax(
    report: &mut ImportReport,
    (note, copy): (&str, &Path),
    known_languages: &HashSet<String>,
) {
    let is_small_enough =
        fs::metadata(copy).is_ok_and(|metadata| metadata.len() <= MAX_DOCUMENT_BYTES);
    let Some(bytes) = is_small_enough.then(|| fs::read(copy).ok()).flatten() else {
        return;
    };
    for syntax in unsupported_syntax_of(&String::from_utf8_lossy(&bytes), known_languages) {
        if report.unsupported_syntax.len() >= MAX_REPORTED_ENTRIES {
            report.unsupported_not_listed += 1;
            continue;
        }
        report.unsupported_syntax.push(ReportedSyntax {
            note: note.to_owned(),
            kind: syntax.kind,
            line: syntax.line + 1,
            detail: syntax.detail,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::super::folder_walk::walk_folder;
    use super::*;

    struct Folders {
        source: tempfile::TempDir,
        location: tempfile::TempDir,
    }

    impl Folders {
        fn new() -> Self {
            Self {
                source: tempfile::tempdir().unwrap(),
                location: tempfile::tempdir().unwrap(),
            }
        }

        fn write_source(&self, relative: &str, bytes: &[u8]) {
            let path = self.source.path().join(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, bytes).unwrap();
        }

        fn write_location(&self, relative: &str, bytes: &[u8]) {
            let path = self.location.path().join(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, bytes).unwrap();
        }

        fn import(&self, excluded: &[&str]) -> ImportReport {
            let root = NotesRoot::new(self.location.path()).unwrap();
            let excluded = ExcludedPaths::new(
                &excluded
                    .iter()
                    .map(|path| (*path).to_owned())
                    .collect::<Vec<_>>(),
            )
            .unwrap();
            let stop = AtomicBool::new(false);
            let mut on_progress = |_: ImportProgress| {};
            let mut control = ImportControl {
                excluded: &excluded,
                known_languages: &HashSet::new(),
                stop: &stop,
                on_progress: &mut on_progress,
            };
            import_folder(self.source.path(), &root, &mut control).unwrap()
        }

        fn snapshot_of_source(&self) -> Vec<(String, Vec<u8>)> {
            walk_folder(self.source.path())
                .unwrap()
                .files
                .into_iter()
                .map(|file| (file.relative, fs::read(file.path).unwrap()))
                .collect()
        }
    }

    const NOTE_BYTES: &[u8] = b"\xef\xbb\xbf# Plan\r\n\r\nSee [[Plan#^a1b2]].\r\n";

    #[test]
    fn copied_bytes_equal_the_source_and_folders_are_kept() {
        let folders = Folders::new();
        folders.write_source("Projects/Plan.md", NOTE_BYTES);
        folders.write_source("Projects/attachments/chart.png", &[0, 159, 146, 150]);

        let report = folders.import(&[]);

        assert_eq!(report.copied_files, 2);
        assert_eq!(
            fs::read(folders.location.path().join("Projects/Plan.md")).unwrap(),
            NOTE_BYTES
        );
        assert_eq!(
            fs::read(
                folders
                    .location
                    .path()
                    .join("Projects/attachments/chart.png")
            )
            .unwrap(),
            [0, 159, 146, 150]
        );
    }

    #[test]
    fn block_references_are_reported() {
        let folders = Folders::new();
        folders.write_source("Plan.md", NOTE_BYTES);

        let report = folders.import(&[]);

        assert_eq!(
            report.unsupported_syntax,
            vec![ReportedSyntax {
                note: "Plan.md".to_owned(),
                kind: UnsupportedKind::BlockReference,
                line: 3,
                detail: "Plan#^a1b2".to_owned(),
            }]
        );
    }

    #[test]
    fn a_clash_is_saved_under_a_new_name() {
        let folders = Folders::new();
        folders.write_location("Plan.md", b"mine");
        folders.write_source("Plan.md", b"theirs");

        let report = folders.import(&[]);

        assert_eq!(
            fs::read(folders.location.path().join("Plan.md")).unwrap(),
            b"mine"
        );
        assert_eq!(
            fs::read(folders.location.path().join("Plan (imported).md")).unwrap(),
            b"theirs"
        );
        assert_eq!(
            report.renamed_files,
            vec![RenamedFile {
                wanted: "Plan.md".to_owned(),
                saved_as: "Plan (imported).md".to_owned(),
            }]
        );
    }

    #[test]
    fn the_source_is_unchanged() {
        let folders = Folders::new();
        folders.write_source("Plan.md", NOTE_BYTES);
        folders.write_source("Archive/Old.md", b"old");
        folders.write_source(".app-settings/workspace.json", b"{}");
        folders.write_location("Plan.md", b"mine");
        let before = folders.snapshot_of_source();
        let dot_folder_before =
            fs::read(folders.source.path().join(".app-settings/workspace.json")).unwrap();

        folders.import(&[]);

        assert_eq!(folders.snapshot_of_source(), before);
        assert_eq!(
            fs::read(folders.source.path().join(".app-settings/workspace.json")).unwrap(),
            dot_folder_before
        );
    }

    #[test]
    fn dot_folders_are_skipped() {
        let folders = Folders::new();
        folders.write_source(".app-settings/app.json", b"{}");
        folders.write_source("Plan.md", b"x");

        let report = folders.import(&[]);

        assert!(!folders.location.path().join(".app-settings").exists());
        assert_eq!(report.skipped_entries, 1);
    }

    #[test]
    fn excluded_paths_are_copied_but_not_read() {
        let folders = Folders::new();
        folders.write_source("Private/Salary.md", NOTE_BYTES);

        let report = folders.import(&["Private"]);

        assert_eq!(
            fs::read(folders.location.path().join("Private/Salary.md")).unwrap(),
            NOTE_BYTES
        );
        assert!(report.unsupported_syntax.is_empty());
    }

    #[test]
    fn a_source_overlapping_the_location_is_refused() {
        let folders = Folders::new();
        let root = NotesRoot::new(folders.location.path()).unwrap();
        let inside = folders.location.path().join("Inbox");
        fs::create_dir_all(&inside).unwrap();
        let excluded = ExcludedPaths::default();
        let stop = AtomicBool::new(false);
        let mut on_progress = |_: ImportProgress| {};
        let mut control = ImportControl {
            excluded: &excluded,
            known_languages: &HashSet::new(),
            stop: &stop,
            on_progress: &mut on_progress,
        };

        let from_inside = import_folder(&inside, &root, &mut control);
        let from_parent = import_folder(
            folders.location.path().parent().unwrap(),
            &root,
            &mut control,
        );

        assert_eq!(from_inside, Err(DocumentError::SourceOverlapsLocation));
        assert_eq!(from_parent, Err(DocumentError::SourceOverlapsLocation));
    }

    #[test]
    fn a_cancelled_import_stops_before_the_next_file_and_says_so() {
        let folders = Folders::new();
        folders.write_source("A.md", b"a");
        folders.write_source("B.md", b"b");
        let root = NotesRoot::new(folders.location.path()).unwrap();
        let excluded = ExcludedPaths::default();
        let stop = AtomicBool::new(false);
        let mut on_progress = |progress: ImportProgress| {
            if !progress.is_listing {
                stop.store(true, Ordering::Relaxed);
            }
        };
        let mut control = ImportControl {
            excluded: &excluded,
            known_languages: &HashSet::new(),
            stop: &stop,
            on_progress: &mut on_progress,
        };

        let report = import_folder(folders.source.path(), &root, &mut control).unwrap();

        assert!(report.was_cancelled);
        assert_eq!(report.copied_files, 1);
        assert!(!folders.location.path().join("B.md").exists());
    }

    #[cfg(windows)]
    #[test]
    fn a_junction_in_the_location_cannot_send_a_copy_outside_it() {
        let folders = Folders::new();
        let outside = tempfile::tempdir().unwrap();
        assert!(
            super::super::folder_walk::make_junction(
                &folders.location.path().join("Projects"),
                outside.path(),
            )
            .unwrap()
        );
        folders.write_source("Projects/Plan.md", b"theirs");

        let report = folders.import(&[]);

        assert_eq!(report.failed_files, vec!["Projects/Plan.md"]);
        assert!(fs::read_dir(outside.path()).unwrap().next().is_none());
    }

    #[cfg(windows)]
    #[test]
    fn a_junction_in_the_location_gets_no_folders_made_outside_it() {
        let folders = Folders::new();
        let outside = tempfile::tempdir().unwrap();
        assert!(
            super::super::folder_walk::make_junction(
                &folders.location.path().join("Projects"),
                outside.path(),
            )
            .unwrap()
        );
        folders.write_source("Projects/Sub/Plan.md", b"theirs");

        let report = folders.import(&[]);

        assert_eq!(report.failed_files, vec!["Projects/Sub/Plan.md"]);
        assert!(fs::read_dir(outside.path()).unwrap().next().is_none());
    }

    #[test]
    fn listing_the_source_reports_how_many_files_were_found() {
        let folders = Folders::new();
        folders.write_source("A.md", b"a");
        let root = NotesRoot::new(folders.location.path()).unwrap();
        let excluded = ExcludedPaths::default();
        let stop = AtomicBool::new(false);
        let mut seen = Vec::new();
        let mut on_progress = |progress: ImportProgress| seen.push(progress);
        let mut control = ImportControl {
            excluded: &excluded,
            known_languages: &HashSet::new(),
            stop: &stop,
            on_progress: &mut on_progress,
        };

        import_folder(folders.source.path(), &root, &mut control).unwrap();

        assert_eq!(
            seen,
            vec![
                ImportProgress {
                    done: 0,
                    total: 1,
                    is_listing: true
                },
                ImportProgress {
                    done: 1,
                    total: 1,
                    is_listing: false
                },
            ]
        );
    }
}
