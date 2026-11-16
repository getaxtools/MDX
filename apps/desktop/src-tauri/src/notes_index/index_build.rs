use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use sha2::{Digest, Sha256};

use super::excluded_paths::ExcludedPaths;
use super::index_store::{
    IndexError, IndexedFile, IndexedNote, NotesIndex, remove_note, replace_note,
};
use super::note_extraction::{ExtractedNote, extract_note};
use crate::commands::folders::is_hidden;
use crate::documents::{decode_document_bytes, is_markdown_path};
use crate::platform;

/// Notes written to the index between commits, so a long build shows its progress and can stop.
pub const NOTES_PER_COMMIT: usize = 500;
const MAX_FOLDER_DEPTH: usize = 32;
const MAX_LISTED_NOTES: usize = 100_000;

/// A note file as listed, without opening it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListedNote {
    /// The note's path inside the location, with forward slashes.
    pub path: String,
    pub size_bytes: u64,
    pub modified_at_ms: u64,
    /// Kept only in the cloud; opening it would download it, so it is indexed by name only.
    pub is_online_only: bool,
}

/// Where the notes come from: the location's folder, or a fake in tests.
pub trait NoteFolder {
    fn list_notes(&self) -> Result<Vec<ListedNote>, IndexError>;
    fn read_note(&self, path: &str) -> Result<String, IndexError>;

    /// The note's bytes as they are on disk, for changes that must keep every other byte.
    fn read_note_bytes(&self, path: &str) -> Result<Vec<u8>, IndexError> {
        self.read_note(path).map(String::into_bytes)
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct BuildProgress {
    pub indexed: usize,
    pub to_index: usize,
}

/// One note the index read or dropped, for the window and for caches built on the index.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteChange {
    pub path: String,
    pub kind: NoteChangeKind,
    /// The SHA-256 of each section, so a cache can tell which sections changed; empty when removed.
    pub section_hashes: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NoteChangeKind {
    Added,
    Changed,
    Removed,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BuildOutcome {
    pub indexed: usize,
    pub removed: usize,
    /// Notes kept only in the cloud, in the index by name but not searched.
    pub online_only: usize,
    pub was_stopped: bool,
    pub changes: Vec<NoteChange>,
}

/// Brings the index in line with the folder: notes added or changed since the last build are read
/// again, removed notes leave the index, and unchanged notes are not opened at all.
pub fn reconcile_index(
    index: &mut NotesIndex,
    folder: &dyn NoteFolder,
    should_stop: &dyn Fn() -> bool,
    report: &mut dyn FnMut(BuildProgress),
) -> Result<BuildOutcome, IndexError> {
    let listed = folder.list_notes()?;
    let indexed: HashMap<String, IndexedFile> = index.indexed_files()?.into_iter().collect();
    let (removed, changed) = differences(&indexed, &listed);
    let mut outcome = BuildOutcome {
        removed: removed.len(),
        changes: removed.iter().map(|path| removed_change(path)).collect(),
        online_only: listed.iter().filter(|note| note.is_online_only).count(),
        ..BuildOutcome::default()
    };
    remove_notes(index, &removed)?;
    for batch in changed.chunks(NOTES_PER_COMMIT) {
        if should_stop() {
            outcome.was_stopped = true;
            break;
        }
        let read = index_batch(index, folder, batch, should_stop)?;
        outcome.indexed += read.len();
        outcome
            .changes
            .extend(read.into_iter().map(|(path, section_hashes)| {
                let is_known = indexed.contains_key(&path);
                read_change(path, section_hashes, is_known)
            }));
        report(BuildProgress {
            indexed: outcome.indexed,
            to_index: changed.len(),
        });
    }
    index.release_memory()?;
    Ok(outcome)
}

/// The indexed notes no longer listed, and the listed notes the index lacks or has an older copy of.
fn differences<'notes>(
    indexed: &'notes HashMap<String, IndexedFile>,
    listed: &'notes [ListedNote],
) -> (Vec<&'notes String>, Vec<&'notes ListedNote>) {
    let listed_paths: HashSet<&str> = listed.iter().map(|note| note.path.as_str()).collect();
    let removed = indexed
        .keys()
        .filter(|path| !listed_paths.contains(path.as_str()))
        .collect();
    let changed = listed
        .iter()
        .filter(|note| {
            indexed
                .get(&note.path)
                .is_none_or(|known| has_changed(known, note))
        })
        .collect();
    (removed, changed)
}

fn removed_change(path: &str) -> NoteChange {
    NoteChange {
        path: path.to_owned(),
        kind: NoteChangeKind::Removed,
        section_hashes: Vec::new(),
    }
}

fn read_change(path: String, section_hashes: Vec<String>, was_indexed: bool) -> NoteChange {
    NoteChange {
        path,
        kind: if was_indexed {
            NoteChangeKind::Changed
        } else {
            NoteChangeKind::Added
        },
        section_hashes,
    }
}

fn has_changed(known: &IndexedFile, listed: &ListedNote) -> bool {
    known.size_bytes != listed.size_bytes || known.modified_at_ms != listed.modified_at_ms
}

fn remove_notes(index: &mut NotesIndex, paths: &[&String]) -> Result<(), IndexError> {
    let transaction = index.transaction()?;
    for path in paths {
        remove_note(&transaction, path)?;
    }
    transaction.commit()?;
    Ok(())
}

fn index_batch(
    index: &mut NotesIndex,
    folder: &dyn NoteFolder,
    batch: &[&ListedNote],
    should_stop: &dyn Fn() -> bool,
) -> Result<Vec<(String, Vec<String>)>, IndexError> {
    let transaction = index.transaction()?;
    let mut indexed = Vec::with_capacity(batch.len());
    for note in batch {
        if should_stop() {
            break;
        }
        let Some(read) = read_for_index(folder, note) else {
            continue;
        };
        let section_texts: Vec<&str> = read
            .extracted
            .sections
            .iter()
            .map(|section| read.text.get(section.bytes.clone()).unwrap_or_default())
            .collect();
        replace_note(
            &transaction,
            &IndexedNote {
                path: &note.path,
                size_bytes: note.size_bytes,
                modified_at_ms: note.modified_at_ms,
                content_hash: &read.content_hash,
                is_online_only: note.is_online_only,
                section_texts: &section_texts,
                extracted: &read.extracted,
            },
        )?;
        let section_hashes = read
            .extracted
            .sections
            .iter()
            .map(|section| section.hash.clone())
            .collect();
        indexed.push((note.path.clone(), section_hashes));
    }
    transaction.commit()?;
    Ok(indexed)
}

struct NoteForIndex {
    text: String,
    extracted: ExtractedNote,
    content_hash: String,
}

/// A note kept only in the cloud is never opened, so it is indexed by its name alone.
fn read_for_index(folder: &dyn NoteFolder, note: &ListedNote) -> Option<NoteForIndex> {
    if note.is_online_only {
        return Some(NoteForIndex {
            text: String::new(),
            extracted: ExtractedNote::default(),
            content_hash: String::new(),
        });
    }
    let text = folder.read_note(&note.path).ok()?;
    Some(NoteForIndex {
        extracted: extract_note(&text),
        content_hash: sha256_hex(text.as_bytes()),
        text,
    })
}
fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// The notes of a location on disk; listing reads only directory entries and never opens a note.
/// Excluded paths are neither listed nor read.
pub struct DiskNoteFolder {
    root: PathBuf,
    excluded: ExcludedPaths,
}

impl DiskNoteFolder {
    pub fn new(root: PathBuf, excluded: ExcludedPaths) -> Self {
        Self { root, excluded }
    }
}

impl NoteFolder for DiskNoteFolder {
    fn list_notes(&self) -> Result<Vec<ListedNote>, IndexError> {
        let mut listing = NoteListing {
            folder: self,
            notes: Vec::new(),
        };
        listing.collect(&self.root, 0)?;
        let mut notes = listing.notes;
        notes.sort_by(|first, second| first.path.cmp(&second.path));
        Ok(notes)
    }

    fn read_note(&self, path: &str) -> Result<String, IndexError> {
        Ok(decode_document_bytes(&self.read_note_bytes(path)?).text)
    }

    fn read_note_bytes(&self, path: &str) -> Result<Vec<u8>, IndexError> {
        if self.excluded.contains(path) {
            return Err(std::io::Error::from(std::io::ErrorKind::PermissionDenied).into());
        }
        Ok(fs::read(self.root.join(path))?)
    }
}

struct NoteListing<'folder> {
    folder: &'folder DiskNoteFolder,
    notes: Vec<ListedNote>,
}

impl NoteListing<'_> {
    fn collect(&mut self, folder: &Path, depth: usize) -> Result<(), IndexError> {
        if depth > MAX_FOLDER_DEPTH {
            return Ok(());
        }
        for entry in fs::read_dir(folder)?.filter_map(Result::ok) {
            if self.notes.len() >= MAX_LISTED_NOTES || is_hidden(&entry) {
                continue;
            }
            let path = entry.path();
            let Some(relative) = relative_path(&self.folder.root, &path) else {
                continue;
            };
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if self.folder.excluded.contains(&relative) {
                continue;
            }
            if file_type.is_dir() {
                self.collect(&path, depth + 1)?;
            } else if file_type.is_file()
                && is_markdown_path(&path)
                && let Some(note) = listed_note(relative, &entry)
            {
                self.notes.push(note);
            }
        }
        Ok(())
    }
}

/// The path inside the location, with forward slashes.
fn relative_path(root: &Path, path: &Path) -> Option<String> {
    let parts: Vec<String> = path
        .strip_prefix(root)
        .ok()?
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect();
    Some(parts.join("/"))
}

fn listed_note(path: String, entry: &fs::DirEntry) -> Option<ListedNote> {
    let metadata = entry.metadata().ok()?;
    let modified_at_ms = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .and_then(|elapsed| u64::try_from(elapsed.as_millis()).ok())
        .unwrap_or_default();
    Some(ListedNote {
        path,
        size_bytes: metadata.len(),
        modified_at_ms,
        is_online_only: platform::is_cloud_only(&metadata),
    })
}
#[cfg(test)]
mod tests {
    use std::cell::RefCell;

    use super::*;
    use crate::notes_index::index_store::index_file_path;

    /// Notes in memory; reading one is counted, as is any attempt on a note kept only in the cloud.
    struct FakeNoteFolder {
        notes: Vec<(ListedNote, String)>,
        reads: RefCell<Vec<String>>,
    }

    impl FakeNoteFolder {
        fn new(notes: &[(&str, &str, bool)]) -> Self {
            Self {
                notes: notes
                    .iter()
                    .map(|(path, text, is_online_only)| {
                        (
                            ListedNote {
                                path: (*path).to_owned(),
                                size_bytes: text.len() as u64,
                                modified_at_ms: 1,
                                is_online_only: *is_online_only,
                            },
                            (*text).to_owned(),
                        )
                    })
                    .collect(),
                reads: RefCell::new(Vec::new()),
            }
        }
    }

    impl NoteFolder for FakeNoteFolder {
        fn list_notes(&self) -> Result<Vec<ListedNote>, IndexError> {
            Ok(self.notes.iter().map(|(note, _)| note.clone()).collect())
        }

        fn read_note(&self, path: &str) -> Result<String, IndexError> {
            self.reads.borrow_mut().push(path.to_owned());
            Ok(self
                .notes
                .iter()
                .find(|(note, _)| note.path == path)
                .map(|(_, text)| text.clone())
                .unwrap_or_default())
        }
    }

    fn open_index(folder: &tempfile::TempDir) -> NotesIndex {
        NotesIndex::open(&index_file_path(folder.path(), "location-1"))
            .unwrap()
            .0
    }

    fn build(
        index: &mut NotesIndex,
        folder: &dyn NoteFolder,
    ) -> (BuildOutcome, Vec<BuildProgress>) {
        let mut reports = Vec::new();
        let outcome = reconcile_index(index, folder, &|| false, &mut |progress| {
            reports.push(progress)
        })
        .unwrap();
        (outcome, reports)
    }

    fn indexed_paths(index: &NotesIndex) -> Vec<String> {
        index
            .indexed_files()
            .unwrap()
            .into_iter()
            .map(|(path, _)| path)
            .collect()
    }

    #[test]
    fn indexing_leaves_every_file_and_modified_time_unchanged() {
        let location = tempfile::tempdir().unwrap();
        fs::create_dir(location.path().join("Projects")).unwrap();
        fs::write(location.path().join("Inbox.md"), "# Inbox\n[[Plan]]\n").unwrap();
        fs::write(location.path().join("Projects").join("Plan.md"), "# Plan\n").unwrap();
        let before = snapshot_of(location.path());
        let index_folder = tempfile::tempdir().unwrap();
        let mut index = open_index(&index_folder);

        let (outcome, _) = build(
            &mut index,
            &DiskNoteFolder::new(location.path().to_path_buf(), ExcludedPaths::default()),
        );

        assert_eq!(outcome.indexed, 2);
        assert_eq!(indexed_paths(&index), vec!["Inbox.md", "Projects/Plan.md"]);
        assert_eq!(snapshot_of(location.path()), before);
    }

    #[test]
    fn files_under_an_excluded_path_are_never_listed_or_opened() {
        let location = tempfile::tempdir().unwrap();
        fs::create_dir_all(location.path().join("Private").join("2026")).unwrap();
        fs::write(
            location
                .path()
                .join("Private")
                .join("2026")
                .join("Review.md"),
            "salary",
        )
        .unwrap();
        fs::write(location.path().join("Journal.md"), "# Journal\n").unwrap();
        fs::write(location.path().join("Diary.md"), "# Diary\n").unwrap();
        let excluded = ExcludedPaths::new(&["Private".to_owned(), "diary.md".to_owned()]).unwrap();
        let folder = DiskNoteFolder::new(location.path().to_path_buf(), excluded);

        let listed: Vec<String> = folder
            .list_notes()
            .unwrap()
            .into_iter()
            .map(|note| note.path)
            .collect();

        assert_eq!(listed, vec!["Journal.md"]);
        assert!(folder.read_note("Private/2026/Review.md").is_err());
        assert!(folder.read_note("Diary.md").is_err());
    }
    fn snapshot_of(folder: &Path) -> Vec<(PathBuf, Vec<u8>, std::time::SystemTime)> {
        let mut files = Vec::new();
        for entry in fs::read_dir(folder).unwrap().filter_map(Result::ok) {
            let path = entry.path();
            if path.is_dir() {
                files.extend(snapshot_of(&path));
            } else {
                let modified = fs::metadata(&path).unwrap().modified().unwrap();
                files.push((path.clone(), fs::read(&path).unwrap(), modified));
            }
        }
        files.sort();
        files
    }

    #[test]
    fn an_online_only_note_is_indexed_by_name_only() {
        let index_folder = tempfile::tempdir().unwrap();
        let mut index = open_index(&index_folder);
        let folder = FakeNoteFolder::new(&[
            ("Local.md", "# Local", false),
            ("Cloud.md", "# Cloud", true),
        ]);

        let (outcome, _) = build(&mut index, &folder);

        assert_eq!(outcome.online_only, 1);
        assert_eq!(indexed_paths(&index), vec!["Cloud.md", "Local.md"]);
        assert_eq!(*folder.reads.borrow(), vec!["Local.md".to_owned()]);
    }

    #[test]
    fn progress_is_reported_per_batch() {
        let index_folder = tempfile::tempdir().unwrap();
        let mut index = open_index(&index_folder);
        let names: Vec<String> = (0..NOTES_PER_COMMIT + 1)
            .map(|number| format!("Note {number}.md"))
            .collect();
        let notes: Vec<(&str, &str, bool)> = names
            .iter()
            .map(|name| (name.as_str(), "# Note", false))
            .collect();

        let (_, reports) = build(&mut index, &FakeNoteFolder::new(&notes));

        assert_eq!(
            reports,
            vec![
                BuildProgress {
                    indexed: NOTES_PER_COMMIT,
                    to_index: NOTES_PER_COMMIT + 1
                },
                BuildProgress {
                    indexed: NOTES_PER_COMMIT + 1,
                    to_index: NOTES_PER_COMMIT + 1
                }
            ]
        );
    }

    #[test]
    fn a_closed_workspace_stops_the_build() {
        let index_folder = tempfile::tempdir().unwrap();
        let mut index = open_index(&index_folder);
        let folder = FakeNoteFolder::new(&[("A.md", "# A", false), ("B.md", "# B", false)]);

        let outcome = reconcile_index(&mut index, &folder, &|| true, &mut |_| {}).unwrap();

        assert!(outcome.was_stopped);
        assert_eq!(outcome.indexed, 0);
        assert!(folder.reads.borrow().is_empty());
    }

    #[test]
    fn a_second_build_opens_only_the_notes_that_changed_and_drops_removed_ones() {
        let index_folder = tempfile::tempdir().unwrap();
        let mut index = open_index(&index_folder);
        build(
            &mut index,
            &FakeNoteFolder::new(&[("A.md", "# A", false), ("B.md", "# B", false)]),
        );
        let folder = FakeNoteFolder::new(&[("A.md", "# A", false), ("C.md", "# C", false)]);

        let (outcome, _) = build(&mut index, &folder);

        assert_eq!(outcome.removed, 1);
        assert_eq!(*folder.reads.borrow(), vec!["C.md".to_owned()]);
        assert_eq!(indexed_paths(&index), vec!["A.md", "C.md"]);
    }

    #[test]
    fn a_batch_reports_changed_notes_with_their_section_hashes() {
        let index_folder = tempfile::tempdir().unwrap();
        let mut index = open_index(&index_folder);
        build(&mut index, &FakeNoteFolder::new(&[("A.md", "# A", false)]));
        let folder =
            FakeNoteFolder::new(&[("A.md", "# A\n\n## Two\n", false), ("B.md", "# B", false)]);

        let (outcome, _) = build(&mut index, &folder);

        let kinds: Vec<(&str, NoteChangeKind, usize)> = outcome
            .changes
            .iter()
            .map(|change| {
                (
                    change.path.as_str(),
                    change.kind,
                    change.section_hashes.len(),
                )
            })
            .collect();
        assert_eq!(
            kinds,
            vec![
                ("A.md", NoteChangeKind::Changed, 2),
                ("B.md", NoteChangeKind::Added, 1)
            ]
        );
    }

    #[test]
    fn a_removed_note_is_reported_as_removed() {
        let index_folder = tempfile::tempdir().unwrap();
        let mut index = open_index(&index_folder);
        build(&mut index, &FakeNoteFolder::new(&[("A.md", "# A", false)]));

        let (outcome, _) = build(&mut index, &FakeNoteFolder::new(&[]));

        assert_eq!(
            outcome.changes,
            vec![NoteChange {
                path: "A.md".to_owned(),
                kind: NoteChangeKind::Removed,
                section_hashes: Vec::new()
            }]
        );
    }
}
