use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension, Transaction, params};

use super::front_matter::FrontMatter;
use super::note_extraction::{ExtractedNote, LinkKind};

/// Raised whenever the tables change; an index of another version is deleted and built again.
pub const INDEX_SCHEMA_VERSION: i64 = 1;
const INDEX_FILE_EXTENSION: &str = "notes-index";
const MARKDOWN_EXTENSIONS: [&str; 5] = [".md", ".markdown", ".mdown", ".mkd", ".mdx"];
const ALIASES_PROPERTY: &str = "aliases";
/// 8 MB, in KiB as a negative number as SQLite reads it; a large notes folder's index outgrows the 2 MB default.
const PAGE_CACHE_KIB: i64 = -8_192;

#[derive(Debug, thiserror::Error)]
pub enum IndexError {
    #[error("the notes index could not be used: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("the notes index file could not be changed: {0}")]
    File(#[from] std::io::Error),
}

/// How an index was found when it was opened.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IndexOpening {
    Created,
    Opened,
    /// The file was from another version of the index, or could not be read, so it was built again.
    Rebuilt(RebuildReason),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RebuildReason {
    OtherSchemaVersion,
    Unreadable,
}

/// One note as the index keeps it.
pub struct IndexedNote<'note> {
    /// The note's path inside the location, with forward slashes.
    pub path: &'note str,
    pub size_bytes: u64,
    pub modified_at_ms: u64,
    pub content_hash: &'note str,
    /// Kept only in the cloud: in the index by name, never opened and not searched.
    pub is_online_only: bool,
    /// The text of each section, for search; only the search terms are stored, never the text.
    pub section_texts: &'note [&'note str],
    pub extracted: &'note ExtractedNote,
}

/// What the index knows of a note's file, to tell whether it changed while the workspace was closed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedFile {
    pub size_bytes: u64,
    pub modified_at_ms: u64,
    pub content_hash: String,
}

/// The notes index of one Notes location, a file of its own in local app data.
pub struct NotesIndex {
    connection: Connection,
}

pub fn index_file_path(index_folder: &Path, location_id: &str) -> PathBuf {
    index_folder.join(format!("{location_id}.{INDEX_FILE_EXTENSION}"))
}

impl NotesIndex {
    /// Opens the location's index, building a new one for a missing, older, newer or corrupt file.
    pub fn open(file_path: &Path) -> Result<(Self, IndexOpening), IndexError> {
        if let Some(folder) = file_path.parent() {
            fs::create_dir_all(folder)?;
        }
        let existed = file_path.exists();
        match open_existing(file_path) {
            Ok(connection) if existed => Ok((Self { connection }, IndexOpening::Opened)),
            Ok(connection) => Ok((Self { connection }, IndexOpening::Created)),
            Err(reason) => {
                remove_index_files(file_path)?;
                let connection = create(file_path)?;
                Ok((Self { connection }, IndexOpening::Rebuilt(reason)))
            }
        }
    }

    /// Gives back the page cache a build filled, so an idle index holds little memory.
    pub fn release_memory(&self) -> Result<(), IndexError> {
        self.connection.execute_batch("PRAGMA shrink_memory")?;
        Ok(())
    }

    pub fn transaction(&mut self) -> Result<Transaction<'_>, IndexError> {
        Ok(self.connection.transaction()?)
    }

    #[cfg(test)]
    pub fn connection(&self) -> &Connection {
        &self.connection
    }

    /// The files the index has, by path, to compare with the folder when the workspace opens.
    pub fn indexed_files(&self) -> Result<Vec<(String, IndexedFile)>, IndexError> {
        let mut statement = self.connection.prepare(
            "SELECT path, size_bytes, modified_at_ms, content_hash FROM notes ORDER BY path",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                IndexedFile {
                    size_bytes: unsigned(row.get(1)?),
                    modified_at_ms: unsigned(row.get(2)?),
                    content_hash: row.get(3)?,
                },
            ))
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}

/// Writes one note in place of what the index had for its path.
pub fn replace_note(
    transaction: &Transaction<'_>,
    note: &IndexedNote<'_>,
) -> Result<(), IndexError> {
    remove_note(transaction, note.path)?;
    transaction.execute(
        "INSERT INTO notes (path, name, name_key, size_bytes, modified_at_ms, content_hash, is_online_only, front_matter_kind)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            note.path,
            note_name_of(note.path),
            lookup_key(note_name_of(note.path)),
            sql_integer(note.size_bytes),
            sql_integer(note.modified_at_ms),
            note.content_hash,
            note.is_online_only,
            front_matter_kind(&note.extracted.front_matter),
        ],
    )?;
    let note_id = transaction.last_insert_rowid();
    insert_details(transaction, note_id, note)?;
    Ok(())
}

pub fn remove_note(transaction: &Transaction<'_>, path: &str) -> Result<(), IndexError> {
    let note_id: Option<i64> = transaction
        .query_row("SELECT id FROM notes WHERE path = ?1", [path], |row| {
            row.get(0)
        })
        .optional()?;
    let Some(note_id) = note_id else {
        return Ok(());
    };
    // By rowid: a contentless FTS table can only find rows by rowid without reading all of it.
    transaction.execute(
        "DELETE FROM section_terms WHERE rowid IN (SELECT id FROM sections WHERE note_id = ?1)",
        [note_id],
    )?;
    transaction.execute("DELETE FROM notes WHERE id = ?1", [note_id])?;
    Ok(())
}

fn insert_details(
    transaction: &Transaction<'_>,
    note_id: i64,
    note: &IndexedNote<'_>,
) -> Result<(), IndexError> {
    let extracted = note.extracted;
    for (position, heading) in extracted.headings.iter().enumerate() {
        transaction.execute(
            "INSERT INTO headings (note_id, position, level, text, line) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![note_id, sql_integer(position), heading.level, heading.text, sql_integer(heading.line)],
        )?;
    }
    insert_sections(transaction, note_id, note)?;
    for link in &extracted.links {
        transaction.execute(
            "INSERT INTO links (note_id, kind, target, target_name, heading, line) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                note_id,
                link_kind_name(link.kind),
                link.target,
                target_name_of(&link.target),
                link.heading,
                sql_integer(link.line)
            ],
        )?;
    }
    for tag in &extracted.tags {
        transaction.execute(
            "INSERT INTO tags (note_id, tag) VALUES (?1, ?2)",
            params![note_id, tag],
        )?;
    }
    for task in &extracted.tasks {
        transaction.execute(
            "INSERT INTO tasks (note_id, line, is_done, text) VALUES (?1, ?2, ?3, ?4)",
            params![note_id, sql_integer(task.line), task.is_done, task.text],
        )?;
    }
    insert_properties(transaction, note_id, &extracted.front_matter)
}

fn insert_sections(
    transaction: &Transaction<'_>,
    note_id: i64,
    note: &IndexedNote<'_>,
) -> Result<(), IndexError> {
    let headings = &note.extracted.headings;
    for (position, section) in note.extracted.sections.iter().enumerate() {
        transaction.execute(
            "INSERT INTO sections (note_id, position, heading_position, start_byte, end_byte, hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                note_id,
                sql_integer(position),
                section.heading.map(sql_integer),
                sql_integer(section.bytes.start),
                sql_integer(section.bytes.end),
                section.hash
            ],
        )?;
        let heading_text = section
            .heading
            .and_then(|heading| headings.get(heading))
            .map_or("", |heading| heading.text.as_str());
        let body = note
            .section_texts
            .get(position)
            .copied()
            .unwrap_or_default();
        transaction.execute(
            "INSERT INTO section_terms (rowid, heading, body, note_id) VALUES (?1, ?2, ?3, ?4)",
            params![transaction.last_insert_rowid(), heading_text, body, note_id],
        )?;
    }
    Ok(())
}

fn insert_properties(
    transaction: &Transaction<'_>,
    note_id: i64,
    front_matter: &FrontMatter,
) -> Result<(), IndexError> {
    let FrontMatter::Simple(properties) = front_matter else {
        return Ok(());
    };
    for (position, property) in properties.iter().enumerate() {
        let is_aliases = property.name.eq_ignore_ascii_case(ALIASES_PROPERTY);
        for value in &property.values {
            transaction.execute(
                "INSERT INTO properties (note_id, position, name, value) VALUES (?1, ?2, ?3, ?4)",
                params![note_id, sql_integer(position), property.name, value],
            )?;
            if is_aliases {
                transaction.execute(
                    "INSERT INTO aliases (note_id, alias, alias_key) VALUES (?1, ?2, ?3)",
                    params![note_id, value, lookup_key(value)],
                )?;
            }
        }
    }
    Ok(())
}

/// SQLite integers are signed; sizes, lines and times never come near the limit.
fn sql_integer(value: impl TryInto<i64>) -> i64 {
    value.try_into().unwrap_or(i64::MAX)
}

fn unsigned(value: i64) -> u64 {
    u64::try_from(value).unwrap_or_default()
}

/// Names compare ignoring case in every script, which SQLite's own case rules do only for English letters.
pub fn lookup_key(name: &str) -> String {
    name.trim().to_lowercase()
}

/// The note a link names, by the last part of its target without a Markdown extension, as a lookup key.
pub fn target_name_of(target: &str) -> String {
    let last = target.rsplit(['/', '\\']).next().unwrap_or(target);
    let without_extension = MARKDOWN_EXTENSIONS
        .iter()
        .find_map(|extension| {
            let split = last.len().checked_sub(extension.len())?;
            last.get(split..)?
                .eq_ignore_ascii_case(extension)
                .then(|| last.get(..split))?
        })
        .unwrap_or(last);
    lookup_key(without_extension)
}

fn note_name_of(path: &str) -> &str {
    let file_name = path.rsplit('/').next().unwrap_or(path);
    file_name
        .rsplit_once('.')
        .map_or(file_name, |(name, _)| name)
}

fn front_matter_kind(front_matter: &FrontMatter) -> &'static str {
    match front_matter {
        FrontMatter::None => "none",
        FrontMatter::Simple(_) => "simple",
        FrontMatter::Complex => "complex",
    }
}

fn link_kind_name(kind: LinkKind) -> &'static str {
    match kind {
        LinkKind::Markdown => "markdown",
        LinkKind::Wiki => "wiki",
        LinkKind::Embed => "embed",
    }
}

fn open_existing(file_path: &Path) -> Result<Connection, RebuildReason> {
    let connection = Connection::open(file_path).map_err(|_| RebuildReason::Unreadable)?;
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| RebuildReason::Unreadable)?;
    match version {
        0 if is_empty(&connection) => {
            drop(connection);
            create(file_path).map_err(|_| RebuildReason::Unreadable)
        }
        INDEX_SCHEMA_VERSION => configure(&connection)
            .map(|()| connection)
            .map_err(|_| RebuildReason::Unreadable),
        _ => Err(RebuildReason::OtherSchemaVersion),
    }
}

fn is_empty(connection: &Connection) -> bool {
    connection
        .query_row("SELECT count(*) FROM sqlite_schema", [], |row| {
            row.get::<_, i64>(0)
        })
        .is_ok_and(|count| count == 0)
}

fn create(file_path: &Path) -> Result<Connection, IndexError> {
    let connection = Connection::open(file_path)?;
    configure(&connection)?;
    connection.execute_batch(SCHEMA)?;
    connection.pragma_update(None, "user_version", INDEX_SCHEMA_VERSION)?;
    Ok(connection)
}

fn configure(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.pragma_update(None, "foreign_keys", true)?;
    connection.pragma_update(None, "synchronous", "NORMAL")?;
    connection.pragma_update(None, "cache_size", PAGE_CACHE_KIB)?;
    connection
        .pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get::<_, String>(0))?;
    Ok(())
}

/// Deletes every index file in the folder and nothing else; returns how many indexes there were.
pub fn remove_index_files_in(index_folder: &Path) -> Result<usize, IndexError> {
    let Ok(entries) = fs::read_dir(index_folder) else {
        return Ok(0);
    };
    let mut removed = 0;
    for path in entries.filter_map(Result::ok).map(|entry| entry.path()) {
        if path
            .extension()
            .is_some_and(|extension| extension == INDEX_FILE_EXTENSION)
        {
            remove_index_files(&path)?;
            removed += 1;
        }
    }
    Ok(removed)
}

fn remove_index_files(file_path: &Path) -> Result<(), IndexError> {
    for suffix in ["", "-wal", "-shm"] {
        let path = PathBuf::from(format!("{}{suffix}", file_path.display()));
        match fs::remove_file(&path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

// Search terms are kept without the text (contentless), so snippets are read from the notes.
const SCHEMA: &str = "
CREATE TABLE notes (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    modified_at_ms INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    name_key TEXT NOT NULL,
    is_online_only INTEGER NOT NULL,
    front_matter_kind TEXT NOT NULL CHECK (front_matter_kind IN ('none', 'simple', 'complex'))
) STRICT;
CREATE INDEX notes_by_name_key ON notes (name_key);
CREATE INDEX notes_online_only ON notes (is_online_only);
CREATE TABLE headings (
    note_id INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    level INTEGER NOT NULL,
    text TEXT NOT NULL,
    line INTEGER NOT NULL
) STRICT;
CREATE INDEX headings_by_note ON headings (note_id);
CREATE TABLE sections (
    id INTEGER PRIMARY KEY,
    note_id INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    heading_position INTEGER,
    start_byte INTEGER NOT NULL,
    end_byte INTEGER NOT NULL,
    hash TEXT NOT NULL
) STRICT;
CREATE INDEX sections_by_note ON sections (note_id);
CREATE TABLE links (
    note_id INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('markdown', 'wiki', 'embed')),
    target TEXT NOT NULL,
    target_name TEXT NOT NULL,
    heading TEXT,
    line INTEGER NOT NULL
) STRICT;
CREATE INDEX links_by_note ON links (note_id);
CREATE INDEX links_by_target_name ON links (target_name);
CREATE TABLE aliases (
    note_id INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    alias_key TEXT NOT NULL
) STRICT;
CREATE INDEX aliases_by_note ON aliases (note_id);
CREATE INDEX aliases_by_key ON aliases (alias_key);
CREATE TABLE tags (
    note_id INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    tag TEXT NOT NULL
) STRICT;
CREATE INDEX tags_by_note ON tags (note_id);
CREATE INDEX tags_by_tag ON tags (tag COLLATE NOCASE);
CREATE TABLE tasks (
    note_id INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    line INTEGER NOT NULL,
    is_done INTEGER NOT NULL,
    text TEXT NOT NULL
) STRICT;
CREATE INDEX tasks_by_note ON tasks (note_id);
CREATE TABLE properties (
    note_id INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    value TEXT NOT NULL
) STRICT;
CREATE INDEX properties_by_note ON properties (note_id);
CREATE INDEX properties_by_name ON properties (name COLLATE NOCASE, value COLLATE NOCASE);
CREATE VIRTUAL TABLE section_terms USING fts5 (
    heading, body, note_id UNINDEXED,
    content = '', contentless_delete = 1,
    tokenize = 'unicode61 remove_diacritics 2'
);
";

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes_index::note_extraction::extract_note;

    fn index_note(index: &mut NotesIndex, path: &str, text: &str) {
        let extracted = extract_note(text);
        let section_texts: Vec<&str> = extracted
            .sections
            .iter()
            .map(|section| text.get(section.bytes.clone()).unwrap_or_default())
            .collect();
        let transaction = index.transaction().unwrap();
        replace_note(
            &transaction,
            &IndexedNote {
                path,
                size_bytes: text.len() as u64,
                modified_at_ms: 1,
                content_hash: "hash",
                is_online_only: false,
                section_texts: &section_texts,
                extracted: &extracted,
            },
        )
        .unwrap();
        transaction.commit().unwrap();
    }

    fn count(index: &NotesIndex, table: &str) -> i64 {
        index
            .connection()
            .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap()
    }

    #[test]
    fn creates_a_new_index() {
        let folder = tempfile::tempdir().unwrap();

        let (index, opening) =
            NotesIndex::open(&index_file_path(folder.path(), "location-1")).unwrap();

        assert_eq!(opening, IndexOpening::Created);
        assert_eq!(count(&index, "notes"), 0);
    }

    #[test]
    fn opens_an_index_it_made_before() {
        let folder = tempfile::tempdir().unwrap();
        let path = index_file_path(folder.path(), "location-1");
        let (mut index, _) = NotesIndex::open(&path).unwrap();
        index_note(&mut index, "Plan.md", "# Plan\n");
        drop(index);

        let (index, opening) = NotesIndex::open(&path).unwrap();

        assert_eq!(opening, IndexOpening::Opened);
        assert_eq!(count(&index, "notes"), 1);
    }

    #[test]
    fn rebuilds_an_index_with_another_schema_version() {
        let folder = tempfile::tempdir().unwrap();
        let path = index_file_path(folder.path(), "location-1");
        let (mut index, _) = NotesIndex::open(&path).unwrap();
        index_note(&mut index, "Plan.md", "# Plan\n");
        index
            .connection()
            .pragma_update(None, "user_version", INDEX_SCHEMA_VERSION + 1)
            .unwrap();
        drop(index);

        let (index, opening) = NotesIndex::open(&path).unwrap();

        assert_eq!(
            opening,
            IndexOpening::Rebuilt(RebuildReason::OtherSchemaVersion)
        );
        assert_eq!(count(&index, "notes"), 0);
    }

    #[test]
    fn rebuilds_a_corrupt_index_file_and_reports_it() {
        let folder = tempfile::tempdir().unwrap();
        let path = index_file_path(folder.path(), "location-1");
        fs::write(
            &path,
            b"this is not a database, only some bytes that look nothing like one",
        )
        .unwrap();

        let (index, opening) = NotesIndex::open(&path).unwrap();

        assert_eq!(opening, IndexOpening::Rebuilt(RebuildReason::Unreadable));
        assert_eq!(count(&index, "notes"), 0);
    }

    #[test]
    fn replacing_a_note_keeps_one_copy_of_its_details() {
        let folder = tempfile::tempdir().unwrap();
        let (mut index, _) =
            NotesIndex::open(&index_file_path(folder.path(), "location-1")).unwrap();

        index_note(
            &mut index,
            "Plan.md",
            "# Plan\n\n#work [[Budget]]\n\n## Next\n",
        );
        index_note(&mut index, "Plan.md", "# Plan\n\n#work #home [[Budget]]\n");

        assert_eq!(count(&index, "notes"), 1);
        assert_eq!(count(&index, "headings"), 1);
        assert_eq!(count(&index, "tags"), 2);
        assert_eq!(count(&index, "links"), 1);
        assert_eq!(count(&index, "sections"), 1);
    }

    #[test]
    fn the_index_keeps_search_terms_but_never_the_note_text() {
        let folder = tempfile::tempdir().unwrap();
        let (mut index, _) =
            NotesIndex::open(&index_file_path(folder.path(), "location-1")).unwrap();

        index_note(
            &mut index,
            "Plan.md",
            "# Plan\n\nThe secret ingredient is cardamom.\n",
        );

        let found: i64 = index
            .connection()
            .query_row(
                "SELECT count(*) FROM section_terms WHERE section_terms MATCH 'cardamom'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let stored_text: Option<String> = index
            .connection()
            .query_row("SELECT body FROM section_terms LIMIT 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(found, 1);
        assert_eq!(stored_text, None);
    }
}
