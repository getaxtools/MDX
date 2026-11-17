use std::collections::HashSet;

use pulldown_cmark::{CodeBlockKind, Event, Parser, Tag};
use serde::Serialize;

use super::front_matter::read_front_matter;
use super::note_extraction::{LineStarts, wiki_link_occurrences};

/// Code blocks the app draws itself besides highlighted languages.
const LANGUAGES_SHOWN_WITHOUT_HIGHLIGHTING: [&str; 2] = ["math", "mermaid"];
const BLOCK_REFERENCE_MARK: char = '^';
const MAX_DETAIL_CHARACTERS: usize = 120;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UnsupportedKind {
    /// `[[Plan#^a1b2]]`, a link to one paragraph by an id this app does not keep.
    BlockReference,
    /// A code block in a language the app does not show, which another app may run as a query.
    UnknownCodeBlock,
    /// `![[Name]]`, which another app shows inside the note; here it stays text.
    Embed,
}

/// Something in an imported note that this app shows differently from the app it came from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsupportedSyntax {
    pub kind: UnsupportedKind,
    /// Counted from 0 over the whole note, front matter included.
    pub line: usize,
    /// The link or the code block language as written, shortened.
    pub detail: String,
}

/// `known_languages` are the code block languages the app highlights, in lower case.
pub fn unsupported_syntax_of(
    text: &str,
    known_languages: &HashSet<String>,
) -> Vec<UnsupportedSyntax> {
    let mut found: Vec<UnsupportedSyntax> = wiki_link_occurrences(text)
        .into_iter()
        .filter_map(|occurrence| {
            let inner = text.get(occurrence.inner)?;
            let kind = if is_block_reference(inner) {
                UnsupportedKind::BlockReference
            } else if occurrence.is_embed {
                UnsupportedKind::Embed
            } else {
                return None;
            };
            Some(UnsupportedSyntax {
                kind,
                line: occurrence.line,
                detail: shortened(inner),
            })
        })
        .collect();
    found.extend(unknown_code_blocks(text, known_languages));
    found.sort_by_key(|syntax| syntax.line);
    found
}

fn is_block_reference(inner: &str) -> bool {
    let destination = inner.split('|').next().unwrap_or_default();
    destination
        .split_once('#')
        .is_some_and(|(_, heading)| heading.trim_start().starts_with(BLOCK_REFERENCE_MARK))
}

fn unknown_code_blocks(text: &str, known_languages: &HashSet<String>) -> Vec<UnsupportedSyntax> {
    let body_start = read_front_matter(text).body_start;
    let body = text.get(body_start..).unwrap_or_default();
    let lines = LineStarts::of(text);
    Parser::new(body)
        .into_offset_iter()
        .filter_map(|(event, range)| {
            let Event::Start(Tag::CodeBlock(CodeBlockKind::Fenced(info))) = event else {
                return None;
            };
            let language = info.split_whitespace().next()?.to_lowercase();
            let is_shown = known_languages.contains(&language)
                || LANGUAGES_SHOWN_WITHOUT_HIGHLIGHTING.contains(&language.as_str());
            (!is_shown).then(|| UnsupportedSyntax {
                kind: UnsupportedKind::UnknownCodeBlock,
                line: lines.line_of(range.start + body_start),
                detail: language,
            })
        })
        .collect()
}

fn shortened(text: &str) -> String {
    text.chars().take(MAX_DETAIL_CHARACTERS).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn known() -> HashSet<String> {
        HashSet::from(["rust".to_owned(), "python".to_owned()])
    }

    fn kinds_and_lines(text: &str) -> Vec<(UnsupportedKind, usize)> {
        unsupported_syntax_of(text, &known())
            .into_iter()
            .map(|syntax| (syntax.kind, syntax.line))
            .collect()
    }

    #[test]
    fn block_references_are_reported() {
        let found = unsupported_syntax_of("# Notes\n\nSee [[Plan#^a1b2]].\n", &known());

        assert_eq!(
            found,
            vec![UnsupportedSyntax {
                kind: UnsupportedKind::BlockReference,
                line: 2,
                detail: "Plan#^a1b2".to_owned(),
            }]
        );
    }

    #[test]
    fn code_blocks_in_unknown_languages_and_embeds_are_reported_in_line_order() {
        let text = "---\ntitle: x\n---\n![[diagram.png]]\n\n```query-lang\nLIST\n```\n\n```rust\nfn x() {}\n```\n";

        assert_eq!(
            kinds_and_lines(text),
            vec![
                (UnsupportedKind::Embed, 3),
                (UnsupportedKind::UnknownCodeBlock, 5)
            ]
        );
    }

    #[test]
    fn math_and_diagrams_are_shown_so_they_are_not_reported() {
        assert_eq!(
            kinds_and_lines("```math\nx^2\n```\n\n```mermaid\ngraph TD\n```\n"),
            vec![]
        );
    }

    #[test]
    fn plain_wiki_links_and_links_in_code_are_not_reported() {
        assert_eq!(kinds_and_lines("[[Plan]] and `[[Plan#^x]]`\n"), vec![]);
    }
}
