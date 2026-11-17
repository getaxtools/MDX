use std::collections::HashMap;

use rusqlite::{Connection, params, params_from_iter};
use serde::Serialize;

use super::index_build::NoteFolder;
use super::index_store::{IndexError, lookup_key, target_name_of};

pub const MAX_BACKLINKS: usize = 500;
pub const MAX_SUGGESTIONS: usize = 50;
pub const MAX_TAGS: usize = 2_000;
pub const MAX_HEADINGS: usize = 500;
/// The last Unicode character, which ends the range of keys starting with a prefix.
const LAST_CHARACTER: char = '\u{10FFFF}';
const MARKDOWN_EXTENSIONS: [&str; 5] = [".md", ".markdown", ".mdown", ".mkd", ".mdx"];

/// A note the index knows, by its path inside the location and the other names it answers to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnownNote {
    pub path: String,
    pub aliases: Vec<String>,
}

/// A link to a note from another note, with the line it is on.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backlink {
    pub path: String,
    /// Counted from 1, as editors show it.
    pub line_number: usize,
    pub line: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub tag: String,
    pub notes: usize,
}

/// A heading offered after `#` in a wiki-link.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteHeading {
    pub level: u8,
    pub text: String,
}

/// A note offered while a wiki-link is typed, by its name or an alias.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSuggestion {
    pub path: String,
    pub name: String,
    /// The alias that matched, when the name did not.
    pub alias: Option<String>,
}

/// The notes linking to a note, by wiki-link or Markdown link, resolved as the renderer resolves them.
/// Only links naming the note, by its name or an alias, are looked at.
pub fn backlinks_of(
    connection: &Connection,
    folder: &dyn NoteFolder,
    note_path: &str,
) -> Result<Vec<Backlink>, IndexError> {
    let names = lookup_names_of(connection, note_path)?;
    if names.is_empty() {
        return Ok(Vec::new());
    }
    let mut backlinks = Vec::new();
    let mut notes_by_name: HashMap<String, Vec<KnownNote>> = HashMap::new();
    for candidate in links_naming(connection, &names, note_path)? {
        let resolved = if candidate.kind == "markdown" {
            resolve_markdown_link(&candidate.from, &candidate.target)
        } else {
            let key = target_name_of(&candidate.target);
            if !notes_by_name.contains_key(&key) {
                notes_by_name.insert(key.clone(), notes_named(connection, &key)?);
            }
            let named = notes_by_name.get(&key).map_or(&[][..], Vec::as_slice);
            resolve_wiki_link(&candidate.target, &candidate.from, named)
        };
        if resolved.as_deref() == Some(note_path) && backlinks.len() < MAX_BACKLINKS {
            backlinks.push(Backlink {
                line: line_of(folder, &candidate.from, candidate.line),
                path: candidate.from,
                line_number: candidate.line + 1,
            });
        }
    }
    Ok(backlinks)
}

struct LinkCandidate {
    from: String,
    kind: String,
    target: String,
    line: usize,
}

/// The note's name and aliases as lookup keys; none when the index does not have the note.
fn lookup_names_of(connection: &Connection, note_path: &str) -> Result<Vec<String>, IndexError> {
    let mut statement = connection.prepare(
        "SELECT name_key FROM notes WHERE path = ?1
         UNION SELECT alias_key FROM aliases JOIN notes ON notes.id = aliases.note_id WHERE notes.path = ?1",
    )?;
    let rows = statement.query_map([note_path], |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn links_naming(
    connection: &Connection,
    names: &[String],
    note_path: &str,
) -> Result<Vec<LinkCandidate>, IndexError> {
    let placeholders = vec!["?"; names.len()].join(", ");
    let mut statement = connection.prepare(&format!(
        "SELECT notes.path, links.kind, links.target, links.line FROM links
         JOIN notes ON notes.id = links.note_id
         WHERE links.target_name IN ({placeholders}) AND notes.path <> ?
         ORDER BY notes.path, links.line"
    ))?;
    let values = names
        .iter()
        .map(String::as_str)
        .chain(std::iter::once(note_path));
    let rows = statement.query_map(params_from_iter(values), |row| {
        Ok(LinkCandidate {
            from: row.get(0)?,
            kind: row.get(1)?,
            target: row.get(2)?,
            line: usize::try_from(row.get::<_, i64>(3)?).unwrap_or_default(),
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// The notes a link target may mean: those with that name or alias, with all their aliases.
pub(super) fn notes_named(
    connection: &Connection,
    key: &str,
) -> Result<Vec<KnownNote>, IndexError> {
    let mut statement = connection.prepare(
        "SELECT notes.path, aliases.alias FROM notes
         LEFT JOIN aliases ON aliases.note_id = notes.id
         WHERE notes.name_key = ?1 OR notes.id IN (SELECT note_id FROM aliases WHERE alias_key = ?1)
         ORDER BY notes.path",
    )?;
    let rows = statement.query_map([key], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
    })?;
    let mut notes: Vec<KnownNote> = Vec::new();
    for row in rows {
        let (path, alias) = row?;
        match notes.last_mut() {
            Some(last) if last.path == path => last.aliases.extend(alias),
            _ => notes.push(KnownNote {
                path,
                aliases: alias.into_iter().collect(),
            }),
        }
    }
    Ok(notes)
}
/// The headings of the note a wiki-link target means from a note, resolved as the renderer resolves
/// it; an empty target means the linking note itself.
pub fn headings_of_link_target(
    connection: &Connection,
    target: &str,
    from_note: &str,
) -> Result<Vec<NoteHeading>, IndexError> {
    let named = notes_named(connection, &target_name_of(target))?;
    let Some(path) = resolve_wiki_link(target, from_note, &named) else {
        return Ok(Vec::new());
    };
    let mut statement = connection.prepare(&format!(
        "SELECT headings.level, headings.text FROM headings JOIN notes ON notes.id = headings.note_id
         WHERE notes.path = ?1 ORDER BY headings.position LIMIT {MAX_HEADINGS}"
    ))?;
    let rows = statement.query_map([path], |row| {
        Ok(NoteHeading {
            level: u8::try_from(row.get::<_, i64>(0)?).unwrap_or_default(),
            text: row.get(1)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Every tag with the number of notes carrying it; nested tags such as `a/b` are listed as written.
/// A tag written in several ways, such as `Work` and `work`, is one tag shown as most notes write it.
pub fn tag_counts(connection: &Connection) -> Result<Vec<TagCount>, IndexError> {
    let mut statement = connection.prepare(&format!(
        "SELECT
             (SELECT spelling.tag FROM tags AS spelling WHERE lower(spelling.tag) = lower(tags.tag)
              GROUP BY spelling.tag ORDER BY count(*) DESC, spelling.tag LIMIT 1),
             count(DISTINCT note_id)
         FROM tags GROUP BY lower(tag) ORDER BY lower(tag) LIMIT {MAX_TAGS}"
    ))?;
    let rows = statement.query_map([], |row| {
        Ok(TagCount {
            tag: row.get(0)?,
            notes: usize::try_from(row.get::<_, i64>(1)?).unwrap_or_default(),
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Notes whose name or alias starts with what was typed; the nearest folder to the typing note first.
/// Folders are searched from the typing note's own outwards, stopping once enough nearer notes are found.
pub fn suggest_notes(
    connection: &Connection,
    typed: &str,
    from_note: &str,
) -> Result<Vec<NoteSuggestion>, IndexError> {
    let prefix = lookup_key(typed);
    let from_folder = folder_of(from_note);
    let mut suggestions: Vec<NoteSuggestion> = Vec::new();
    for depth in (0..=from_folder.len()).rev() {
        let scope = KeyRange::inside_folder(from_folder.get(..depth).unwrap_or_default());
        let wanted = suggestions.len() + MAX_SUGGESTIONS;
        for found in notes_starting_with(
            connection,
            &KeyRange::starting_with(&prefix),
            &scope,
            wanted,
        )? {
            add_suggestion(&mut suggestions, found);
        }
        if suggestions.len() >= MAX_SUGGESTIONS {
            break;
        }
    }
    suggestions.sort_by(|first, second| {
        shared_depth(&folder_of(&second.path), &from_folder)
            .cmp(&shared_depth(&folder_of(&first.path), &from_folder))
            .then_with(|| first.name.to_lowercase().cmp(&second.name.to_lowercase()))
            .then_with(|| first.path.cmp(&second.path))
    });
    suggestions.truncate(MAX_SUGGESTIONS);
    Ok(suggestions)
}

/// The keys from `start` up to `end`, which an index reads without a scan.
struct KeyRange {
    start: String,
    end: String,
}

impl KeyRange {
    fn starting_with(prefix: &str) -> Self {
        Self {
            start: prefix.to_owned(),
            end: format!("{prefix}{LAST_CHARACTER}"),
        }
    }

    fn inside_folder(folder: &[&str]) -> Self {
        if folder.is_empty() {
            return Self::starting_with("");
        }
        Self::starting_with(&format!("{}/", folder.join("/")))
    }
}

/// A note found by its name is shown by its name, even when an alias matched too.
fn add_suggestion(suggestions: &mut Vec<NoteSuggestion>, found: NoteSuggestion) {
    match suggestions
        .iter_mut()
        .find(|suggestion| suggestion.path == found.path)
    {
        Some(known) if found.alias.is_none() => known.alias = None,
        Some(_) => {}
        None => suggestions.push(found),
    }
}

/// The first notes by name, in the folder, whose name or one of whose aliases has a key in the range.
fn notes_starting_with(
    connection: &Connection,
    keys: &KeyRange,
    folder: &KeyRange,
    limit: usize,
) -> Result<Vec<NoteSuggestion>, IndexError> {
    let mut statement = connection.prepare_cached(
        "SELECT path, NULL FROM notes
         WHERE name_key >= ?1 AND name_key < ?2 AND path >= ?3 AND path < ?4
         ORDER BY name_key LIMIT ?5",
    )?;
    let by_name = statement.query_map(
        params![
            keys.start,
            keys.end,
            folder.start,
            folder.end,
            sql_limit(limit)
        ],
        suggestion_row,
    )?;
    let mut found: Vec<NoteSuggestion> = by_name.collect::<Result<_, _>>()?;
    let mut statement = connection.prepare_cached(
        "SELECT notes.path, min(aliases.alias) FROM aliases JOIN notes ON notes.id = aliases.note_id
         WHERE alias_key >= ?1 AND alias_key < ?2 AND notes.path >= ?3 AND notes.path < ?4
         GROUP BY notes.id ORDER BY notes.name_key LIMIT ?5",
    )?;
    let by_alias = statement.query_map(
        params![
            keys.start,
            keys.end,
            folder.start,
            folder.end,
            sql_limit(limit)
        ],
        suggestion_row,
    )?;
    for row in by_alias {
        add_suggestion(&mut found, row?);
    }
    Ok(found)
}

fn suggestion_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteSuggestion> {
    let path: String = row.get(0)?;
    Ok(NoteSuggestion {
        name: name_of(&path).to_owned(),
        alias: row.get(1)?,
        path,
    })
}

fn sql_limit(limit: usize) -> i64 {
    i64::try_from(limit).unwrap_or(i64::MAX)
}
/// The renderer's rule: name or alias ignoring case, or the end of the path; then the nearest folder,
/// then the shortest path.
pub(super) fn resolve_wiki_link(
    target: &str,
    from_note: &str,
    notes: &[KnownNote],
) -> Option<String> {
    let wanted = without_markdown_extension(target.trim()).to_lowercase();
    if wanted.is_empty() {
        return Some(from_note.to_owned());
    }
    let from_folder = folder_of(from_note);
    notes
        .iter()
        .filter(|note| matches_target(note, &wanted))
        .min_by(|first, second| {
            shared_depth(&folder_of(&second.path), &from_folder)
                .cmp(&shared_depth(&folder_of(&first.path), &from_folder))
                .then_with(|| {
                    first
                        .path
                        .split('/')
                        .count()
                        .cmp(&second.path.split('/').count())
                })
                .then_with(|| first.path.cmp(&second.path))
        })
        .map(|note| note.path.clone())
}

fn matches_target(note: &KnownNote, wanted: &str) -> bool {
    let path = without_markdown_extension(&note.path).to_lowercase();
    if wanted.contains('/') {
        return path == wanted || path.ends_with(&format!("/{wanted}"));
    }
    name_of(&path) == wanted || note.aliases.iter().any(|alias| lookup_key(alias) == wanted)
}

/// A relative Markdown link, from the linking note's folder, as a path inside the location.
pub(super) fn resolve_markdown_link(from_note: &str, target: &str) -> Option<String> {
    let mut parts: Vec<&str> = folder_of(from_note);
    let target = target.replace('\\', "/");
    for part in target.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            name => parts.push(name),
        }
    }
    Some(parts.join("/"))
}

fn line_of(folder: &dyn NoteFolder, path: &str, line: usize) -> String {
    folder
        .read_note(path)
        .ok()
        .and_then(|text| text.lines().nth(line).map(|line| line.trim().to_owned()))
        .unwrap_or_default()
}

pub(super) fn folder_of(path: &str) -> Vec<&str> {
    let mut parts: Vec<&str> = path.split('/').collect();
    parts.pop();
    parts
}

pub(super) fn shared_depth(first: &[&str], second: &[&str]) -> usize {
    first
        .iter()
        .zip(second)
        .take_while(|(one, other)| one.eq_ignore_ascii_case(other))
        .count()
}

pub(super) fn name_of(path: &str) -> &str {
    without_markdown_extension(path.rsplit('/').next().unwrap_or(path))
}

pub(super) fn without_markdown_extension(path: &str) -> &str {
    MARKDOWN_EXTENSIONS
        .iter()
        .find_map(|extension| {
            let split = path.len().checked_sub(extension.len())?;
            let (start, end) = (path.get(..split)?, path.get(split..)?);
            end.eq_ignore_ascii_case(extension).then_some(start)
        })
        .unwrap_or(path)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::notes_index::index_build::{BuildProgress, ListedNote, reconcile_index};
    use crate::notes_index::index_store::{NotesIndex, index_file_path};

    struct Notes(HashMap<String, String>);

    impl NoteFolder for Notes {
        fn list_notes(&self) -> Result<Vec<ListedNote>, IndexError> {
            Ok(self
                .0
                .iter()
                .map(|(path, text)| ListedNote {
                    path: path.clone(),
                    size_bytes: text.len() as u64,
                    modified_at_ms: 1,
                    is_online_only: false,
                })
                .collect())
        }

        fn read_note(&self, path: &str) -> Result<String, IndexError> {
            Ok(self.0.get(path).cloned().unwrap_or_default())
        }
    }

    struct Indexed {
        _folder: tempfile::TempDir,
        index: NotesIndex,
        notes: Notes,
    }

    fn indexed(notes: &[(&str, &str)]) -> Indexed {
        let folder = tempfile::tempdir().unwrap();
        let mut index = NotesIndex::open(&index_file_path(folder.path(), "location-1"))
            .unwrap()
            .0;
        let notes = Notes(
            notes
                .iter()
                .map(|(path, text)| ((*path).to_owned(), (*text).to_owned()))
                .collect(),
        );
        reconcile_index(&mut index, &notes, &|| false, &mut |_: BuildProgress| {}).unwrap();
        Indexed {
            _folder: folder,
            index,
            notes,
        }
    }

    #[test]
    fn backlinks_carry_the_linking_line() {
        let notes = indexed(&[
            ("Plan.md", "# Plan\n"),
            ("Inbox.md", "# Inbox\n\nRead the [[plan]] today.\n"),
            ("Projects/Work.md", "See [the plan](../Plan.md#goals).\n"),
            ("Other.md", "No links here.\n"),
        ]);

        let backlinks = backlinks_of(notes.index.connection(), &notes.notes, "Plan.md").unwrap();

        assert_eq!(
            backlinks,
            vec![
                Backlink {
                    path: "Inbox.md".to_owned(),
                    line_number: 3,
                    line: "Read the [[plan]] today.".to_owned()
                },
                Backlink {
                    path: "Projects/Work.md".to_owned(),
                    line_number: 1,
                    line: "See [the plan](../Plan.md#goals).".to_owned()
                }
            ]
        );
    }

    #[test]
    fn a_link_to_another_note_of_the_same_name_is_not_a_backlink() {
        let notes = indexed(&[
            ("Plan.md", "# Plan\n"),
            ("Projects/Plan.md", "# Plan of projects\n"),
            (
                "Projects/Notes.md",
                "The [[Plan]] here is the one next to me.\n",
            ),
        ]);

        let top = backlinks_of(notes.index.connection(), &notes.notes, "Plan.md").unwrap();
        let nearest =
            backlinks_of(notes.index.connection(), &notes.notes, "Projects/Plan.md").unwrap();

        assert!(top.is_empty());
        assert_eq!(nearest.len(), 1);
    }

    #[test]
    fn a_link_by_alias_is_a_backlink() {
        let notes = indexed(&[
            ("Roadmap.md", "---\naliases: [Q3 plan]\n---\n# Roadmap\n"),
            ("Inbox.md", "See [[q3 plan]].\n"),
        ]);

        let backlinks = backlinks_of(notes.index.connection(), &notes.notes, "Roadmap.md").unwrap();

        assert_eq!(backlinks.len(), 1);
    }

    #[test]
    fn tags_are_counted_by_notes() {
        let notes = indexed(&[
            ("A.md", "#work #work/finance\n"),
            ("B.md", "#Work twice #work\n"),
            ("C.md", "#home\n"),
        ]);

        let counts = tag_counts(notes.index.connection()).unwrap();

        let shown: Vec<(&str, usize)> = counts
            .iter()
            .map(|count| (count.tag.as_str(), count.notes))
            .collect();
        assert_eq!(shown, vec![("home", 1), ("work", 2), ("work/finance", 1)]);
    }

    #[test]
    fn suggestions_match_names_and_aliases_by_prefix() {
        let notes = indexed(&[
            ("Planning.md", "# Planning\n"),
            ("Roadmap.md", "---\naliases: [Plan for Q3]\n---\n"),
            ("Budget.md", "# Budget\n"),
        ]);

        let suggestions = suggest_notes(notes.index.connection(), "pla", "Inbox.md").unwrap();

        let shown: Vec<(&str, Option<&str>)> = suggestions
            .iter()
            .map(|suggestion| (suggestion.name.as_str(), suggestion.alias.as_deref()))
            .collect();
        assert_eq!(
            shown,
            vec![("Planning", None), ("Roadmap", Some("Plan for Q3"))]
        );
    }

    #[test]
    fn the_nearest_folder_ranks_first() {
        let notes = indexed(&[
            ("Archive/Plan.md", ""),
            ("Projects/Plan.md", ""),
            ("Plan.md", ""),
        ]);

        let suggestions =
            suggest_notes(notes.index.connection(), "plan", "Projects/Inbox.md").unwrap();

        assert_eq!(
            suggestions
                .iter()
                .map(|suggestion| suggestion.path.as_str())
                .collect::<Vec<_>>(),
            vec!["Projects/Plan.md", "Archive/Plan.md", "Plan.md"]
        );
    }

    #[test]
    fn headings_of_the_note_a_link_means() {
        let notes = indexed(&[
            ("Plan.md", "# Plan\n\n## Goals\n\n### Budget\n"),
            ("Projects/Plan.md", "# Projects plan\n"),
            ("Roadmap.md", "---\naliases: [Q3]\n---\n# Roadmap\n"),
            ("Inbox.md", "# Inbox\n"),
        ]);
        let connection = notes.index.connection();
        let texts = |target: &str| -> Vec<String> {
            headings_of_link_target(connection, target, "Inbox.md")
                .unwrap()
                .into_iter()
                .map(|heading| heading.text)
                .collect()
        };

        assert_eq!(texts("plan"), vec!["Plan", "Goals", "Budget"]);
        assert_eq!(texts("Projects/Plan"), vec!["Projects plan"]);
        assert_eq!(texts("q3"), vec!["Roadmap"]);
        assert_eq!(texts(""), vec!["Inbox"]);
        assert!(texts("Missing").is_empty());
        assert_eq!(
            headings_of_link_target(connection, "plan", "Inbox.md").unwrap()[1],
            NoteHeading {
                level: 2,
                text: "Goals".to_owned()
            }
        );
    }

    #[test]
    fn a_nearby_note_is_suggested_when_many_farther_notes_match() {
        let mut texts: Vec<(String, &str)> = (0..2 * MAX_SUGGESTIONS)
            .map(|number| (format!("Plan {number:03}.md"), ""))
            .collect();
        texts.push(("Projects/Plan zebra.md".to_owned(), ""));
        let notes: Vec<(&str, &str)> = texts
            .iter()
            .map(|(path, text)| (path.as_str(), *text))
            .collect();
        let notes = indexed(&notes);

        let suggestions =
            suggest_notes(notes.index.connection(), "plan", "Projects/Inbox.md").unwrap();

        assert_eq!(suggestions.len(), MAX_SUGGESTIONS);
        assert_eq!(suggestions[0].path, "Projects/Plan zebra.md");
        assert_eq!(suggestions[1].path, "Plan 000.md");
    }

    #[test]
    fn a_note_matching_by_name_and_alias_is_shown_by_its_name() {
        let notes = indexed(&[("Planning.md", "---\naliases: [Plan B]\n---\n")]);

        let suggestions = suggest_notes(notes.index.connection(), "plan", "Inbox.md").unwrap();

        assert_eq!(suggestions.len(), 1);
        assert_eq!(suggestions[0].alias, None);
    }

    #[test]
    fn a_wiki_link_by_path_and_a_markdown_link_into_a_folder_are_backlinks() {
        let notes = indexed(&[
            ("Projects/Plan.md", "# Plan\n"),
            (
                "Inbox.md",
                "[[Projects/Plan]] and\n[plan](Projects/Plan.md)\n",
            ),
        ]);

        let backlinks =
            backlinks_of(notes.index.connection(), &notes.notes, "Projects/Plan.md").unwrap();

        assert_eq!(backlinks.len(), 2);
    }
}
