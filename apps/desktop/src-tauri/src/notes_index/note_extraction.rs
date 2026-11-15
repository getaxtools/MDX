use std::ops::Range;

use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use sha2::{Digest, Sha256};

use super::front_matter::{FrontMatter, read_front_matter};

/// What the index keeps of one note; the note's text itself is never stored.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct ExtractedNote {
    pub headings: Vec<NoteHeading>,
    pub sections: Vec<NoteSection>,
    pub links: Vec<NoteLink>,
    pub tags: Vec<String>,
    pub tasks: Vec<NoteTask>,
    pub front_matter: FrontMatter,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteHeading {
    pub level: u8,
    /// The text the renderer makes the heading's anchor from.
    pub text: String,
    /// Counted from 0 over the whole note, front matter included.
    pub line: usize,
}

/// A stretch of the note from one heading to the next; the stretches cover the note without gaps.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteSection {
    /// The heading the section starts with; `None` for the text before the first heading.
    pub heading: Option<usize>,
    pub bytes: Range<usize>,
    /// SHA-256 of the section's bytes, as lowercase hex.
    pub hash: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkKind {
    Markdown,
    Wiki,
    Embed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteLink {
    pub kind: LinkKind,
    pub target: String,
    pub heading: Option<String>,
    pub line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteTask {
    pub line: usize,
    pub is_done: bool,
    pub text: String,
}

const WIKI_OPENING: &str = "[[";
const WIKI_CLOSING: &str = "]]";
const MARKDOWN_EXTENSIONS: [&str; 2] = [".md", ".markdown"];
/// Punctuation that ends a tag besides ASCII punctuation; `_`, `-` and `/` stay part of it.
const TAG_ENDING_PUNCTUATION: &str = "、。，．：；！？「」『』（）【】“”‘’…—–«»·";

pub fn extract_note(text: &str) -> ExtractedNote {
    let front_matter = read_front_matter(text);
    let body_start = front_matter.body_start;
    let lines = LineStarts::of(text);
    let parsed = parse_body(
        &NoteText {
            text,
            lines: &lines,
        },
        body_start,
    );
    let skipped: Vec<Range<usize>> = std::iter::once(0..body_start)
        .chain(parsed.code.iter().cloned())
        .collect();
    let links = [parsed.links, scan_wiki_links(text, &skipped, &lines)].concat();
    let tag_skipped = [skipped, wiki_link_ranges(text)].concat();
    ExtractedNote {
        sections: sections_of(text, &parsed.heading_starts),
        headings: parsed.headings,
        links,
        tags: scan_tags(text, &tag_skipped),
        tasks: parsed.tasks,
        front_matter: front_matter.front_matter,
    }
}

#[derive(Default)]
struct ParsedBody {
    headings: Vec<NoteHeading>,
    heading_starts: Vec<usize>,
    links: Vec<NoteLink>,
    tasks: Vec<NoteTask>,
    code: Vec<Range<usize>>,
    open_heading: Option<(u8, usize, String)>,
}

/// A note's text with where its lines start.
struct NoteText<'text> {
    text: &'text str,
    lines: &'text LineStarts,
}

/// Parses the note after its front matter; every range is an offset into the whole note.
fn parse_body(note: &NoteText<'_>, body_start: usize) -> ParsedBody {
    let mut parsed = ParsedBody::default();
    let body = note.text.get(body_start..).unwrap_or_default();
    let options = Options::ENABLE_TASKLISTS | Options::ENABLE_TABLES | Options::ENABLE_FOOTNOTES;
    for (event, range) in Parser::new_ext(body, options).into_offset_iter() {
        parsed.take(
            event,
            range.start + body_start..range.end + body_start,
            note,
        );
    }
    parsed
}

impl ParsedBody {
    fn take(&mut self, event: Event<'_>, range: Range<usize>, note: &NoteText<'_>) {
        let lines = note.lines;
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                self.open_heading = Some((level as u8, range.start, String::new()));
            }
            Event::Text(text) => self.add_heading_text(&text),
            Event::Code(code) => {
                self.code.push(range);
                self.add_heading_text(&code);
            }
            Event::End(TagEnd::Heading(_)) => self.close_heading(lines),
            Event::Start(Tag::Link { dest_url, .. }) if is_note_address(&dest_url) => {
                self.links
                    .push(markdown_link(&dest_url, lines.line_of(range.start)));
            }
            Event::Start(Tag::CodeBlock(_)) => self.code.push(range),
            Event::TaskListMarker(is_done) => {
                self.tasks.push(task_at(note.text, &range, is_done, lines));
            }
            _ => {}
        }
    }

    fn add_heading_text(&mut self, text: &str) {
        if let Some((_, _, heading_text)) = self.open_heading.as_mut() {
            heading_text.push_str(text);
        }
    }

    fn close_heading(&mut self, lines: &LineStarts) {
        let Some((level, start, heading_text)) = self.open_heading.take() else {
            return;
        };
        self.headings.push(NoteHeading {
            level,
            text: heading_text
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" "),
            line: lines.line_of(start),
        });
        self.heading_starts.push(start);
    }
}

/// A link to another note: relative, not to a web address and not only a heading of this note.
fn is_note_address(address: &str) -> bool {
    !address.is_empty() && !address.starts_with('#') && !address.contains(':')
}

fn markdown_link(address: &str, line: usize) -> NoteLink {
    let (target, heading) = match address.split_once('#') {
        Some((target, heading)) => (target, Some(heading.to_owned())),
        None => (address, None),
    };
    let decoded = percent_encoding::percent_decode_str(target).decode_utf8_lossy();
    NoteLink {
        kind: LinkKind::Markdown,
        target: decoded.into_owned(),
        heading,
        line,
    }
}

fn task_at(text: &str, marker: &Range<usize>, is_done: bool, lines: &LineStarts) -> NoteTask {
    let line = lines.line_of(marker.start);
    let after_marker = text
        .get(marker.end..)
        .unwrap_or_default()
        .lines()
        .next()
        .unwrap_or_default();
    NoteTask {
        line,
        is_done,
        text: after_marker.trim().to_owned(),
    }
}

fn sections_of(text: &str, starts: &[usize]) -> Vec<NoteSection> {
    let mut boundaries: Vec<(Option<usize>, usize)> = Vec::with_capacity(starts.len() + 1);
    if starts.first().is_none_or(|first| *first > 0) {
        boundaries.push((None, 0));
    }
    boundaries.extend(
        starts
            .iter()
            .enumerate()
            .map(|(index, start)| (Some(index), *start)),
    );
    let ends = boundaries
        .iter()
        .skip(1)
        .map(|(_, start)| *start)
        .chain(std::iter::once(text.len()));
    boundaries
        .iter()
        .zip(ends)
        .map(|((heading, start), end)| NoteSection {
            heading: *heading,
            bytes: *start..end,
            hash: sha256_hex(text.as_bytes().get(*start..end).unwrap_or_default()),
        })
        .collect()
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn scan_wiki_links(text: &str, skipped: &[Range<usize>], lines: &LineStarts) -> Vec<NoteLink> {
    wiki_link_spans(text)
        .filter(|span| !is_inside_any(span.outer.start, skipped))
        .filter_map(|span| {
            let inner = text.get(span.inner.clone())?;
            let (target, heading) = wiki_link_parts(inner)?;
            let is_embed =
                span.outer.start > 0 && text.as_bytes().get(span.outer.start - 1) == Some(&b'!');
            Some(NoteLink {
                kind: if is_embed {
                    LinkKind::Embed
                } else {
                    LinkKind::Wiki
                },
                target,
                heading,
                line: lines.line_of(span.outer.start),
            })
        })
        .collect()
}

fn wiki_link_ranges(text: &str) -> Vec<Range<usize>> {
    wiki_link_spans(text).map(|span| span.outer).collect()
}

struct WikiLinkSpan {
    outer: Range<usize>,
    inner: Range<usize>,
}

/// `[[…]]` on one line with no brackets inside, as the renderer reads them.
fn wiki_link_spans(text: &str) -> impl Iterator<Item = WikiLinkSpan> + '_ {
    text.match_indices(WIKI_OPENING).filter_map(|(start, _)| {
        let inner_start = start + WIKI_OPENING.len();
        let rest = text.get(inner_start..)?;
        let inner_length = rest.find(WIKI_CLOSING)?;
        let inner = rest.get(..inner_length)?;
        if inner.trim().is_empty() || inner.contains(['[', ']', '\n']) {
            return None;
        }
        Some(WikiLinkSpan {
            outer: start..inner_start + inner_length + WIKI_CLOSING.len(),
            inner: inner_start..inner_start + inner_length,
        })
    })
}

/// The note and heading of `[[Note#Heading|text]]`, without a typed Markdown extension.
fn wiki_link_parts(inner: &str) -> Option<(String, Option<String>)> {
    let destination = inner.split('|').next().unwrap_or_default();
    let (target, heading) = match destination.split_once('#') {
        Some((target, heading)) => (target, Some(heading.trim().to_owned())),
        None => (destination, None),
    };
    let target = target.trim();
    let target = MARKDOWN_EXTENSIONS
        .iter()
        .find_map(|extension| strip_suffix_ignoring_case(target, extension))
        .unwrap_or(target);
    let heading = heading.filter(|heading| !heading.is_empty());
    (!target.is_empty() || heading.is_some()).then(|| (target.to_owned(), heading))
}

fn strip_suffix_ignoring_case<'text>(text: &'text str, suffix: &str) -> Option<&'text str> {
    let split = text.len().checked_sub(suffix.len())?;
    let (start, end) = (text.get(..split)?, text.get(split..)?);
    end.eq_ignore_ascii_case(suffix).then_some(start)
}

/// `#tag` at the start of a word, never only a number; `#a/b` is the tag `a` nested above `b`.
fn scan_tags(text: &str, skipped: &[Range<usize>]) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    for (position, _) in text.match_indices('#') {
        if is_inside_any(position, skipped) || !starts_word(text, position) {
            continue;
        }
        let tag: String = text
            .get(position + 1..)
            .unwrap_or_default()
            .chars()
            .take_while(|character| is_tag_character(*character))
            .collect();
        if !tag.is_empty() && !tag.chars().all(char::is_numeric) && !tags.contains(&tag) {
            tags.push(tag);
        }
    }
    tags
}

fn starts_word(text: &str, position: usize) -> bool {
    text.get(..position)
        .and_then(|before| before.chars().next_back())
        .is_none_or(char::is_whitespace)
}

pub fn is_tag_character(character: char) -> bool {
    if matches!(character, '_' | '-' | '/') {
        return true;
    }
    !character.is_whitespace()
        && !character.is_ascii_punctuation()
        && !character.is_control()
        && !TAG_ENDING_PUNCTUATION.contains(character)
}

fn is_inside_any(position: usize, ranges: &[Range<usize>]) -> bool {
    ranges.iter().any(|range| range.contains(&position))
}

/// Where each line starts, to turn byte offsets into line numbers.
struct LineStarts(Vec<usize>);

impl LineStarts {
    fn of(text: &str) -> Self {
        let starts = std::iter::once(0)
            .chain(text.match_indices('\n').map(|(index, _)| index + 1))
            .collect();
        Self(starts)
    }

    fn line_of(&self, offset: usize) -> usize {
        match self.0.binary_search(&offset) {
            Ok(line) => line,
            Err(next_line) => next_line.saturating_sub(1),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wiki_targets(note: &ExtractedNote) -> Vec<(LinkKind, &str, Option<&str>)> {
        note.links
            .iter()
            .map(|link| (link.kind, link.target.as_str(), link.heading.as_deref()))
            .collect()
    }

    #[test]
    fn wiki_link_with_heading_and_text() {
        let note = extract_note("See [[Plan#Next Steps|the plan]] and ![[diagram.png]].\n");

        assert_eq!(
            wiki_targets(&note),
            vec![
                (LinkKind::Wiki, "Plan", Some("Next Steps")),
                (LinkKind::Embed, "diagram.png", None)
            ]
        );
        assert_eq!(note.links.first().map(|link| link.line), Some(0));
    }

    #[test]
    fn markdown_links_to_notes_are_kept_and_web_links_are_not() {
        let note = extract_note(
            "[plan](Projects/Next%20Plan.md#goals) [site](https://example.com) [top](#top)\n",
        );

        assert_eq!(
            wiki_targets(&note),
            vec![(LinkKind::Markdown, "Projects/Next Plan.md", Some("goals"))]
        );
    }

    #[test]
    fn links_and_tags_in_code_are_ignored() {
        let note = extract_note(
            "`[[Inline]] #inline`\n\n```\n[[Fenced]] #fenced\n```\n\n[[Kept]] #kept\n",
        );

        assert_eq!(wiki_targets(&note), vec![(LinkKind::Wiki, "Kept", None)]);
        assert_eq!(note.tags, vec!["kept".to_owned()]);
    }

    #[test]
    fn number_only_tags_are_ignored() {
        let note =
            extract_note("Issue #42 and #2026-plan, not#this or a [[Plan#Goals]] heading.\n");

        assert_eq!(note.tags, vec!["2026-plan".to_owned()]);
    }

    #[test]
    fn nested_tags_and_tags_in_any_script() {
        let note = extract_note("#writing/drafts #తెలుగు #日本語、 and # heading\n");

        assert_eq!(note.tags, vec!["writing/drafts", "తెలుగు", "日本語"]);
    }

    #[test]
    fn headings_keep_their_level_line_and_text_without_markup() {
        let note = extract_note("---\ntitle: Plan\n---\n# The `plan`\n\nText\n\n## Next  steps\n");

        assert_eq!(
            note.headings,
            vec![
                NoteHeading {
                    level: 1,
                    text: "The plan".to_owned(),
                    line: 3
                },
                NoteHeading {
                    level: 2,
                    text: "Next steps".to_owned(),
                    line: 7
                }
            ]
        );
    }

    #[test]
    fn sections_cover_the_note_without_gaps() {
        let text = "Intro\n\n# One\n\nText\n\n## Two\n\nMore\n";

        let sections = extract_note(text).sections;

        assert_eq!(sections.first().map(|section| section.bytes.start), Some(0));
        assert_eq!(
            sections.last().map(|section| section.bytes.end),
            Some(text.len())
        );
        for pair in sections.windows(2) {
            assert_eq!(pair[0].bytes.end, pair[1].bytes.start);
        }
        assert_eq!(
            sections
                .iter()
                .map(|section| section.heading)
                .collect::<Vec<_>>(),
            vec![None, Some(0), Some(1)]
        );
    }

    #[test]
    fn editing_one_section_changes_only_its_hash() {
        let before = extract_note("# One\n\nText\n\n# Two\n\nMore\n").sections;
        let after = extract_note("# One\n\nText\n\n# Two\n\nChanged\n").sections;

        assert_eq!(before[0].hash, after[0].hash);
        assert_ne!(before[1].hash, after[1].hash);
        assert_eq!(before[0].hash.len(), 64);
    }

    #[test]
    fn tasks_keep_their_state_and_text() {
        let note = extract_note("- [ ] Draft the plan\n- [x] Book the room\n- plain item\n");

        assert_eq!(
            note.tasks,
            vec![
                NoteTask {
                    line: 0,
                    is_done: false,
                    text: "Draft the plan".to_owned()
                },
                NoteTask {
                    line: 1,
                    is_done: true,
                    text: "Book the room".to_owned()
                }
            ]
        );
    }

    #[test]
    fn the_indexer_reads_the_shared_corpus_as_the_renderer_does() {
        let corpus = include_str!("../../../../../tests/fixtures/notes-corpus/corpus.md");
        let expected: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../../tests/fixtures/notes-corpus/expected.json"
        ))
        .unwrap();
        let note = extract_note(corpus);

        let headings: Vec<serde_json::Value> = note
            .headings
            .iter()
            .map(|heading| serde_json::json!({ "level": heading.level, "text": heading.text }))
            .collect();
        let link_targets: Vec<&str> = note
            .links
            .iter()
            .filter(|link| link.kind != LinkKind::Markdown)
            .map(|link| link.target.as_str())
            .collect();

        assert_eq!(serde_json::Value::Array(headings), expected["headings"]);
        assert_eq!(serde_json::json!(link_targets), expected["linkTargets"]);
        assert_eq!(serde_json::json!(note.tags), expected["tags"]);
    }
}
