use std::borrow::Cow;
use std::collections::{HashMap, HashSet};

use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, utf8_percent_encode};
use rusqlite::{Connection, params_from_iter};
use serde::{Deserialize, Serialize};

use super::index_build::NoteFolder;
use super::index_store::{IndexError, lookup_key, target_name_of};
use super::note_extraction::{LineStarts, LinkKind, NoteLink, extract_note, sha256_hex};
use super::note_links::{
    KnownNote, folder_of, notes_named, resolve_markdown_link, resolve_wiki_link, shared_depth,
    without_markdown_extension,
};
use crate::documents::decode_document_bytes;

/// A link target longer than this is left as it is; no note path comes near it.
pub const MAX_LINK_TARGET_BYTES: usize = 4_096;
/// The most notes one update changes; a plan holds no more, so applying it is never refused.
pub const MAX_LINK_UPDATE_NOTES: usize = 20_000;
pub const MAX_LINK_EDITS_PER_NOTE: usize = 10_000;
const UTF8_BYTE_ORDER_MARK: &[u8] = b"\xEF\xBB\xBF";
/// What `encodeURIComponent` keeps, less `(` and `)`, which could end a Markdown link early.
const ADDRESS_PART_ESCAPES: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'');
const KEYS_PER_QUERY: usize = 500;

/// A note renamed or moved, by its paths inside the location before and after.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMove {
    pub from: String,
    pub to: String,
}

/// Bytes `start..end` of a note, which hold `before`, become `after`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkEdit {
    pub start: usize,
    pub end: usize,
    pub before: String,
    pub after: String,
}

/// The link edits for one note, planned on the bytes whose SHA-256 is `content_hash`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLinkEdits {
    /// Where the note is now, inside the location.
    pub path: String,
    /// Where the note is once the rename is undone; the same path unless the note moved with it.
    pub path_once_undone: String,
    pub content_hash: String,
    /// In the order they appear in the note, never overlapping.
    pub edits: Vec<LinkEdit>,
}

/// A line of a note before and after its links change, for the preview.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedLine {
    /// Counted from 1, as editors show it.
    pub line_number: usize,
    pub before: String,
    pub after: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLinkUpdates {
    #[serde(flatten)]
    pub note: NoteLinkEdits,
    pub lines: Vec<ChangedLine>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NotUpdatedReason {
    /// The note is not UTF-8, so its links cannot be changed without rewriting other bytes.
    Encoding,
    /// A reference-style link, a target written with escapes or entities, or one far too long.
    NotChangeableInPlace,
    /// From that note, every target that could be written means another note of the same name.
    NoUniqueTarget,
    TooManyLinks,
    ChangedSincePlanned,
    Unavailable,
}

/// A note with links to the moved note, or that meant it, left as they are.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotUpdatedNote {
    pub path: String,
    pub reason: NotUpdatedReason,
}

/// What a rename or move would change: the link targets in each note that still name the old place.
/// A note may be in both lists when some of its links change and others cannot.
#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkUpdatePlan {
    pub notes: Vec<NoteLinkUpdates>,
    pub not_updated: Vec<NotUpdatedNote>,
}

pub fn content_hash_of(bytes: &[u8]) -> String {
    sha256_hex(bytes)
}

/// The bytes with the edits made, and the edits that undo them; `None` when an edit no longer fits.
pub fn with_edits_made(bytes: &[u8], edits: &[LinkEdit]) -> Option<(Vec<u8>, Vec<LinkEdit>)> {
    let mut edited = Vec::with_capacity(bytes.len());
    let mut undo = Vec::with_capacity(edits.len());
    let mut copied_up_to = 0;
    for edit in edits {
        if edit.start < copied_up_to || bytes.get(edit.start..edit.end)? != edit.before.as_bytes() {
            return None;
        }
        edited.extend_from_slice(bytes.get(copied_up_to..edit.start)?);
        let start = edited.len();
        edited.extend_from_slice(edit.after.as_bytes());
        undo.push(LinkEdit {
            start,
            end: edited.len(),
            before: edit.after.clone(),
            after: edit.before.clone(),
        });
        copied_up_to = edit.end;
    }
    edited.extend_from_slice(bytes.get(copied_up_to..)?);
    Some((edited, undo))
}

/// Plans the link edits a move needs, after the note and its child notes moved on disk. Links are
/// resolved as the renderer resolves them, once as the notes were and once as they are now; a
/// link that meant a note before and means another now gets a target that means it again.
/// Paths compare ignoring case, as Windows compares them.
pub fn plan_link_updates(
    connection: &Connection,
    folder: &dyn NoteFolder,
    moved: &NoteMove,
) -> Result<LinkUpdatePlan, IndexError> {
    let mut plan = LinkUpdatePlan::default();
    if moved.from == moved.to {
        return Ok(plan);
    }
    let indexed = IndexedPaths::read(connection)?;
    let moves = MovedNotes::find(connection, &indexed, moved)?;
    let keys = moves.lookup_keys();
    let mut planner = LinkPlanner {
        around: NotesAround {
            connection,
            indexed: &indexed,
            moves: &moves,
            unmoved_by_key: HashMap::new(),
        },
        folder,
        keys: &keys,
    };
    for linking in linking_notes(connection, &moves, &keys)? {
        planner.plan_note(&linking, &mut plan)?;
    }
    Ok(plan)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Side {
    BeforeMove,
    AfterMove,
}

/// A note path as Windows compares paths, ignoring case.
fn path_key(path: &str) -> String {
    path.to_lowercase()
}

/// Every note path the index knows, found by its path in any case.
struct IndexedPaths(HashMap<String, String>);

impl IndexedPaths {
    fn read(connection: &Connection) -> Result<Self, IndexError> {
        let mut statement = connection.prepare("SELECT path FROM notes")?;
        let paths = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .map(|path| path.map(|path| (path_key(&path), path)))
            .collect::<Result<_, _>>()?;
        Ok(Self(paths))
    }

    fn get(&self, path: &str) -> Option<&String> {
        self.0.get(&path_key(path))
    }

    /// The notes inside a folder, given with a `/` at its end, whatever the case of either.
    fn inside(&self, folder: &str) -> Vec<&String> {
        let folder = path_key(folder);
        let mut paths: Vec<&String> = self
            .0
            .iter()
            .filter(|(key, _)| key.starts_with(&folder))
            .map(|(_, path)| path)
            .collect();
        paths.sort();
        paths
    }
}

struct MovedNote {
    before: String,
    after: String,
    aliases: Vec<String>,
}

impl MovedNote {
    fn path_on(&self, side: Side) -> &str {
        match side {
            Side::BeforeMove => &self.before,
            Side::AfterMove => &self.after,
        }
    }

    fn found(connection: &Connection, before: String, after: String) -> Result<Self, IndexError> {
        let mut statement = connection.prepare_cached(
            "SELECT aliases.alias FROM aliases JOIN notes ON notes.id = aliases.note_id
             WHERE notes.path IN (?1, ?2)",
        )?;
        let aliases = statement
            .query_map([&before, &after], |row| row.get::<_, String>(0))?
            .collect::<Result<_, _>>()?;
        Ok(Self {
            before,
            after,
            aliases,
        })
    }
}

/// The note that moved and its child notes, which moved with it. The index may know each of them
/// by its old path or, once it has seen the move, by its new one.
struct MovedNotes(Vec<MovedNote>);

impl MovedNotes {
    fn find(
        connection: &Connection,
        indexed: &IndexedPaths,
        moved: &NoteMove,
    ) -> Result<Self, IndexError> {
        let mut notes = vec![MovedNote::found(
            connection,
            moved.from.clone(),
            moved.to.clone(),
        )?];
        let from_children = children_folder_of(&moved.from);
        let to_children = children_folder_of(&moved.to);
        for path in indexed.inside(&from_children) {
            let after = in_other_folder(path, &from_children, &to_children);
            notes.push(MovedNote::found(connection, path.clone(), after)?);
        }
        for path in indexed.inside(&to_children) {
            if notes
                .iter()
                .all(|note| path_key(&note.after) != path_key(path))
            {
                let before = in_other_folder(path, &to_children, &from_children);
                notes.push(MovedNote::found(connection, before, path.clone())?);
            }
        }
        Ok(Self(notes))
    }

    fn moved_from(&self, path: &str) -> Option<&MovedNote> {
        let key = path_key(path);
        self.0.iter().find(|note| path_key(&note.before) == key)
    }

    fn holding(&self, path: &str) -> Option<&MovedNote> {
        let key = path_key(path);
        self.0
            .iter()
            .find(|note| path_key(&note.before) == key || path_key(&note.after) == key)
    }

    fn after_of(&self, path: &str) -> String {
        self.moved_from(path)
            .map_or_else(|| path.to_owned(), |note| note.after.clone())
    }

    /// The names and aliases a link may use for a moved note, before or after the move.
    fn lookup_keys(&self) -> HashSet<String> {
        self.0
            .iter()
            .flat_map(|note| {
                [target_name_of(&note.before), target_name_of(&note.after)]
                    .into_iter()
                    .chain(note.aliases.iter().map(|alias| lookup_key(alias)))
            })
            .collect()
    }

    fn named(&self, key: &str, side: Side) -> Vec<KnownNote> {
        self.0
            .iter()
            .filter(|note| {
                target_name_of(note.path_on(side)) == key
                    || note.aliases.iter().any(|alias| lookup_key(alias) == key)
            })
            .map(|note| KnownNote {
                path: note.path_on(side).to_owned(),
                aliases: note.aliases.clone(),
            })
            .collect()
    }
}

fn children_folder_of(note: &str) -> String {
    format!("{}/", without_markdown_extension(note))
}

/// The path with the folder it is inside replaced; the parts are counted, as the case may differ.
fn in_other_folder(path: &str, folder: &str, other_folder: &str) -> String {
    let folder_parts = folder.trim_end_matches('/').split('/').count();
    let rest: Vec<&str> = path.split('/').skip(folder_parts).collect();
    format!("{other_folder}{}", rest.join("/"))
}

/// The location's notes as the index knows them, seen before or after the move.
struct NotesAround<'index> {
    connection: &'index Connection,
    indexed: &'index IndexedPaths,
    moves: &'index MovedNotes,
    unmoved_by_key: HashMap<String, Vec<KnownNote>>,
}

impl NotesAround<'_> {
    fn named(&mut self, key: &str, side: Side) -> Result<Vec<KnownNote>, IndexError> {
        if !self.unmoved_by_key.contains_key(key) {
            let unmoved = notes_named(self.connection, key)?
                .into_iter()
                .filter(|note| self.moves.holding(&note.path).is_none())
                .collect();
            self.unmoved_by_key.insert(key.to_owned(), unmoved);
        }
        let mut notes = self.unmoved_by_key.get(key).cloned().unwrap_or_default();
        notes.extend(self.moves.named(key, side));
        Ok(notes)
    }

    fn resolve_wiki(
        &mut self,
        target: &str,
        from_note: &str,
        side: Side,
    ) -> Result<Option<String>, IndexError> {
        let notes = self.named(&target_name_of(target), side)?;
        Ok(resolve_wiki_link(target, from_note, &notes))
    }

    /// The note at a path, in any case, as it was before the move.
    fn note_before(&self, path: &str) -> Option<String> {
        if let Some(moved) = self.moves.moved_from(path) {
            return Some(moved.before.clone());
        }
        if self.moves.holding(path).is_some() {
            return None;
        }
        self.indexed.get(path).cloned()
    }

    /// The target a wiki-link from a note writes for a note: as many path parts as were written,
    /// such as the bare name, or more until the target means that note and no nearer one.
    fn wiki_target_for(
        &mut self,
        note: &str,
        from_note: &str,
        written: &str,
    ) -> Result<Option<String>, IndexError> {
        let without_extension = without_markdown_extension(note);
        let extension = if without_markdown_extension(written).len() < written.len() {
            note.get(without_extension.len()..).unwrap_or_default()
        } else {
            ""
        };
        let parts: Vec<&str> = without_extension.split('/').collect();
        let written_parts = written.split('/').count().min(parts.len());
        for count in written_parts..=parts.len() {
            let target = parts
                .get(parts.len() - count..)
                .unwrap_or_default()
                .join("/");
            let meant = self.resolve_wiki(&target, from_note, Side::AfterMove)?;
            if meant.as_deref() == Some(note) {
                return Ok(Some(format!("{target}{extension}")));
            }
        }
        Ok(None)
    }
}

/// A note that may hold links to change, by its path before and after the move.
struct LinkingNote {
    before: String,
    after: String,
    has_moved: bool,
}

/// Notes with a link naming a moved note, before or after the move, and the moved notes themselves,
/// whose links to others may need another target from their new folder.
fn linking_notes(
    connection: &Connection,
    moves: &MovedNotes,
    keys: &HashSet<String>,
) -> Result<Vec<LinkingNote>, IndexError> {
    let mut sorted_keys: Vec<&str> = keys.iter().map(String::as_str).collect();
    sorted_keys.sort_unstable();
    let mut paths = Vec::new();
    for chunk in sorted_keys.chunks(KEYS_PER_QUERY) {
        paths.extend(paths_linking_to(connection, chunk)?);
    }
    for note in &moves.0 {
        if has_links(connection, &note.before)? || has_links(connection, &note.after)? {
            paths.push(note.after.clone());
        }
    }
    let mut linking: Vec<LinkingNote> = paths
        .into_iter()
        .map(|path| match moves.holding(&path) {
            Some(moved) => LinkingNote {
                before: moved.before.clone(),
                after: moved.after.clone(),
                has_moved: true,
            },
            None => LinkingNote {
                before: path.clone(),
                after: path,
                has_moved: false,
            },
        })
        .collect();
    linking.sort_by(|first, second| first.after.cmp(&second.after));
    linking.dedup_by(|first, second| path_key(&first.after) == path_key(&second.after));
    Ok(linking)
}

fn paths_linking_to(connection: &Connection, keys: &[&str]) -> Result<Vec<String>, IndexError> {
    let placeholders = vec!["?"; keys.len()].join(", ");
    let mut statement = connection.prepare(&format!(
        "SELECT DISTINCT notes.path FROM links JOIN notes ON notes.id = links.note_id
         WHERE links.target_name IN ({placeholders})"
    ))?;
    let rows = statement.query_map(params_from_iter(keys), |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn has_links(connection: &Connection, path: &str) -> Result<bool, IndexError> {
    let mut statement = connection.prepare_cached(
        "SELECT EXISTS (SELECT 1 FROM links JOIN notes ON notes.id = links.note_id WHERE notes.path = ?1)",
    )?;
    Ok(statement.query_row([path], |row| row.get(0))?)
}

/// A note's text, and whether its bytes are that text as UTF-8 after any byte order mark, so an
/// offset in the text plus the mark's length is an offset in the file.
struct NoteBytes<'bytes> {
    text: Cow<'bytes, str>,
    byte_order_mark_length: usize,
    is_exact: bool,
}

impl<'bytes> NoteBytes<'bytes> {
    fn of(bytes: &'bytes [u8]) -> Self {
        let byte_order_mark_length = if bytes.starts_with(UTF8_BYTE_ORDER_MARK) {
            UTF8_BYTE_ORDER_MARK.len()
        } else {
            0
        };
        match std::str::from_utf8(bytes.get(byte_order_mark_length..).unwrap_or_default()) {
            Ok(text) => Self {
                text: Cow::Borrowed(text),
                byte_order_mark_length,
                is_exact: true,
            },
            Err(_) => Self {
                text: Cow::Owned(decode_document_bytes(bytes).text),
                byte_order_mark_length: 0,
                is_exact: false,
            },
        }
    }
}

/// What one link needs after the move.
enum LinkChange {
    Unchanged,
    Edit(LinkEdit),
    Left(NotUpdatedReason),
}

/// The edits for one note's links, and why any other link that needed a change keeps its target.
#[derive(Default)]
struct NotePlan {
    edits: Vec<LinkEdit>,
    left: Vec<NotUpdatedReason>,
}

impl NotePlan {
    fn take(&mut self, change: LinkChange) {
        match change {
            LinkChange::Unchanged => {}
            LinkChange::Edit(edit)
                if self.edits.last().is_some_and(|last| last.end > edit.start) =>
            {
                self.leave(NotUpdatedReason::NotChangeableInPlace);
            }
            LinkChange::Edit(edit) => self.edits.push(edit),
            LinkChange::Left(reason) => self.leave(reason),
        }
    }

    fn leave(&mut self, reason: NotUpdatedReason) {
        if !self.left.contains(&reason) {
            self.left.push(reason);
        }
    }
}

struct LinkPlanner<'index> {
    around: NotesAround<'index>,
    folder: &'index dyn NoteFolder,
    keys: &'index HashSet<String>,
}

impl LinkPlanner<'_> {
    fn plan_note(
        &mut self,
        linking: &LinkingNote,
        plan: &mut LinkUpdatePlan,
    ) -> Result<(), IndexError> {
        let Ok(bytes) = self.folder.read_note_bytes(&linking.after) else {
            return Ok(());
        };
        let note = NoteBytes::of(&bytes);
        let mut note_plan = self.note_plan(&note.text, linking)?;
        let leave = |plan: &mut LinkUpdatePlan, reason| {
            plan.not_updated.push(NotUpdatedNote {
                path: linking.after.clone(),
                reason,
            });
        };
        if note_plan.edits.is_empty() && note_plan.left.is_empty() {
            return Ok(());
        }
        if !note.is_exact {
            leave(plan, NotUpdatedReason::Encoding);
            return Ok(());
        }
        let is_over_limits = note_plan.edits.len() > MAX_LINK_EDITS_PER_NOTE
            || plan.notes.len() >= MAX_LINK_UPDATE_NOTES;
        if !note_plan.edits.is_empty() && is_over_limits {
            note_plan.edits.clear();
            note_plan.leave(NotUpdatedReason::TooManyLinks);
        }
        for reason in &note_plan.left {
            leave(plan, *reason);
        }
        if !note_plan.edits.is_empty() {
            plan.notes
                .push(planned_note(&note, &bytes, linking, note_plan.edits));
        }
        Ok(())
    }

    fn note_plan(&mut self, text: &str, linking: &LinkingNote) -> Result<NotePlan, IndexError> {
        let mut links: Vec<NoteLink> = extract_note(text)
            .links
            .into_iter()
            .filter(|link| linking.has_moved || self.keys.contains(&target_name_of(&link.target)))
            .collect();
        links.sort_by_key(|link| link.target_bytes.as_ref().map(|bytes| bytes.start));
        let mut note_plan = NotePlan::default();
        for link in &links {
            note_plan.take(self.link_change(link, text, linking)?);
        }
        Ok(note_plan)
    }

    fn link_change(
        &mut self,
        link: &NoteLink,
        text: &str,
        linking: &LinkingNote,
    ) -> Result<LinkChange, IndexError> {
        let Some(meant_now) = self.meant_now_if_lost(link, linking)? else {
            return Ok(LinkChange::Unchanged);
        };
        let written = link
            .target_bytes
            .clone()
            .and_then(|bytes| Some((text.get(bytes.clone())?, bytes)));
        let Some((written, bytes)) =
            written.filter(|(written, _)| written.len() <= MAX_LINK_TARGET_BYTES)
        else {
            return Ok(LinkChange::Left(NotUpdatedReason::NotChangeableInPlace));
        };
        let after = match link.kind {
            LinkKind::Markdown => Some(note_address(&linking.after, &meant_now)),
            LinkKind::Wiki | LinkKind::Embed => {
                self.around
                    .wiki_target_for(&meant_now, &linking.after, written)?
            }
        };
        Ok(match after {
            None => LinkChange::Left(NotUpdatedReason::NoUniqueTarget),
            Some(after) if after.len() > MAX_LINK_TARGET_BYTES => {
                LinkChange::Left(NotUpdatedReason::NotChangeableInPlace)
            }
            Some(after) if after == written => LinkChange::Unchanged,
            Some(after) => LinkChange::Edit(LinkEdit {
                start: bytes.start,
                end: bytes.end,
                before: written.to_owned(),
                after,
            }),
        })
    }

    /// Where the note a link meant before the move is now, when the link no longer means it.
    fn meant_now_if_lost(
        &mut self,
        link: &NoteLink,
        linking: &LinkingNote,
    ) -> Result<Option<String>, IndexError> {
        match link.kind {
            LinkKind::Markdown => Ok(self.markdown_meant_now_if_lost(link, linking)),
            LinkKind::Wiki | LinkKind::Embed => self.wiki_meant_now_if_lost(link, linking),
        }
    }

    fn wiki_meant_now_if_lost(
        &mut self,
        link: &NoteLink,
        linking: &LinkingNote,
    ) -> Result<Option<String>, IndexError> {
        let around = &mut self.around;
        let Some(meant) = around.resolve_wiki(&link.target, &linking.before, Side::BeforeMove)?
        else {
            return Ok(None);
        };
        let meant_now = around.moves.after_of(&meant);
        let means_now = around.resolve_wiki(&link.target, &linking.after, Side::AfterMove)?;
        Ok((means_now.as_deref() != Some(meant_now.as_str())).then_some(meant_now))
    }

    fn markdown_meant_now_if_lost(&self, link: &NoteLink, linking: &LinkingNote) -> Option<String> {
        let written_path = resolve_markdown_link(&linking.before, &link.target)?;
        let meant = self.around.note_before(&written_path)?;
        let meant_now = self.around.moves.after_of(&meant);
        let means_now = resolve_markdown_link(&linking.after, &link.target);
        let still_means_it = means_now.is_some_and(|path| path_key(&path) == path_key(&meant_now));
        (!still_means_it).then_some(meant_now)
    }
}

fn planned_note(
    note: &NoteBytes<'_>,
    bytes: &[u8],
    linking: &LinkingNote,
    edits: Vec<LinkEdit>,
) -> NoteLinkUpdates {
    let shift = note.byte_order_mark_length;
    NoteLinkUpdates {
        lines: changed_lines(&note.text, &edits),
        note: NoteLinkEdits {
            path: linking.after.clone(),
            path_once_undone: linking.before.clone(),
            content_hash: content_hash_of(bytes),
            edits: edits
                .into_iter()
                .map(|edit| LinkEdit {
                    start: edit.start + shift,
                    end: edit.end + shift,
                    ..edit
                })
                .collect(),
        },
    }
}

/// The relative address of a note from another, each part percent-encoded, as the app writes it.
fn note_address(from_note: &str, to_note: &str) -> String {
    let from_folder = folder_of(from_note);
    let to_folder = folder_of(to_note);
    let shared = shared_depth(&from_folder, &to_folder);
    let upwards = std::iter::repeat_n("..".to_owned(), from_folder.len().saturating_sub(shared));
    let downwards = to_note
        .split('/')
        .skip(shared)
        .map(|part| utf8_percent_encode(part, ADDRESS_PART_ESCAPES).to_string());
    upwards.chain(downwards).collect::<Vec<_>>().join("/")
}

/// Each line holding an edit, before and after all of its edits.
fn changed_lines(text: &str, edits: &[LinkEdit]) -> Vec<ChangedLine> {
    let lines = LineStarts::of(text);
    edits
        .chunk_by(|first, second| lines.line_of(first.start) == lines.line_of(second.start))
        .filter_map(|line_edits| {
            let line = lines.line_of(line_edits.first()?.start);
            changed_line(text, line + 1, line_edits)
        })
        .collect()
}

fn changed_line(text: &str, line_number: usize, edits: &[LinkEdit]) -> Option<ChangedLine> {
    let first = edits.first()?;
    let start = text
        .get(..first.start)?
        .rfind('\n')
        .map_or(0, |index| index + 1);
    let end = text
        .get(first.start..)?
        .find('\n')
        .map_or(text.len(), |index| first.start + index);
    let mut after = String::new();
    let mut copied_up_to = start;
    for edit in edits {
        after.push_str(text.get(copied_up_to..edit.start)?);
        after.push_str(&edit.after);
        copied_up_to = edit.end;
    }
    after.push_str(text.get(copied_up_to..end)?);
    Some(ChangedLine {
        line_number,
        before: text.get(start..end)?.trim_end_matches('\r').to_owned(),
        after: after.trim_end_matches('\r').to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::notes_index::index_build::{BuildProgress, ListedNote, reconcile_index};
    use crate::notes_index::index_store::{NotesIndex, index_file_path};

    /// Notes by path, as bytes, the way a location holds them.
    #[derive(Clone, Default)]
    struct Notes(BTreeMap<String, Vec<u8>>);

    impl Notes {
        fn of(notes: &[(&str, &str)]) -> Self {
            Self(
                notes
                    .iter()
                    .map(|(path, text)| ((*path).to_owned(), text.as_bytes().to_vec()))
                    .collect(),
            )
        }

        /// The notes after a note and its child notes moved, keeping every byte.
        fn after_moving(&self, moved: &NoteMove) -> Self {
            let from_children = children_folder_of(&moved.from);
            let to_children = children_folder_of(&moved.to);
            let moved_path = |path: &str| {
                if path == moved.from {
                    return moved.to.clone();
                }
                if path_key(path).starts_with(&path_key(&from_children)) {
                    return in_other_folder(path, &from_children, &to_children);
                }
                path.to_owned()
            };
            Self(
                self.0
                    .iter()
                    .map(|(path, bytes)| (moved_path(path), bytes.clone()))
                    .collect(),
            )
        }

        fn text_of(&self, path: &str) -> String {
            String::from_utf8(self.0[path].clone()).unwrap()
        }
    }

    impl NoteFolder for Notes {
        fn list_notes(&self) -> Result<Vec<ListedNote>, IndexError> {
            Ok(self
                .0
                .iter()
                .map(|(path, bytes)| ListedNote {
                    path: path.clone(),
                    size_bytes: bytes.len() as u64,
                    modified_at_ms: 1,
                    is_online_only: false,
                })
                .collect())
        }

        fn read_note(&self, path: &str) -> Result<String, IndexError> {
            Ok(decode_document_bytes(&self.read_note_bytes(path)?).text)
        }

        fn read_note_bytes(&self, path: &str) -> Result<Vec<u8>, IndexError> {
            self.0
                .get(path)
                .cloned()
                .ok_or_else(|| std::io::Error::from(std::io::ErrorKind::NotFound).into())
        }
    }

    struct Moved {
        _index_folder: tempfile::TempDir,
        plan: LinkUpdatePlan,
        notes: Notes,
    }

    fn index_of(folder: &tempfile::TempDir, notes: &Notes) -> NotesIndex {
        let mut index = NotesIndex::open(&index_file_path(folder.path(), "location-1"))
            .unwrap()
            .0;
        reconcile_index(&mut index, notes, &|| false, &mut |_: BuildProgress| {}).unwrap();
        index
    }

    /// Indexes the notes, moves one on "disk" and plans its link updates, as the window does.
    fn moved(notes: &Notes, from: &str, to: &str) -> Moved {
        let index_folder = tempfile::tempdir().unwrap();
        let index = index_of(&index_folder, notes);
        let moved = NoteMove {
            from: from.to_owned(),
            to: to.to_owned(),
        };
        let after = notes.after_moving(&moved);
        let plan = plan_link_updates(index.connection(), &after, &moved).unwrap();
        Moved {
            _index_folder: index_folder,
            plan,
            notes: after,
        }
    }

    impl Moved {
        /// The notes with the planned edits made.
        fn applied(&self) -> Notes {
            let mut notes = self.notes.clone();
            for planned in &self.plan.notes {
                let bytes = notes.0.get_mut(&planned.note.path).unwrap();
                assert_eq!(content_hash_of(bytes), planned.note.content_hash);
                *bytes = with_edits_made(bytes, &planned.note.edits).unwrap().0;
            }
            notes
        }

        fn planned_paths(&self) -> Vec<&str> {
            self.plan
                .notes
                .iter()
                .map(|planned| planned.note.path.as_str())
                .collect()
        }
    }

    #[test]
    fn wiki_links_with_headings_follow_the_rename() {
        let notes = Notes::of(&[
            ("Draft.md", "# Draft\n\n## Goals\n"),
            ("Inbox.md", "# Inbox\n\nSee [[Draft]] today.\n"),
            ("Ideas.md", "Also [[Draft]], twice: [[Draft]].\n"),
            (
                "Review.md",
                "---\ntitle: Review\n---\nRead [[Draft#Goals]] first.\n",
            ),
        ]);

        let moved = moved(&notes, "Draft.md", "Plan.md");
        let applied = moved.applied();

        assert_eq!(
            applied.text_of("Inbox.md"),
            "# Inbox\n\nSee [[Plan]] today.\n"
        );
        assert_eq!(
            applied.text_of("Ideas.md"),
            "Also [[Plan]], twice: [[Plan]].\n"
        );
        assert_eq!(
            applied.text_of("Review.md"),
            "---\ntitle: Review\n---\nRead [[Plan#Goals]] first.\n"
        );
        let review = &moved.plan.notes[2];
        assert_eq!(
            review.lines,
            vec![ChangedLine {
                line_number: 4,
                before: "Read [[Draft#Goals]] first.".to_owned(),
                after: "Read [[Plan#Goals]] first.".to_owned()
            }]
        );
        assert_eq!(moved.plan.notes[1].lines.len(), 1);
        assert!(moved.plan.not_updated.is_empty());
    }

    #[test]
    fn shown_text_aliases_and_embeds_are_kept_as_written() {
        let notes = Notes::of(&[
            ("Draft.md", "---\naliases: [Q3]\n---\n# Draft\n"),
            (
                "Inbox.md",
                "[[Draft|the draft]], [[q3]], ![[Draft]] and [[ draft.md #Goals | it ]]\n",
            ),
        ]);

        let applied = moved(&notes, "Draft.md", "Plan.md").applied();

        assert_eq!(
            applied.text_of("Inbox.md"),
            "[[Plan|the draft]], [[q3]], ![[Plan]] and [[ Plan.md #Goals | it ]]\n"
        );
    }

    #[test]
    fn links_in_code_are_untouched() {
        let notes = Notes::of(&[
            ("Draft.md", "# Draft\n"),
            (
                "Inbox.md",
                "`[[Draft]]`\n\n```\n[[Draft]] [d](Draft.md)\n```\n\n[[Draft]]\n",
            ),
        ]);

        let applied = moved(&notes, "Draft.md", "Plan.md").applied();

        assert_eq!(
            applied.text_of("Inbox.md"),
            "`[[Draft]]`\n\n```\n[[Draft]] [d](Draft.md)\n```\n\n[[Plan]]\n"
        );
    }

    #[test]
    fn a_bare_name_stays_bare_unless_a_nearer_note_would_take_it() {
        let notes = Notes::of(&[
            ("Projects/Draft.md", ""),
            ("Projects/Inbox.md", "[[Draft]]\n"),
            ("Archive/Plan.md", ""),
            ("Archive/Inbox.md", "[[Draft]]\n"),
        ]);

        let applied = moved(&notes, "Projects/Draft.md", "Projects/Plan.md").applied();

        assert_eq!(applied.text_of("Projects/Inbox.md"), "[[Plan]]\n");
        assert_eq!(applied.text_of("Archive/Inbox.md"), "[[Projects/Plan]]\n");
    }

    #[test]
    fn a_renamed_note_does_not_take_the_links_of_another_note() {
        let notes = Notes::of(&[
            ("Archive/Plan.md", ""),
            ("Projects/Draft.md", ""),
            ("Projects/Inbox.md", "The old [[Plan]].\n"),
        ]);

        let applied = moved(&notes, "Projects/Draft.md", "Projects/Plan.md").applied();

        assert_eq!(
            applied.text_of("Projects/Inbox.md"),
            "The old [[Archive/Plan]].\n"
        );
    }

    #[test]
    fn path_links_follow_a_move_and_bare_names_stay() {
        let notes = Notes::of(&[
            ("Old/Draft.md", ""),
            (
                "Inbox.md",
                "[[Draft]], [[Old/Draft#Goals]] and [d](Old/Draft.md#goals)\n",
            ),
        ]);

        let moved = moved(&notes, "Old/Draft.md", "Archive/Draft.md");

        assert_eq!(
            moved.applied().text_of("Inbox.md"),
            "[[Draft]], [[Archive/Draft#Goals]] and [d](Archive/Draft.md#goals)\n"
        );
        assert_eq!(moved.plan.notes[0].note.edits.len(), 2);
    }

    #[test]
    fn markdown_links_keep_their_anchor_and_encode_spaces() {
        let notes = Notes::of(&[
            ("Draft.md", ""),
            (
                "Projects/Work.md",
                "[d](../Draft.md#goals) and [e](<../Draft.md> \"title\")\n",
            ),
        ]);

        let applied = moved(&notes, "Draft.md", "My Plan (v2).md").applied();

        assert_eq!(
            applied.text_of("Projects/Work.md"),
            "[d](../My%20Plan%20%28v2%29.md#goals) and [e](<../My%20Plan%20%28v2%29.md> \"title\")\n"
        );
    }

    #[test]
    fn the_moved_notes_own_links_follow_it() {
        let notes = Notes::of(&[
            (
                "Draft.md",
                "[i](Inbox.md), [[#Goals]] and [[Draft#Goals]]\n\n# Goals\n",
            ),
            ("Inbox.md", ""),
        ]);

        let moved = moved(&notes, "Draft.md", "Archive/Plan.md");

        assert_eq!(
            moved.applied().text_of("Archive/Plan.md"),
            "[i](../Inbox.md), [[#Goals]] and [[Plan#Goals]]\n\n# Goals\n"
        );
        assert_eq!(moved.plan.notes[0].note.path_once_undone, "Draft.md");
    }

    #[test]
    fn child_notes_moved_with_the_note_keep_their_links() {
        let notes = Notes::of(&[
            ("Projects.md", "# Projects\n"),
            ("Projects/Sub.md", "[up](../Projects.md)\n"),
            ("Inbox.md", "[[Projects/Sub]] and [s](Projects/Sub.md)\n"),
        ]);

        let moved = moved(&notes, "Projects.md", "Work.md");
        let applied = moved.applied();

        assert_eq!(
            applied.text_of("Inbox.md"),
            "[[Work/Sub]] and [s](Work/Sub.md)\n"
        );
        assert_eq!(applied.text_of("Work/Sub.md"), "[up](../Work.md)\n");
        assert_eq!(moved.planned_paths(), vec!["Inbox.md", "Work/Sub.md"]);
        assert_eq!(moved.plan.notes[1].note.path_once_undone, "Projects/Sub.md");
    }

    #[test]
    fn the_plan_is_the_same_once_the_index_has_seen_the_move() {
        let notes = Notes::of(&[
            ("Projects.md", "[[Inbox]]\n"),
            ("Projects/Sub.md", "[up](../Projects.md)\n"),
            ("Inbox.md", "[[Projects]] and [[Projects/Sub]]\n"),
        ]);
        let moved_note = NoteMove {
            from: "Projects.md".to_owned(),
            to: "Archive/Work.md".to_owned(),
        };
        let after = notes.after_moving(&moved_note);
        let index_folder = tempfile::tempdir().unwrap();
        let index_after = index_of(&index_folder, &after);

        let planned_late =
            plan_link_updates(index_after.connection(), &after, &moved_note).unwrap();

        assert_eq!(
            planned_late,
            moved(&notes, "Projects.md", "Archive/Work.md").plan
        );
        assert_eq!(planned_late.notes.len(), 2);
    }

    fn not_updated(plan: &LinkUpdatePlan) -> Vec<(&str, NotUpdatedReason)> {
        plan.not_updated
            .iter()
            .map(|note| (note.path.as_str(), note.reason))
            .collect()
    }

    #[test]
    fn a_reference_link_or_an_escaped_target_is_reported_not_changed_in_place() {
        let notes = Notes::of(&[
            ("Draft.md", ""),
            (
                "Inbox.md",
                "[the draft][d] and [[Draft]]\n\n[d]: Draft.md\n",
            ),
            ("Ideas.md", "[escaped](Dr&#97;ft.md)\n"),
        ]);

        let moved = moved(&notes, "Draft.md", "Plan.md");

        assert_eq!(
            moved.applied().text_of("Inbox.md"),
            "[the draft][d] and [[Plan]]\n\n[d]: Draft.md\n"
        );
        assert_eq!(
            not_updated(&moved.plan),
            vec![
                ("Ideas.md", NotUpdatedReason::NotChangeableInPlace),
                ("Inbox.md", NotUpdatedReason::NotChangeableInPlace)
            ]
        );
    }

    #[test]
    fn a_link_no_target_can_keep_meaning_its_note_is_reported() {
        let notes = Notes::of(&[
            ("Plan.md", "# The old plan\n"),
            ("Projects/Draft.md", ""),
            ("Projects/Inbox.md", "The old [[Plan]].\n"),
        ]);

        let moved = moved(&notes, "Projects/Draft.md", "Projects/Plan.md");

        assert!(moved.plan.notes.is_empty());
        assert_eq!(
            not_updated(&moved.plan),
            vec![("Projects/Inbox.md", NotUpdatedReason::NoUniqueTarget)]
        );
    }

    #[test]
    fn the_moved_notes_own_link_to_a_same_named_note_at_the_top_is_reported() {
        let notes = Notes::of(&[
            ("Plan.md", ""),
            ("Archive/Plan.md", ""),
            ("Draft.md", "See [[Plan]].\n"),
        ]);

        let moved = moved(&notes, "Draft.md", "Archive/Draft.md");

        assert!(moved.plan.notes.is_empty());
        assert_eq!(
            not_updated(&moved.plan),
            vec![("Archive/Draft.md", NotUpdatedReason::NoUniqueTarget)]
        );
    }

    #[test]
    fn child_notes_and_markdown_links_match_in_any_case() {
        let notes = Notes::of(&[
            ("Draft.md", ""),
            ("draft/Sub.md", "[up](../DRAFT.md)\n"),
            (
                "Inbox.md",
                "[[draft/Sub]], [s](draft/Sub.md) and [d](draft.md#goals)\n",
            ),
        ]);

        let moved = moved(&notes, "Draft.md", "Plan.md");
        let applied = moved.applied();

        assert_eq!(
            applied.text_of("Inbox.md"),
            "[[Plan/Sub]], [s](Plan/Sub.md) and [d](Plan.md#goals)\n"
        );
        assert_eq!(applied.text_of("Plan/Sub.md"), "[up](../Plan.md)\n");
        assert_eq!(moved.plan.notes[1].note.path_once_undone, "draft/Sub.md");
    }

    #[test]
    fn a_markdown_link_in_another_case_that_still_means_its_note_is_kept() {
        let notes = Notes::of(&[
            ("Projects/Draft.md", ""),
            ("Projects/Inbox.md", "[d](draft.md) and [i](../inbox.md)\n"),
            ("Inbox.md", ""),
        ]);

        let moved = moved(&notes, "Projects/Inbox.md", "Projects/Notes.md");

        assert!(moved.plan.notes.is_empty());
        assert!(moved.plan.not_updated.is_empty());
    }

    #[test]
    fn a_plan_never_holds_more_edits_than_an_update_accepts() {
        let many_links = "[[Draft]] ".repeat(MAX_LINK_EDITS_PER_NOTE + 1);
        let notes = Notes::of(&[
            ("Draft.md", ""),
            ("Inbox.md", many_links.as_str()),
            ("Ideas.md", "[[Draft]]\n"),
        ]);

        let moved = moved(&notes, "Draft.md", "Plan.md");

        assert_eq!(moved.planned_paths(), vec!["Ideas.md"]);
        assert_eq!(
            not_updated(&moved.plan),
            vec![("Inbox.md", NotUpdatedReason::TooManyLinks)]
        );
    }

    #[test]
    fn crlf_and_the_byte_order_mark_are_kept() {
        let notes = Notes::of(&[
            ("Draft.md", ""),
            ("Inbox.md", "\u{FEFF}# Inbox\r\n\r\nSee [[Draft]].\r\n"),
        ]);

        let moved = moved(&notes, "Draft.md", "Plan.md");

        assert_eq!(
            moved.applied().text_of("Inbox.md"),
            "\u{FEFF}# Inbox\r\n\r\nSee [[Plan]].\r\n"
        );
        assert_eq!(moved.plan.notes[0].lines[0].before, "See [[Draft]].");
    }

    #[test]
    fn a_note_in_another_encoding_is_left_out_and_reported() {
        let mut notes = Notes::of(&[("Draft.md", "")]);
        let utf16: Vec<u8> = [0xFF, 0xFE]
            .into_iter()
            .chain("See [[Draft]].\n".encode_utf16().flat_map(u16::to_le_bytes))
            .collect();
        notes.0.insert("Inbox.md".to_owned(), utf16);

        let moved = moved(&notes, "Draft.md", "Plan.md");

        assert!(moved.plan.notes.is_empty());
        assert_eq!(
            moved.plan.not_updated,
            vec![NotUpdatedNote {
                path: "Inbox.md".to_owned(),
                reason: NotUpdatedReason::Encoding
            }]
        );
    }

    #[test]
    fn an_edit_that_no_longer_fits_the_bytes_is_refused() {
        let edit = |start: usize, end: usize, before: &str| LinkEdit {
            start,
            end,
            before: before.to_owned(),
            after: "Plan".to_owned(),
        };

        assert!(with_edits_made(b"[[Draft]]", &[edit(2, 7, "Draft")]).is_some());
        assert!(with_edits_made(b"[[Drift]]", &[edit(2, 7, "Draft")]).is_none());
        assert!(with_edits_made(b"[[Draft]]", &[edit(2, 70, "Draft")]).is_none());
        assert!(with_edits_made(b"[[Draft]]", &[edit(2, 7, "Draft"), edit(4, 7, "aft")]).is_none());
    }

    /// A small random number source, so the generated notes are the same on every run.
    struct Seeded(u64);

    impl Seeded {
        fn below(&mut self, bound: usize) -> usize {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            (self.0 % bound as u64) as usize
        }
    }

    /// How a generated scenario moves `Draft.md`, and what each kind of link to it becomes.
    struct Scenario {
        to: &'static str,
        wiki_target: Option<&'static str>,
        markdown_target: fn(is_in_folder: bool) -> String,
    }

    const SCENARIOS: [Scenario; 2] = [
        Scenario {
            to: "Plan.md",
            wiki_target: Some("Plan"),
            markdown_target: |is_in_folder| {
                if is_in_folder {
                    "../Plan.md"
                } else {
                    "Plan.md"
                }
                .to_owned()
            },
        },
        Scenario {
            to: "Archive/Draft.md",
            wiki_target: None,
            markdown_target: |is_in_folder| {
                if is_in_folder {
                    "../Archive/Draft.md"
                } else {
                    "Archive/Draft.md"
                }
                .to_owned()
            },
        },
    ];

    /// A note built from random pieces, with the edits a correct plan makes to it.
    struct GeneratedNote {
        bytes: Vec<u8>,
        expected: Vec<LinkEdit>,
        line_ending: &'static str,
        wiki_target: Option<String>,
        markdown_written: &'static str,
        markdown_target: String,
        has_reference_link: bool,
    }

    const WORDS: [&str; 8] = [
        "café",
        "notes",
        "తెలుగు",
        "Draft",
        "plan",
        "#tag",
        "日本語",
        "draft.md",
    ];

    impl GeneratedNote {
        fn new(random: &mut Seeded, scenario: &Scenario, is_in_folder: bool) -> Self {
            let has_byte_order_mark = random.below(3) == 0;
            Self {
                bytes: if has_byte_order_mark {
                    UTF8_BYTE_ORDER_MARK.to_vec()
                } else {
                    Vec::new()
                },
                expected: Vec::new(),
                line_ending: if random.below(2) == 0 { "\n" } else { "\r\n" },
                wiki_target: scenario.wiki_target.map(str::to_owned),
                markdown_written: if is_in_folder {
                    "../Draft.md"
                } else {
                    "Draft.md"
                },
                markdown_target: (scenario.markdown_target)(is_in_folder),
                has_reference_link: false,
            }
        }

        fn push(&mut self, text: &str) {
            self.bytes.extend_from_slice(text.as_bytes());
        }

        /// Writes the three parts, expecting the middle one to become `new_target` if there is one.
        fn push_link(
            &mut self,
            (before, target, after): (&str, &str, &str),
            new_target: Option<String>,
        ) {
            self.push(before);
            let start = self.bytes.len();
            self.push(target);
            if let Some(new_target) = new_target {
                self.expected.push(LinkEdit {
                    start,
                    end: start + target.len(),
                    before: target.to_owned(),
                    after: new_target,
                });
            }
            self.push(after);
        }

        /// Ends the note with the definition its reference-style links use, which cannot change in place.
        fn finish(&mut self) {
            if self.has_reference_link {
                let line_ending = self.line_ending;
                let written = self.markdown_written;
                self.push(&format!(
                    "{line_ending}{line_ending}[d]: {written}{line_ending}"
                ));
            }
        }

        fn push_random_piece(&mut self, random: &mut Seeded) {
            let wiki = self.wiki_target.clone();
            let markdown = Some(self.markdown_target.clone());
            let written = self.markdown_written;
            let line_ending = self.line_ending;
            match random.below(12) {
                0 => self.push_link(("[[", "Draft", "]]"), wiki),
                1 => self.push_link(("[[", "Draft", "#Goals]]"), wiki),
                2 => self.push_link(("![[", "Draft", "|shown text]]"), wiki),
                3 => self.push_link(("[[  ", "draft", " ]]"), wiki),
                4 => self.push_link(("[the draft](", written, ")"), markdown),
                5 => self.push_link(("[goals](", written, "#goals)"), markdown),
                6 => self.push("[[Other]] [o](https://example.com/Draft.md)"),
                7 => self.push("`[[Draft]]` and `[d](Draft.md)`"),
                8 => self.push(&format!(
                    "{line_ending}```{line_ending}[[Draft]] [d](Draft.md){line_ending}```{line_ending}"
                )),
                9 => self.push(line_ending),
                10 => {
                    self.push("[the reference][d]");
                    self.has_reference_link = true;
                }
                _ => self.push(WORDS[random.below(WORDS.len())]),
            }
            self.push(if random.below(4) == 0 {
                line_ending
            } else {
                " "
            });
        }
    }

    /// Generated notes, the edits a correct plan makes in each, and the notes it reports as left.
    struct GeneratedLocation {
        notes: Notes,
        expected: BTreeMap<String, Vec<LinkEdit>>,
        expected_left: Vec<String>,
    }

    /// Notes with random text, code and links, and what a correct plan does with each.
    fn generated_location(random: &mut Seeded, scenario: &Scenario) -> GeneratedLocation {
        let mut notes = Notes::of(&[("Draft.md", "# Draft\n\n## Goals\n"), ("Other.md", "")]);
        let mut expected = BTreeMap::new();
        let mut expected_left = Vec::new();
        for number in 0..random.below(4) + 2 {
            let is_in_folder = random.below(2) == 0;
            let path = if is_in_folder {
                format!("Projects/Note {number}.md")
            } else {
                format!("Note {number}.md")
            };
            let mut note = GeneratedNote::new(random, scenario, is_in_folder);
            for _ in 0..random.below(12) + 4 {
                note.push_random_piece(random);
            }
            note.finish();
            if note.has_reference_link {
                expected_left.push(path.clone());
            }
            notes.0.insert(path.clone(), note.bytes);
            if !note.expected.is_empty() {
                expected.insert(path, note.expected);
            }
        }
        expected_left.sort();
        GeneratedLocation {
            notes,
            expected,
            expected_left,
        }
    }

    #[test]
    fn only_link_bytes_change() {
        let mut edited_links = 0;
        for seed in 1..=150_u64 {
            let mut random = Seeded(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15));
            let scenario = &SCENARIOS[random.below(SCENARIOS.len())];
            let location = generated_location(&mut random, scenario);

            let moved = moved(&location.notes, "Draft.md", scenario.to);

            let planned: BTreeMap<String, Vec<LinkEdit>> = moved
                .plan
                .notes
                .iter()
                .map(|planned| (planned.note.path.clone(), planned.note.edits.clone()))
                .collect();
            assert_eq!(planned, location.expected, "seed {seed}");
            let mut left: Vec<String> = moved
                .plan
                .not_updated
                .iter()
                .map(|note| note.path.clone())
                .collect();
            left.sort();
            assert_eq!(left, location.expected_left, "seed {seed}");
            edited_links += planned.values().map(Vec::len).sum::<usize>();
            for planned in &moved.plan.notes {
                let original = &moved.notes.0[&planned.note.path];
                let (edited, undo) = with_edits_made(original, &planned.note.edits).unwrap();
                assert_only_edited_bytes_differ(original, &edited, &planned.note.edits);
                let undone = with_edits_made(&edited, &undo).unwrap().0;
                assert_eq!(&undone, original, "seed {seed}");
            }
        }
        assert!(
            edited_links > 500,
            "the generated notes changed only {edited_links} links"
        );
    }

    fn assert_only_edited_bytes_differ(original: &[u8], edited: &[u8], edits: &[LinkEdit]) {
        let mut original_at = 0;
        let mut edited_at = 0;
        for edit in edits {
            let unchanged = edit.start - original_at;
            assert_eq!(
                original[original_at..edit.start],
                edited[edited_at..edited_at + unchanged]
            );
            original_at = edit.end;
            edited_at += unchanged + edit.after.len();
        }
        assert_eq!(original[original_at..], edited[edited_at..]);
    }

    #[test]
    fn a_note_address_climbs_out_of_folders_and_encodes_each_part() {
        assert_eq!(note_address("Inbox.md", "Plan.md"), "Plan.md");
        assert_eq!(
            note_address("A/B/Inbox.md", "A/C/My Plan.md"),
            "../C/My%20Plan.md"
        );
        assert_eq!(note_address("A/Inbox.md", "A/B/Café.md"), "B/Caf%C3%A9.md");
    }
}
