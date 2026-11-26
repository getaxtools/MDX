//! Run with `cargo test --release --lib index_benchmark -- --ignored --nocapture`; it prints the numbers
//! the design records and fails when a search or suggestion is slower than the targets.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::index_build::{BuildProgress, ListedNote, NoteFolder, reconcile_index};
use super::index_store::{IndexError, NotesIndex, index_file_path};
use super::note_links::suggest_notes;
use super::note_search::{parse_query, search_notes};

const NOTE_COUNTS: [usize; 3] = [1_000, 10_000, 50_000];
const SEARCH_TARGET: Duration = Duration::from_millis(200);
const SUGGESTION_TARGET: Duration = Duration::from_millis(100);
const QUERY_RUNS: u32 = 20;
const NOTES_PER_FOLDER: usize = 250;
const TOPICS: [&str; 8] = [
    "budget", "travel", "garden", "reading", "project", "health", "meeting", "recipe",
];

const CHANGED_NOTES: usize = 500;

/// Synthetic notes, as a notes folder of that size might hold: folders, headings, links and tags.
struct SyntheticNotes(HashMap<String, String>);

impl SyntheticNotes {
    /// The same notes after the first ones were edited, as after a day of writing.
    fn with_edited(&self, count: usize) -> Self {
        let mut notes = self.0.clone();
        for (path, text) in &mut notes {
            if note_number(path) < count {
                text.push_str("\nAn edit about the garden.\n");
            }
        }
        Self(notes)
    }

    fn new(count: usize) -> Self {
        let notes = (0..count)
            .map(|number| {
                let topic = TOPICS[number % TOPICS.len()];
                let path = format!("Folder {}/Note {number} {topic}.md", number / NOTES_PER_FOLDER);
                let text = format!(
                    "---\naliases: [{topic} {number}]\n---\n# Note {number}\n\nA few lines about {topic} and the week.\n\n\
                     ## Details\n\nSee [[Note {} {}]] and #{topic}/area{}.\n\n- [ ] Follow up on {topic}\n",
                    (number + 1) % count,
                    TOPICS[(number + 1) % TOPICS.len()],
                    number % 5,
                );
                (path, text)
            })
            .collect();
        Self(notes)
    }
}

impl NoteFolder for SyntheticNotes {
    fn list_notes(&self) -> Result<Vec<ListedNote>, IndexError> {
        Ok(self
            .0
            .iter()
            .map(|(path, text)| ListedNote {
                path: path.clone(),
                size_bytes: text.len() as u64,
                modified_at_ms: text.len() as u64,
                is_online_only: false,
            })
            .collect())
    }

    fn read_note(&self, path: &str) -> Result<String, IndexError> {
        Ok(self.0.get(path).cloned().unwrap_or_default())
    }
}

/// The index file and its write-ahead log, which holds recent pages until SQLite copies them over.
fn index_size_bytes(file_path: &Path) -> u64 {
    [
        PathBuf::from(file_path),
        PathBuf::from(format!("{}-wal", file_path.display())),
    ]
    .iter()
    .filter_map(|path| fs::metadata(path).ok())
    .map(|metadata| metadata.len())
    .sum()
}

fn note_number(path: &str) -> usize {
    path.split(['/', ' '])
        .nth(3)
        .and_then(|number| number.parse().ok())
        .unwrap_or(usize::MAX)
}

fn average(runs: u32, mut work: impl FnMut()) -> Duration {
    let started = Instant::now();
    for _ in 0..runs {
        work();
    }
    started.elapsed() / runs
}

#[test]
#[ignore = "a benchmark; run it by hand in a release build"]
fn index_benchmark() {
    for count in NOTE_COUNTS {
        let folder = tempfile::tempdir().unwrap();
        let file_path = index_file_path(folder.path(), "benchmark");
        let mut index = NotesIndex::open(&file_path).unwrap().0;
        let notes = SyntheticNotes::new(count);

        let started = Instant::now();
        reconcile_index(&mut index, &notes, &|| false, &mut |_: BuildProgress| {}).unwrap();
        let build = started.elapsed();
        let size_kib = index_size_bytes(&file_path) / 1024;
        let edited = notes.with_edited(CHANGED_NOTES);
        let started = Instant::now();
        let outcome =
            reconcile_index(&mut index, &edited, &|| false, &mut |_: BuildProgress| {}).unwrap();
        let reindex = started.elapsed();
        assert_eq!(outcome.indexed, CHANGED_NOTES.min(count));
        let query = parse_query("garden week");
        let search = average(QUERY_RUNS, || {
            search_notes(index.connection(), &edited, &query).unwrap();
        });
        let suggestions = average(QUERY_RUNS, || {
            suggest_notes(index.connection(), "note 12", "Folder 3/Note 800 budget.md").unwrap();
        });

        println!(
            "{count} notes: build {build:?}, {CHANGED_NOTES} edited {reindex:?}, index {size_kib} KiB, search {search:?}, suggestions {suggestions:?}"
        );
        if count == 50_000 {
            assert!(search < SEARCH_TARGET, "search took {search:?}");
            assert!(
                suggestions < SUGGESTION_TARGET,
                "suggestions took {suggestions:?}"
            );
        }
    }
}
