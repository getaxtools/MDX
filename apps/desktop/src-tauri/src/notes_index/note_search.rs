use std::collections::BTreeMap;

use rusqlite::{Connection, params_from_iter, types::Value};
use serde::Serialize;
use unicode_normalization::UnicodeNormalization;

use super::index_build::NoteFolder;
use super::index_store::IndexError;

/// Hits a search returns at most; more are left out and the results say so.
pub const MAX_SEARCH_HITS: usize = 200;
/// The index's matches are almost always confirmed by the text, so twice the hits is enough to read.
const MAX_CANDIDATE_SECTIONS: usize = 2 * MAX_SEARCH_HITS;
const MAX_MATCHES_PER_HIT: usize = 5;
const MAX_PREVIEW_CHARACTERS: usize = 200;
const PREVIEW_CONTEXT_CHARACTERS: usize = 40;
const TAG_FILTER: &str = "tag:";
const PATH_FILTER: &str = "path:";

/// A search as typed: words to find, with `tag:` and `path:` filters among them.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct NoteQuery {
    /// Lowercased, accents removed, in the order typed.
    pub terms: Vec<Vec<char>>,
    pub tags: Vec<String>,
    /// Folders inside the location, with forward slashes.
    pub folders: Vec<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLineMatch {
    /// Counted from 1 over the whole note.
    pub line_number: usize,
    pub preview: String,
    /// Where the found words start and end in the preview, in characters.
    pub ranges: Vec<(usize, usize)>,
}

/// A section of a note holding every word searched for.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSearchHit {
    pub path: String,
    /// The heading the hit is under, by its place among the note's headings; none before the first.
    pub heading_position: Option<usize>,
    pub heading: Option<String>,
    pub matches: Vec<NoteLineMatch>,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSearchResults {
    pub hits: Vec<NoteSearchHit>,
    /// A limit stopped the search, so there may be more hits.
    pub is_incomplete: bool,
    /// Notes kept only in the cloud, which a search never opens.
    pub not_searched_online_only: usize,
}

pub fn parse_query(text: &str) -> NoteQuery {
    let mut query = NoteQuery::default();
    for word in text.split_whitespace() {
        if let Some(tag) = word
            .strip_prefix(TAG_FILTER)
            .map(|tag| tag.trim_start_matches('#'))
        {
            if !tag.is_empty() {
                query.tags.push(tag.to_owned());
            }
        } else if let Some(folder) = word.strip_prefix(PATH_FILTER) {
            let folder = folder.replace('\\', "/").trim_matches('/').to_owned();
            if !folder.is_empty() {
                query.folders.push(folder);
            }
        } else {
            query.terms.push(
                comparable(word)
                    .into_iter()
                    .map(|(character, _)| character)
                    .collect(),
            );
        }
    }
    query.terms.retain(|term| !term.is_empty());
    query
}

/// Finds sections holding every word of the query; the index proposes them and the notes confirm them.
pub fn search_notes(
    connection: &Connection,
    folder: &dyn NoteFolder,
    query: &NoteQuery,
) -> Result<NoteSearchResults, IndexError> {
    let mut results = NoteSearchResults {
        not_searched_online_only: online_only_count(connection)?,
        ..NoteSearchResults::default()
    };
    if query.terms.is_empty() && query.tags.is_empty() && query.folders.is_empty() {
        return Ok(results);
    }
    let candidates = candidate_sections(connection, query)?;
    results.is_incomplete = candidates.len() == MAX_CANDIDATE_SECTIONS;
    for (path, sections) in group_by_note(candidates) {
        let Ok(text) = folder.read_note(&path) else {
            continue;
        };
        for section in sections {
            if results.hits.len() == MAX_SEARCH_HITS {
                results.is_incomplete = true;
                return Ok(results);
            }
            if let Some(hit) = confirmed_hit(&path, &text, section, &query.terms) {
                results.hits.push(hit);
            }
        }
    }
    Ok(results)
}

#[derive(Debug)]
struct CandidateSection {
    heading_position: Option<usize>,
    heading: Option<String>,
    start_byte: usize,
    end_byte: usize,
}

fn online_only_count(connection: &Connection) -> Result<usize, IndexError> {
    let count: i64 = connection.query_row(
        "SELECT count(*) FROM notes WHERE is_online_only = 1",
        [],
        |row| row.get(0),
    )?;
    Ok(usize::try_from(count).unwrap_or_default())
}

/// Sections the index proposes, best first. Scripts written without spaces, such as Japanese,
/// are not split into words by the index, so for them every section of the filtered notes is read.
fn candidate_sections(
    connection: &Connection,
    query: &NoteQuery,
) -> Result<Vec<(String, CandidateSection)>, IndexError> {
    let mut sql = String::from(
        "SELECT notes.path, sections.heading_position, headings.text, sections.start_byte, sections.end_byte
         FROM sections
         JOIN notes ON notes.id = sections.note_id
         LEFT JOIN headings ON headings.note_id = sections.note_id AND headings.position = sections.heading_position",
    );
    let mut values: Vec<Value> = Vec::new();
    let match_expression = match_expression_of(&query.terms);
    if let Some(expression) = &match_expression {
        sql.push_str(
            " JOIN section_terms ON section_terms.rowid = sections.id AND section_terms MATCH ?",
        );
        values.push(Value::Text(expression.clone()));
    }
    sql.push_str(" WHERE notes.is_online_only = 0");
    if query.terms.is_empty() {
        sql.push_str(" AND sections.position = 0");
    }
    append_filters(&mut sql, &mut values, query);
    sql.push_str(if match_expression.is_some() {
        " ORDER BY bm25(section_terms)"
    } else {
        " ORDER BY notes.path, sections.position"
    });
    sql.push_str(&format!(" LIMIT {MAX_CANDIDATE_SECTIONS}"));
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(params_from_iter(values), |row| {
        Ok((
            row.get::<_, String>(0)?,
            CandidateSection {
                heading_position: row
                    .get::<_, Option<i64>>(1)?
                    .and_then(|position| usize::try_from(position).ok()),
                heading: row.get(2)?,
                start_byte: usize::try_from(row.get::<_, i64>(3)?).unwrap_or_default(),
                end_byte: usize::try_from(row.get::<_, i64>(4)?).unwrap_or_default(),
            },
        ))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Every word must be found; the last may be the start of a word still being typed.
fn match_expression_of(terms: &[Vec<char>]) -> Option<String> {
    if terms.is_empty()
        || terms.iter().any(|term| {
            term.iter()
                .any(|character| is_written_without_spaces(*character))
        })
    {
        return None;
    }
    let last = terms.len() - 1;
    let parts: Vec<String> = terms
        .iter()
        .enumerate()
        .map(|(index, term)| {
            let quoted = format!(
                "\"{}\"",
                term.iter().collect::<String>().replace('"', "\"\"")
            );
            if index == last {
                format!("{quoted}*")
            } else {
                quoted
            }
        })
        .collect();
    Some(parts.join(" "))
}

fn append_filters(sql: &mut String, values: &mut Vec<Value>, query: &NoteQuery) {
    for tag in &query.tags {
        sql.push_str(
            " AND notes.id IN (SELECT note_id FROM tags WHERE tag = ? COLLATE NOCASE OR tag LIKE ? ESCAPE '\\' COLLATE NOCASE)",
        );
        values.push(Value::Text(tag.clone()));
        values.push(Value::Text(format!("{}/%", escaped_for_like(tag))));
    }
    for folder in &query.folders {
        sql.push_str(" AND notes.path LIKE ? ESCAPE '\\' COLLATE NOCASE");
        values.push(Value::Text(format!("{}/%", escaped_for_like(folder))));
    }
}

fn escaped_for_like(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn group_by_note(
    candidates: Vec<(String, CandidateSection)>,
) -> BTreeMap<String, Vec<CandidateSection>> {
    let mut by_note: BTreeMap<String, Vec<CandidateSection>> = BTreeMap::new();
    for (path, section) in candidates {
        by_note.entry(path).or_default().push(section);
    }
    by_note
}

fn confirmed_hit(
    path: &str,
    text: &str,
    section: CandidateSection,
    terms: &[Vec<char>],
) -> Option<NoteSearchHit> {
    let section_text = text.get(section.start_byte..section.end_byte)?;
    let first_line = text.get(..section.start_byte)?.matches('\n').count();
    let matches = matching_lines(section_text, first_line, terms);
    let holds_every_term = terms.is_empty()
        || terms
            .iter()
            .all(|term| contains(&comparable(section_text), term));
    if !holds_every_term {
        return None;
    }
    Some(NoteSearchHit {
        path: path.to_owned(),
        heading_position: section.heading_position,
        heading: section.heading,
        matches,
    })
}

fn matching_lines(
    section_text: &str,
    first_line: usize,
    terms: &[Vec<char>],
) -> Vec<NoteLineMatch> {
    section_text
        .lines()
        .enumerate()
        .filter_map(|(index, line)| {
            let characters: Vec<char> = line.chars().collect();
            let ranges = term_ranges(line, terms);
            (!ranges.is_empty()).then(|| preview_of(first_line + index + 1, &characters, &ranges))
        })
        .take(MAX_MATCHES_PER_HIT)
        .collect()
}

/// Where the terms are in a line, in characters of the line as written.
fn term_ranges(line: &str, terms: &[Vec<char>]) -> Vec<(usize, usize)> {
    let folded = comparable(line);
    let mut ranges: Vec<(usize, usize)> = terms
        .iter()
        .flat_map(|term| occurrences(&folded, term))
        .collect();
    ranges.sort_unstable();
    ranges.dedup();
    ranges
}

fn occurrences(folded: &[(char, usize)], term: &[char]) -> Vec<(usize, usize)> {
    if term.is_empty() {
        return Vec::new();
    }
    folded
        .windows(term.len())
        .filter(|window| {
            window
                .iter()
                .map(|(character, _)| character)
                .eq(term.iter())
        })
        .filter_map(|window| Some((window.first()?.1, window.last()?.1 + 1)))
        .collect()
}

fn contains(folded: &[(char, usize)], term: &[char]) -> bool {
    !occurrences(folded, term).is_empty()
}

/// Each character lowercased with its accent removed, paired with where it is in the text;
/// accents written as separate marks are skipped, other marks such as Indic vowel signs stay.
fn comparable(text: &str) -> Vec<(char, usize)> {
    text.chars()
        .enumerate()
        .filter(|(_, character)| !is_latin_accent(*character))
        .map(|(index, character)| (folded(character), index))
        .collect()
}

fn folded(character: char) -> char {
    let base = std::iter::once(character)
        .nfd()
        .find(|part| !is_latin_accent(*part))
        .unwrap_or(character);
    let mut lower = base.to_lowercase();
    match (lower.next(), lower.next()) {
        (Some(single), None) => single,
        _ => base,
    }
}

fn is_latin_accent(character: char) -> bool {
    matches!(character, '\u{0300}'..='\u{036F}')
}

/// Han, kana and Thai are written without spaces between words.
fn is_written_without_spaces(character: char) -> bool {
    matches!(
        character,
        '\u{3040}'..='\u{30FF}' | '\u{3400}'..='\u{4DBF}' | '\u{4E00}'..='\u{9FFF}' | '\u{F900}'..='\u{FAFF}' | '\u{0E00}'..='\u{0E7F}'
    )
}

fn preview_of(line_number: usize, line: &[char], ranges: &[(usize, usize)]) -> NoteLineMatch {
    let first_start = ranges.first().map_or(0, |(start, _)| *start);
    let window_start = if line.len() > MAX_PREVIEW_CHARACTERS {
        first_start.saturating_sub(PREVIEW_CONTEXT_CHARACTERS)
    } else {
        0
    };
    let window_end = (window_start + MAX_PREVIEW_CHARACTERS).min(line.len());
    let window = line.get(window_start..window_end).unwrap_or_default();
    let leading_spaces = window
        .iter()
        .take_while(|character| character.is_whitespace())
        .count();
    let preview_start = window_start + leading_spaces;
    NoteLineMatch {
        line_number,
        preview: window.iter().skip(leading_spaces).collect(),
        ranges: ranges
            .iter()
            .filter(|(start, end)| *start >= preview_start && *end <= window_end)
            .map(|(start, end)| (start - preview_start, end - preview_start))
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::collections::HashMap;

    use super::*;
    use crate::notes_index::index_build::{BuildProgress, ListedNote, reconcile_index};
    use crate::notes_index::index_store::{NotesIndex, index_file_path};

    struct Notes {
        texts: HashMap<String, (String, bool)>,
        reads: RefCell<usize>,
    }

    impl NoteFolder for Notes {
        fn list_notes(&self) -> Result<Vec<ListedNote>, IndexError> {
            Ok(self
                .texts
                .iter()
                .map(|(path, (text, is_online_only))| ListedNote {
                    path: path.clone(),
                    size_bytes: text.len() as u64,
                    modified_at_ms: 1,
                    is_online_only: *is_online_only,
                })
                .collect())
        }

        fn read_note(&self, path: &str) -> Result<String, IndexError> {
            *self.reads.borrow_mut() += 1;
            Ok(self
                .texts
                .get(path)
                .map(|(text, _)| text.clone())
                .unwrap_or_default())
        }
    }

    struct Indexed {
        _folder: tempfile::TempDir,
        index: NotesIndex,
        notes: Notes,
    }

    fn indexed(notes: &[(&str, &str)]) -> Indexed {
        indexed_with_online_only(notes, &[])
    }

    fn indexed_with_online_only(notes: &[(&str, &str)], online_only: &[&str]) -> Indexed {
        let folder = tempfile::tempdir().unwrap();
        let mut index = NotesIndex::open(&index_file_path(folder.path(), "location-1"))
            .unwrap()
            .0;
        let mut texts: HashMap<String, (String, bool)> = notes
            .iter()
            .map(|(path, text)| ((*path).to_owned(), ((*text).to_owned(), false)))
            .collect();
        texts.extend(
            online_only
                .iter()
                .map(|path| ((*path).to_owned(), (String::new(), true))),
        );
        let notes = Notes {
            texts,
            reads: RefCell::new(0),
        };
        reconcile_index(&mut index, &notes, &|| false, &mut |_: BuildProgress| {}).unwrap();
        Indexed {
            _folder: folder,
            index,
            notes,
        }
    }

    fn search(indexed: &Indexed, text: &str) -> NoteSearchResults {
        search_notes(
            indexed.index.connection(),
            &indexed.notes,
            &parse_query(text),
        )
        .unwrap()
    }

    fn hit_paths(results: &NoteSearchResults) -> Vec<&str> {
        results.hits.iter().map(|hit| hit.path.as_str()).collect()
    }

    #[test]
    fn finds_cafe_in_cafe_with_an_accent() {
        let notes = indexed(&[("Trip.md", "# Trip\n\nCoffee at the Café de Flore.\n")]);

        let results = search(&notes, "cafe");

        assert_eq!(hit_paths(&results), vec!["Trip.md"]);
        let found = &results.hits[0].matches[0];
        assert_eq!(found.line_number, 3);
        assert_eq!(found.ranges, vec![(14, 18)]);
    }

    #[test]
    fn a_hit_carries_the_heading_it_is_under() {
        let notes = indexed(&[(
            "Plan.md",
            "# Plan\n\nIntro\n\n## Budget\n\nThe hotel costs more.\n",
        )]);

        let results = search(&notes, "hotel");

        assert_eq!(results.hits[0].heading.as_deref(), Some("Budget"));
        assert_eq!(results.hits[0].heading_position, Some(1));
    }

    #[test]
    fn finds_a_telugu_word_with_combining_marks() {
        let notes = indexed(&[("Telugu.md", "తెలుగు భాష\n"), ("Other.md", "తల\n")]);

        let results = search(&notes, "తెలుగు");

        assert_eq!(hit_paths(&results), vec!["Telugu.md"]);
    }

    #[test]
    fn finds_a_japanese_substring() {
        let notes = indexed(&[
            ("Tokyo.md", "東京都庁に行きました。\n"),
            ("Osaka.md", "大阪城\n"),
        ]);

        let results = search(&notes, "都庁");

        assert_eq!(hit_paths(&results), vec!["Tokyo.md"]);
    }

    #[test]
    fn filters_by_tag_and_path() {
        let notes = indexed(&[
            ("Work/Plan.md", "Budget #work/finance\n"),
            ("Home/Plan.md", "Budget #home\n"),
            ("Work/Notes.md", "Budget\n"),
        ]);

        assert_eq!(
            hit_paths(&search(&notes, "budget tag:work")),
            vec!["Work/Plan.md"]
        );
        assert_eq!(
            hit_paths(&search(&notes, "budget path:Work")),
            vec!["Work/Notes.md", "Work/Plan.md"]
        );
        assert_eq!(
            hit_paths(&search(&notes, "tag:#home")),
            vec!["Home/Plan.md"]
        );
    }

    #[test]
    fn every_word_must_be_in_the_section() {
        let notes = indexed(&[("A.md", "red apple\n"), ("B.md", "red car\n")]);

        assert_eq!(hit_paths(&search(&notes, "red apple")), vec!["A.md"]);
    }

    #[test]
    fn the_last_word_may_still_be_typed() {
        let notes = indexed(&[("A.md", "Quarterly planning\n")]);

        assert_eq!(hit_paths(&search(&notes, "quarterly plan")), vec!["A.md"]);
    }

    #[test]
    fn stops_at_the_result_limit() {
        let texts: Vec<(String, String)> = (0..=MAX_SEARCH_HITS)
            .map(|number| (format!("Note {number:03}.md"), "shared word\n".to_owned()))
            .collect();
        let notes: Vec<(&str, &str)> = texts
            .iter()
            .map(|(path, text)| (path.as_str(), text.as_str()))
            .collect();
        let indexed = indexed(&notes);

        let results = search(&indexed, "shared");

        assert_eq!(results.hits.len(), MAX_SEARCH_HITS);
        assert!(results.is_incomplete);
    }

    #[test]
    fn says_it_may_be_incomplete_when_the_index_proposes_too_many_sections() {
        let texts: Vec<(String, String)> = (0..MAX_CANDIDATE_SECTIONS)
            .map(|number| (format!("Note {number:03}.md"), "shared word\n".to_owned()))
            .collect();
        let notes: Vec<(&str, &str)> = texts
            .iter()
            .map(|(path, text)| (path.as_str(), text.as_str()))
            .collect();
        let mut indexed = indexed(&notes);
        for (text, _) in indexed.notes.texts.values_mut() {
            "rewritten since it was indexed\n".clone_into(text);
        }

        let results = search(&indexed, "shared");

        assert!(results.hits.is_empty());
        assert!(results.is_incomplete);
    }

    #[test]
    fn counts_online_only_notes_as_not_searched() {
        let notes = indexed_with_online_only(&[("Local.md", "budget\n")], &["Cloud.md"]);
        let reads_before = *notes.notes.reads.borrow();

        let results = search(&notes, "budget");

        assert_eq!(results.not_searched_online_only, 1);
        assert_eq!(hit_paths(&results), vec!["Local.md"]);
        assert_eq!(*notes.notes.reads.borrow(), reads_before + 1);
    }

    #[test]
    fn search_words_cannot_change_the_query() {
        let notes = indexed(&[("A.md", "say \"hello\" OR NOT\n")]);

        let results = search(&notes, "\"hello\" OR");

        assert_eq!(hit_paths(&results), vec!["A.md"]);
    }

    #[test]
    fn a_filter_alone_lists_each_note_once() {
        let notes = indexed(&[
            ("Work/Plan.md", "# Plan\n\n#work\n\n## Next\n\nMore\n"),
            ("Home.md", "#home\n"),
        ]);

        let results = search(&notes, "tag:work");

        assert_eq!(hit_paths(&results), vec!["Work/Plan.md"]);
        assert!(results.hits[0].matches.is_empty());
    }
}
