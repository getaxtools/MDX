use std::fs;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::document_search::documents_in_folders;
use crate::documents::{
    DocumentAccessList, DocumentError, DocumentLocation, decode_document_bytes,
};

const MAX_SEARCHED_FOLDERS: usize = 100;
const MAX_QUERY_CHARACTERS: usize = 200;
const MAX_SEARCHED_DOCUMENT_BYTES: u64 = 5 * 1024 * 1024;
const MAX_MATCHES: usize = 2_000;
const MAX_MATCHES_PER_DOCUMENT: usize = 100;
const MAX_PREVIEW_CHARACTERS: usize = 200;
const PREVIEW_CONTEXT_CHARACTERS: usize = 40;

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextSearchOptions {
    pub is_case_sensitive: bool,
    pub is_whole_word: bool,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineMatch {
    /// Counted from 1, as editors show it.
    pub line_number: usize,
    /// The line, shortened around the first match when it is long, without leading spaces.
    pub preview: String,
    /// Where each match starts and ends in the preview, in characters.
    pub ranges: Vec<(usize, usize)>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMatches {
    pub location: DocumentLocation,
    pub matches: Vec<LineMatch>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSearchResults {
    pub documents: Vec<DocumentMatches>,
    /// True when a limit stopped the search early, so there may be more matches.
    pub is_incomplete: bool,
}

/// Finds text in the Markdown documents of chosen folders, off the window's thread.
#[tauri::command]
pub async fn search_folder_documents(
    folders: Vec<String>,
    query: String,
    options: TextSearchOptions,
    access: State<'_, Arc<DocumentAccessList>>,
) -> Result<FolderSearchResults, DocumentError> {
    let query_length = query.chars().count();
    if folders.len() > MAX_SEARCHED_FOLDERS || query_length > MAX_QUERY_CHARACTERS {
        return Err(DocumentError::InvalidRequest);
    }
    let access = Arc::clone(&access);
    tauri::async_runtime::spawn_blocking(move || {
        search_documents(documents_in_folders(&folders, &access), &query, options)
    })
    .await
    .map_err(|_| DocumentError::Unreadable)
}

fn search_documents(
    documents: Vec<DocumentLocation>,
    query: &str,
    options: TextSearchOptions,
) -> FolderSearchResults {
    let mut results = FolderSearchResults {
        documents: Vec::new(),
        is_incomplete: false,
    };
    if query.trim().is_empty() {
        return results;
    }
    let mut matches_left = MAX_MATCHES;
    for location in documents {
        let Some(text) = readable_text_of(&location) else {
            continue;
        };
        let limit = matches_left.min(MAX_MATCHES_PER_DOCUMENT);
        let (matches, is_cut_short) = lines_matching(&text, query, options, limit);
        results.is_incomplete |= is_cut_short;
        if matches.is_empty() {
            continue;
        }
        matches_left -= matches.len();
        results
            .documents
            .push(DocumentMatches { location, matches });
        if matches_left == 0 {
            results.is_incomplete = true;
            break;
        }
    }
    results
}

fn readable_text_of(location: &DocumentLocation) -> Option<String> {
    let path = location.path();
    let size = fs::metadata(&path).ok()?.len();
    if size > MAX_SEARCHED_DOCUMENT_BYTES {
        return None;
    }
    Some(decode_document_bytes(&fs::read(&path).ok()?).text)
}

/// The lines holding the query, at most `limit` of them; the flag says whether more were left out.
pub fn lines_matching(
    text: &str,
    query: &str,
    options: TextSearchOptions,
    limit: usize,
) -> (Vec<LineMatch>, bool) {
    let needle = comparable_characters(query, options);
    let mut matches = Vec::new();
    for (index, line) in text.lines().enumerate() {
        let characters: Vec<char> = line.chars().collect();
        let starts = match_starts(&characters, &needle, options);
        if starts.is_empty() {
            continue;
        }
        if matches.len() == limit {
            return (matches, true);
        }
        matches.push(preview_of(index + 1, &characters, &starts, needle.len()));
    }
    (matches, false)
}

fn comparable_characters(text: &str, options: TextSearchOptions) -> Vec<char> {
    text.chars()
        .map(|character| comparable(character, options))
        .collect()
}

/// Lowercases one character for comparison, keeping it as it is when lowercase is not one character.
fn comparable(character: char, options: TextSearchOptions) -> char {
    if options.is_case_sensitive {
        return character;
    }
    let mut lower = character.to_lowercase();
    match (lower.next(), lower.next()) {
        (Some(single), None) => single,
        _ => character,
    }
}

fn match_starts(line: &[char], needle: &[char], options: TextSearchOptions) -> Vec<usize> {
    let mut starts = Vec::new();
    let mut start = 0;
    while let Some(candidate) = line.get(start..start + needle.len()) {
        if needle.is_empty() {
            break;
        }
        let is_match = candidate
            .iter()
            .zip(needle)
            .all(|(character, wanted)| comparable(*character, options) == *wanted);
        if is_match && (!options.is_whole_word || is_whole_word_at(line, start, needle.len())) {
            starts.push(start);
            start += needle.len();
        } else {
            start += 1;
        }
    }
    starts
}

fn is_whole_word_at(line: &[char], start: usize, length: usize) -> bool {
    let before = start.checked_sub(1).and_then(|index| line.get(index));
    let after = line.get(start + length);
    !before.is_some_and(|character| is_word_character(*character))
        && !after.is_some_and(|character| is_word_character(*character))
}

/// Letters, digits, combining marks and the underscore; punctuation and spaces end a word.
fn is_word_character(character: char) -> bool {
    character == '_'
        || !(character.is_whitespace()
            || character.is_ascii_punctuation()
            || matches!(character, '\u{2000}'..='\u{206F}' | '\u{3000}'..='\u{303F}' | '\u{FF00}'..='\u{FF0F}'))
}

fn preview_of(line_number: usize, line: &[char], starts: &[usize], length: usize) -> LineMatch {
    let first_start = starts.first().copied().unwrap_or_default();
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
    let ranges = starts
        .iter()
        .filter(|start| **start >= preview_start && **start + length <= window_end)
        .map(|start| (start - preview_start, start - preview_start + length))
        .collect();
    LineMatch {
        line_number,
        preview: window.iter().skip(leading_spaces).collect(),
        ranges,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ANY_CASE: TextSearchOptions = TextSearchOptions {
        is_case_sensitive: false,
        is_whole_word: false,
    };

    fn lines_of(matches: &[LineMatch]) -> Vec<usize> {
        matches.iter().map(|line| line.line_number).collect()
    }

    #[test]
    fn finds_every_line_holding_the_query_in_any_case() {
        let (matches, is_cut_short) = lines_matching(
            "# Install\nno match\nRun INSTALL twice: install",
            "install",
            ANY_CASE,
            10,
        );

        assert_eq!(lines_of(&matches), vec![1, 3]);
        assert_eq!(matches[1].ranges, vec![(4, 11), (19, 26)]);
        assert!(!is_cut_short);
    }

    #[test]
    fn matches_the_exact_case_when_asked() {
        let options = TextSearchOptions {
            is_case_sensitive: true,
            ..ANY_CASE
        };

        let (matches, _) = lines_matching("Word\nword", "word", options, 10);

        assert_eq!(lines_of(&matches), vec![2]);
    }

    #[test]
    fn skips_matches_inside_longer_words_for_whole_words() {
        let options = TextSearchOptions {
            is_whole_word: true,
            ..ANY_CASE
        };

        let (matches, _) = lines_matching("concat cats\ncat, dog\nనమ నమస్తే", "cat", options, 10);
        let (telugu, _) = lines_matching("నమ నమస్తే", "నమ", options, 10);

        assert_eq!(lines_of(&matches), vec![2]);
        assert_eq!(telugu[0].ranges, vec![(0, 2)]);
    }

    #[test]
    fn stops_at_the_limit_and_says_more_were_left_out() {
        let (matches, is_cut_short) = lines_matching("a\na\na", "a", ANY_CASE, 2);

        assert_eq!(matches.len(), 2);
        assert!(is_cut_short);
    }

    #[test]
    fn shortens_long_lines_around_the_first_match_and_drops_leading_spaces() {
        let line = format!("    {}needle{}", "x".repeat(300), "y".repeat(300));

        let (matches, _) = lines_matching(&line, "needle", ANY_CASE, 10);
        let preview = &matches[0];

        assert_eq!(preview.preview.chars().count(), MAX_PREVIEW_CHARACTERS);
        let (start, end) = preview.ranges[0];
        let matched: String = preview
            .preview
            .chars()
            .skip(start)
            .take(end - start)
            .collect();
        assert_eq!(matched, "needle");
    }

    #[test]
    fn finds_nothing_for_a_blank_query() {
        let results = search_documents(Vec::new(), "   ", ANY_CASE);

        assert!(results.documents.is_empty());
        assert!(!results.is_incomplete);
    }

    #[test]
    fn searches_the_documents_of_chosen_folders_only() {
        let folder = tempfile::tempdir().unwrap();
        let access = DocumentAccessList::default();
        access.grant_folder(folder.path()).unwrap();
        fs::write(folder.path().join("guide.md"), "Setup steps\nMore setup").unwrap();
        fs::write(folder.path().join("notes.md"), "Nothing here").unwrap();
        let other = tempfile::tempdir().unwrap();
        fs::write(other.path().join("secret.md"), "setup").unwrap();
        let folders = [folder.path(), other.path()]
            .map(|path| path.to_string_lossy().into_owned())
            .to_vec();

        let results = search_documents(documents_in_folders(&folders, &access), "setup", ANY_CASE);

        let names: Vec<&str> = results
            .documents
            .iter()
            .map(|document| document.location.file_name.as_str())
            .collect();
        assert_eq!(names, vec!["guide.md"]);
        assert_eq!(lines_of(&results.documents[0].matches), vec![1, 2]);
    }
}
