use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::file_placement::{CopiedContent, Placement, place_copy};
use super::folder_walk::{WalkedFile, canonical_even_if_missing, is_same_or_inside, walk_folder};
use crate::documents::{DocumentError, MAX_DOCUMENT_BYTES, is_markdown_path};
use crate::notes::NotesRoot;
use crate::notes_index::{
    ExcludedPaths, KnownNote, LinkTargets, aliases_of, attachment_references_of,
    with_relative_links,
};

/// What is exported: one note with its child notes and the files it shows, a folder, or everything.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExportItem {
    Note(PathBuf),
    Folder(PathBuf),
    Location,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ExportOptions {
    /// Turn wiki-links into relative Markdown links; otherwise every file keeps its bytes.
    pub use_relative_links: bool,
    /// The user agreed to replace files already in the destination.
    pub replace_existing: bool,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSummary {
    pub exported_files: usize,
    /// The folder the files went into.
    pub folder: String,
    /// Files a single note shows from outside its folder, which are not copied.
    pub attachments_left_out: usize,
    /// Files under an excluded path, which export never reads.
    pub excluded_left_out: usize,
    pub failed_files: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "outcome",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ExportOutcome {
    Exported(ExportSummary),
    /// Nothing was written: this many files are already in the destination, so the user is asked first.
    ExistingFiles {
        count: usize,
    },
}

/// A file to export: where it is, its path inside the location and where it goes.
struct ExportedFile {
    source: PathBuf,
    in_location: String,
    output: PathBuf,
}

struct ExportPlan {
    files: Vec<ExportedFile>,
    folder: PathBuf,
    attachments_left_out: usize,
    excluded_left_out: usize,
}

pub struct ExportRequest<'request> {
    pub item: &'request ExportItem,
    /// A folder outside the location.
    pub destination: &'request Path,
    /// The location's excluded paths, whose files are never read or exported.
    pub excluded: &'request ExcludedPaths,
    pub options: ExportOptions,
}

/// Copies notes and their attachments to a folder outside the location, keeping their folders.
/// Files already there are replaced only once the user agreed.
pub fn export_notes(
    root: &NotesRoot,
    request: &ExportRequest<'_>,
) -> Result<ExportOutcome, DocumentError> {
    let ExportRequest {
        item,
        destination,
        excluded,
        options,
    } = *request;
    let destination = dunce::canonicalize(destination)?;
    if !destination.is_dir() {
        return Err(DocumentError::NotFound);
    }
    let plan = plan_export(root, item, &destination, excluded)?;
    if writes_into_location(root, &plan)? {
        return Err(DocumentError::DestinationOverlapsLocation);
    }
    let existing = plan
        .files
        .iter()
        .filter(|file| file.output.exists())
        .count();
    if existing > 0 && !options.replace_existing {
        return Ok(ExportOutcome::ExistingFiles { count: existing });
    }
    let notes = if options.use_relative_links {
        known_notes(root, excluded)?
    } else {
        Vec::new()
    };
    let exported: HashSet<String> = plan
        .files
        .iter()
        .map(|file| file.in_location.to_lowercase())
        .collect();
    let targets = LinkTargets {
        notes: &notes,
        exported: &exported,
    };
    Ok(ExportOutcome::Exported(write_export(
        root, &plan, &targets, options,
    )))
}

/// Whether any output, or the folder they go into, is the location or inside it. Each path is
/// resolved through its nearest existing folder, so a junction or a note named like the location's
/// folder cannot lead the export back into the notes.
fn writes_into_location(root: &NotesRoot, plan: &ExportPlan) -> Result<bool, DocumentError> {
    for path in std::iter::once(&plan.folder).chain(plan.files.iter().map(|file| &file.output)) {
        if is_same_or_inside(&canonical_even_if_missing(path)?, root.folder()) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn plan_export(
    root: &NotesRoot,
    item: &ExportItem,
    destination: &Path,
    excluded: &ExcludedPaths,
) -> Result<ExportPlan, DocumentError> {
    let (files, folder, attachments_left_out) = match item {
        ExportItem::Location => {
            let folder = destination.join(root.folder().file_name().unwrap_or_default());
            (files_in_folder(root, root.folder(), &folder)?, folder, 0)
        }
        ExportItem::Folder(path) => {
            let source = root.resolve_inside(path)?;
            if !source.is_dir() {
                return Err(DocumentError::NotFound);
            }
            let folder = destination.join(source.file_name().unwrap_or_default());
            (files_in_folder(root, &source, &folder)?, folder, 0)
        }
        ExportItem::Note(path) => {
            let note = root.resolve_inside(path)?;
            if excluded.contains(&in_location_of(root, &note)) {
                return Ok(ExportPlan {
                    files: Vec::new(),
                    folder: destination.to_path_buf(),
                    attachments_left_out: 0,
                    excluded_left_out: 1,
                });
            }
            let (files, left_out) = files_of_note(root, &note, destination)?;
            (files, destination.to_path_buf(), left_out)
        }
    };
    let (kept, excluded_left_out) = without_excluded(files, excluded);
    Ok(ExportPlan {
        files: kept,
        folder,
        attachments_left_out,
        excluded_left_out,
    })
}

fn without_excluded(
    files: Vec<ExportedFile>,
    excluded: &ExcludedPaths,
) -> (Vec<ExportedFile>, usize) {
    let total = files.len();
    let kept: Vec<ExportedFile> = files
        .into_iter()
        .filter(|file| !excluded.contains(&file.in_location))
        .collect();
    let left_out = total - kept.len();
    (kept, left_out)
}

fn in_location_of(root: &NotesRoot, path: &Path) -> String {
    path.strip_prefix(root.folder())
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn joined(folder: &Path, relative: &str) -> PathBuf {
    relative
        .split('/')
        .fold(folder.to_path_buf(), |path, part| path.join(part))
}

fn files_in_folder(
    root: &NotesRoot,
    source: &Path,
    output: &Path,
) -> Result<Vec<ExportedFile>, DocumentError> {
    Ok(walk_folder(source)?
        .files
        .into_iter()
        .map(|WalkedFile { path, relative }| ExportedFile {
            in_location: in_location_of(root, &path),
            output: joined(output, &relative),
            source: path,
        })
        .collect())
}

/// The note, the folder of its child notes, and the files it shows or links to from its own folder
/// or below; files elsewhere would need paths outside the destination, so they are counted instead.
fn files_of_note(
    root: &NotesRoot,
    note: &Path,
    destination: &Path,
) -> Result<(Vec<ExportedFile>, usize), DocumentError> {
    if !is_markdown_path(note) || !note.is_file() {
        return Err(DocumentError::NotMarkdown);
    }
    let note_folder = note.parent().unwrap_or(root.folder()).to_path_buf();
    let mut sources = vec![note.to_path_buf()];
    let children = note.with_extension("");
    if children.is_dir() {
        sources.extend(
            walk_folder(&children)?
                .files
                .into_iter()
                .map(|file| file.path),
        );
    }
    let (attachments, left_out) = attachments_of(note, &note_folder)?;
    sources.extend(attachments);
    sources.sort();
    sources.dedup();
    let files = sources
        .into_iter()
        .map(|source| ExportedFile {
            in_location: in_location_of(root, &source),
            output: destination.join(source.strip_prefix(&note_folder).unwrap_or(&source)),
            source,
        })
        .collect();
    Ok((files, left_out))
}

fn attachments_of(note: &Path, note_folder: &Path) -> Result<(Vec<PathBuf>, usize), DocumentError> {
    let text = String::from_utf8_lossy(&fs::read(note)?).into_owned();
    let references = attachment_references_of(&text);
    let mut found = Vec::new();
    let mut left_out = 0;
    for address in &references.addresses {
        match attachment_at(note_folder, address) {
            Some(path) if is_same_or_inside(&path, note_folder) => found.push(path),
            Some(_) => left_out += 1,
            None => {}
        }
    }
    if !references.embedded_names.is_empty() {
        let files = walk_folder(note_folder)?.files;
        for name in &references.embedded_names {
            match files.iter().find(|file| is_file_named(&file.path, name)) {
                Some(file) => found.push(file.path.clone()),
                None => left_out += 1,
            }
        }
    }
    Ok((found, left_out))
}

/// An existing file the address points at, never one of the notes themselves.
fn attachment_at(note_folder: &Path, address: &str) -> Option<PathBuf> {
    let path = dunce::canonicalize(joined(note_folder, &address.replace('\\', "/"))).ok()?;
    (path.is_file() && !is_markdown_path(&path)).then_some(path)
}

fn is_file_named(path: &Path, name: &str) -> bool {
    path.file_name()
        .is_some_and(|file_name| file_name.to_string_lossy().eq_ignore_ascii_case(name))
}

/// Every note of the location with its aliases, for resolving wiki-links as the app does.
fn known_notes(
    root: &NotesRoot,
    excluded: &ExcludedPaths,
) -> Result<Vec<KnownNote>, DocumentError> {
    Ok(walk_folder(root.folder())?
        .files
        .into_iter()
        .filter(|file| is_markdown_path(&file.path) && !excluded.contains(&file.relative))
        .map(|file| KnownNote {
            aliases: readable_text(&file.path)
                .map(|text| aliases_of(&text))
                .unwrap_or_default(),
            path: file.relative,
        })
        .collect())
}

fn readable_text(path: &Path) -> Option<String> {
    let is_small_enough =
        fs::metadata(path).is_ok_and(|metadata| metadata.len() <= MAX_DOCUMENT_BYTES);
    String::from_utf8(fs::read(path).ok().filter(|_| is_small_enough)?).ok()
}

fn write_export(
    root: &NotesRoot,
    plan: &ExportPlan,
    targets: &LinkTargets<'_>,
    options: ExportOptions,
) -> ExportSummary {
    let placement = if options.replace_existing {
        Placement::Replacing
    } else {
        Placement::OnlyIfFree
    };
    let mut summary = ExportSummary {
        folder: plan.folder.to_string_lossy().into_owned(),
        attachments_left_out: plan.attachments_left_out,
        excluded_left_out: plan.excluded_left_out,
        ..ExportSummary::default()
    };
    for file in &plan.files {
        let converted = converted_text(file, targets, options);
        let content = converted
            .as_deref()
            .map_or(CopiedContent::BytesOf(&file.source), |text| {
                CopiedContent::Bytes(text.as_bytes())
            });
        let written = prepared_folder_of(root, &file.output)
            .and_then(|()| place_copy(&content, &file.output, placement));
        match written {
            Ok(_) => summary.exported_files += 1,
            Err(_) => summary.failed_files.push(file.in_location.clone()),
        }
    }
    summary
}

/// The note with relative links when that was chosen and its links changed; otherwise the bytes stay.
fn converted_text(
    file: &ExportedFile,
    targets: &LinkTargets<'_>,
    options: ExportOptions,
) -> Option<String> {
    if !options.use_relative_links || !is_markdown_path(&file.source) {
        return None;
    }
    with_relative_links(&readable_text(&file.source)?, &file.in_location, targets)
}

/// Makes the output's folder and checks once more that it is outside the location, so a junction
/// in the destination cannot lead a copy into the notes.
fn prepared_folder_of(root: &NotesRoot, output: &Path) -> Result<(), DocumentError> {
    let folder = output.parent().ok_or(DocumentError::InvalidRequest)?;
    fs::create_dir_all(folder)?;
    if is_same_or_inside(&dunce::canonicalize(folder)?, root.folder()) {
        return Err(DocumentError::DestinationOverlapsLocation);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Folders {
        location: tempfile::TempDir,
        destination: tempfile::TempDir,
    }

    impl Folders {
        fn new() -> Self {
            Self {
                location: tempfile::tempdir().unwrap(),
                destination: tempfile::tempdir().unwrap(),
            }
        }

        fn write(&self, relative: &str, bytes: &[u8]) -> PathBuf {
            let path = self.location.path().join(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, bytes).unwrap();
            path
        }

        fn export(
            &self,
            item: &ExportItem,
            options: ExportOptions,
        ) -> Result<ExportOutcome, DocumentError> {
            self.export_excluding(item, options, &[])
        }

        fn export_excluding(
            &self,
            item: &ExportItem,
            options: ExportOptions,
            excluded: &[&str],
        ) -> Result<ExportOutcome, DocumentError> {
            let root = NotesRoot::new(self.location.path()).unwrap();
            let excluded = ExcludedPaths::new(
                &excluded
                    .iter()
                    .map(|path| (*path).to_owned())
                    .collect::<Vec<_>>(),
            )
            .unwrap();
            export_notes(
                &root,
                &ExportRequest {
                    item,
                    destination: self.destination.path(),
                    excluded: &excluded,
                    options,
                },
            )
        }

        fn exported(&self, relative: &str) -> Vec<u8> {
            fs::read(self.destination.path().join(relative)).unwrap()
        }
    }

    const PLAN: &[u8] =
        b"\xef\xbb\xbf# Plan\r\n\r\nSee [[Budget]] and ![chart](images/chart.png).\r\n";

    #[test]
    fn default_export_is_byte_equal() {
        let folders = Folders::new();
        folders.write("Projects/Plan.md", PLAN);
        folders.write("Projects/images/chart.png", &[1, 2, 3]);

        let outcome = folders.export(
            &ExportItem::Folder(folders.location.path().join("Projects")),
            ExportOptions::default(),
        );

        assert!(matches!(
            outcome,
            Ok(ExportOutcome::Exported(ExportSummary {
                exported_files: 2,
                ..
            }))
        ));
        assert_eq!(folders.exported("Projects/Plan.md"), PLAN);
        assert_eq!(folders.exported("Projects/images/chart.png"), [1, 2, 3]);
    }

    #[test]
    fn relative_links_are_written_only_when_chosen() {
        let folders = Folders::new();
        folders.write("Projects/Plan.md", b"See [[Budget]].\n");
        folders.write("Finance/Budget.md", b"# Budget\n");
        let options = ExportOptions {
            use_relative_links: true,
            ..ExportOptions::default()
        };

        folders.export(&ExportItem::Location, options).unwrap();

        let location_name = folders
            .location
            .path()
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        assert_eq!(
            folders.exported(&format!("{location_name}/Projects/Plan.md")),
            b"See [Budget](../Finance/Budget.md).\n"
        );
    }

    #[test]
    fn a_note_goes_with_its_child_notes_and_the_files_it_shows_from_its_folder() {
        let folders = Folders::new();
        let note = folders.write("Projects/Plan.md", PLAN);
        folders.write("Projects/images/chart.png", &[1]);
        folders.write("Projects/Plan/Step one.md", b"one");
        folders.write("Projects/Other.md", b"not exported");

        folders
            .export(&ExportItem::Note(note), ExportOptions::default())
            .unwrap();

        assert_eq!(folders.exported("Plan.md"), PLAN);
        assert_eq!(folders.exported("images/chart.png"), [1]);
        assert_eq!(folders.exported("Plan/Step one.md"), b"one");
        assert!(!folders.destination.path().join("Other.md").exists());
    }

    #[test]
    fn existing_files_are_never_replaced_without_asking() {
        let folders = Folders::new();
        let note = folders.write("Plan.md", b"new");
        fs::write(folders.destination.path().join("Plan.md"), b"kept").unwrap();

        let asked = folders.export(&ExportItem::Note(note.clone()), ExportOptions::default());
        let kept = folders.exported("Plan.md");
        let replaced = folders.export(
            &ExportItem::Note(note),
            ExportOptions {
                replace_existing: true,
                ..ExportOptions::default()
            },
        );

        assert_eq!(asked, Ok(ExportOutcome::ExistingFiles { count: 1 }));
        assert_eq!(kept, b"kept");
        assert!(matches!(replaced, Ok(ExportOutcome::Exported(_))));
        assert_eq!(folders.exported("Plan.md"), b"new");
    }

    #[test]
    fn a_destination_inside_the_location_is_refused() {
        let folders = Folders::new();
        folders.write("Plan.md", b"x");
        let inside = folders.location.path().join("Exports");
        fs::create_dir_all(&inside).unwrap();
        let root = NotesRoot::new(folders.location.path()).unwrap();

        let result = export_notes(
            &root,
            &ExportRequest {
                item: &ExportItem::Location,
                destination: &inside,
                excluded: &ExcludedPaths::default(),
                options: ExportOptions::default(),
            },
        );

        assert_eq!(result, Err(DocumentError::DestinationOverlapsLocation));
        assert!(fs::read_dir(&inside).unwrap().next().is_none());
    }

    #[test]
    fn a_note_named_like_the_location_exported_to_its_parent_is_refused_and_writes_nothing() {
        let work = tempfile::tempdir().unwrap();
        let location = work.path().join("Notes");
        fs::create_dir_all(location.join("Notes")).unwrap();
        fs::write(location.join("Notes.md"), b"parent").unwrap();
        fs::write(location.join("Notes").join("Child.md"), b"child").unwrap();
        let root = NotesRoot::new(&location).unwrap();

        let result = export_notes(
            &root,
            &ExportRequest {
                item: &ExportItem::Note(location.join("Notes.md")),
                destination: work.path(),
                excluded: &ExcludedPaths::default(),
                options: ExportOptions {
                    replace_existing: true,
                    ..ExportOptions::default()
                },
            },
        );

        assert_eq!(result, Err(DocumentError::DestinationOverlapsLocation));
        assert!(!work.path().join("Notes.md").exists());
        assert_eq!(
            fs::read(location.join("Notes").join("Child.md")).unwrap(),
            b"child"
        );
    }

    #[cfg(windows)]
    #[test]
    fn a_junction_in_the_destination_cannot_lead_the_export_into_the_location() {
        let folders = Folders::new();
        let projects = folders.write("Projects/Plan.md", b"plan");
        assert!(
            crate::notes_transfer::folder_walk::make_junction(
                &folders.destination.path().join("Projects"),
                folders.location.path(),
            )
            .unwrap()
        );

        let result = folders.export(
            &ExportItem::Folder(projects.parent().unwrap().to_path_buf()),
            ExportOptions::default(),
        );

        assert_eq!(result, Err(DocumentError::DestinationOverlapsLocation));
        assert!(!folders.location.path().join("Plan.md").exists());
    }

    #[test]
    fn a_note_under_an_excluded_path_is_not_exported() {
        let folders = Folders::new();
        let note = folders.write("Private/Salary.md", b"secret");

        let outcome = folders.export_excluding(
            &ExportItem::Note(note),
            ExportOptions::default(),
            &["Private"],
        );

        assert!(matches!(
            outcome,
            Ok(ExportOutcome::Exported(ExportSummary {
                exported_files: 0,
                excluded_left_out: 1,
                ..
            }))
        ));
        assert!(
            fs::read_dir(folders.destination.path())
                .unwrap()
                .next()
                .is_none()
        );
    }

    #[test]
    fn a_link_to_a_note_outside_the_export_stays_a_wiki_link() {
        let folders = Folders::new();
        folders.write("Projects/Plan.md", b"See [[Budget]] and [[Steps]].\n");
        folders.write("Projects/Steps.md", b"# Steps\n");
        folders.write("Finance/Budget.md", b"# Budget\n");

        folders
            .export(
                &ExportItem::Folder(folders.location.path().join("Projects")),
                ExportOptions {
                    use_relative_links: true,
                    ..ExportOptions::default()
                },
            )
            .unwrap();

        assert_eq!(
            folders.exported("Projects/Plan.md"),
            b"See [[Budget]] and [Steps](Steps.md).\n"
        );
    }

    #[test]
    fn excluded_paths_and_dot_folders_are_left_out() {
        let folders = Folders::new();
        folders.write("Plan.md", b"x");
        folders.write("Private/Salary.md", b"secret");
        folders.write(".mdx-notes/marker.json", b"{}");

        let outcome = folders.export_excluding(
            &ExportItem::Location,
            ExportOptions::default(),
            &["Private"],
        );

        let location_name = folders
            .location
            .path()
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let exported = folders.destination.path().join(&location_name);
        assert!(exported.join("Plan.md").exists());
        assert!(!exported.join("Private").exists());
        assert!(!exported.join(".mdx-notes").exists());
        assert!(matches!(
            outcome,
            Ok(ExportOutcome::Exported(ExportSummary {
                excluded_left_out: 1,
                ..
            }))
        ));
    }

    #[test]
    fn the_location_is_unchanged_by_an_export() {
        let folders = Folders::new();
        folders.write("Projects/Plan.md", PLAN);
        let before = walk_folder(folders.location.path()).unwrap().files;

        folders
            .export(
                &ExportItem::Location,
                ExportOptions {
                    use_relative_links: true,
                    ..ExportOptions::default()
                },
            )
            .unwrap();

        assert_eq!(walk_folder(folders.location.path()).unwrap().files, before);
        assert_eq!(
            fs::read(folders.location.path().join("Projects/Plan.md")).unwrap(),
            PLAN
        );
    }
}
