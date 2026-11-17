use std::collections::HashSet;

use pulldown_cmark::{Event, Parser, Tag};

use super::front_matter::{FrontMatter, read_front_matter};
use super::note_extraction::{wiki_link_occurrences, wiki_link_parts};
use super::note_links::{KnownNote, folder_of, resolve_wiki_link};

const ALIASES_PROPERTY: &str = "aliases";

/// The other names a note answers to in wiki-links, from its `aliases` property.
pub fn aliases_of(text: &str) -> Vec<String> {
    match read_front_matter(text).front_matter {
        FrontMatter::Simple(properties) => properties
            .into_iter()
            .filter(|property| property.name.eq_ignore_ascii_case(ALIASES_PROPERTY))
            .flat_map(|property| property.values)
            .collect(),
        FrontMatter::None | FrontMatter::Complex => Vec::new(),
    }
}

/// The notes wiki-links resolve against, and which of them an export writes out.
pub struct LinkTargets<'targets> {
    pub notes: &'targets [KnownNote],
    /// Paths inside the location, in lower case.
    pub exported: &'targets HashSet<String>,
}

/// The note with each wiki-link to an exported note turned into a relative Markdown link, as
/// `[[Budget]]` in `Projects/Plan.md` becomes `[Budget](../Finance/Budget.md)`. A link to no known
/// note, or to one the export leaves out, is kept as written, as a relative link would point nowhere.
/// `None` when nothing changed, so the file can be copied byte for byte.
pub fn with_relative_links(
    text: &str,
    from_note: &str,
    targets: &LinkTargets<'_>,
) -> Option<String> {
    let mut converted = String::with_capacity(text.len());
    let mut copied_up_to = 0;
    for occurrence in wiki_link_occurrences(text) {
        let Some(inner) = text.get(occurrence.inner.clone()) else {
            continue;
        };
        let Some(link) = relative_link_for(inner, from_note, targets) else {
            continue;
        };
        let start = if occurrence.is_embed {
            occurrence.outer.start - 1
        } else {
            occurrence.outer.start
        };
        converted.push_str(text.get(copied_up_to..start)?);
        if occurrence.is_embed {
            converted.push('!');
        }
        converted.push_str(&link);
        copied_up_to = occurrence.outer.end;
    }
    if copied_up_to == 0 {
        return None;
    }
    converted.push_str(text.get(copied_up_to..)?);
    Some(converted)
}

/// `[text](address#heading)` for the inner part of a wiki-link, or `None` when it names no known note.
fn relative_link_for(inner: &str, from_note: &str, targets: &LinkTargets<'_>) -> Option<String> {
    let (destination, alias) = match inner.split_once('|') {
        Some((destination, alias)) => (destination.trim(), Some(alias.trim())),
        None => (inner.trim(), None),
    };
    let (target, heading) = wiki_link_parts(inner)?;
    let fragment = heading.map(|heading| format!("#{}", heading_slug(&heading)));
    let address = if target.is_empty() {
        String::new()
    } else {
        let note = resolve_wiki_link(&target, from_note, targets.notes)?;
        if !targets.exported.contains(&note.to_lowercase()) {
            return None;
        }
        encoded_address(&relative_path(from_note, &note))
    };
    let text = alias
        .filter(|alias| !alias.is_empty())
        .unwrap_or(destination);
    Some(format!(
        "[{}]({address}{})",
        escaped_link_text(text),
        fragment.unwrap_or_default()
    ))
}

/// A backslash in link text would escape the next character, so it is written as `\\`.
fn escaped_link_text(text: &str) -> String {
    text.replace('\\', "\\\\")
}

/// The files a note shows or links to besides notes: relative Markdown link and image addresses, and
/// the names in `![[…]]` embeds.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct AttachmentReferences {
    /// As written, without any `#part` or `?query`, with `%20` read as a space.
    pub addresses: Vec<String>,
    pub embedded_names: Vec<String>,
}

pub fn attachment_references_of(text: &str) -> AttachmentReferences {
    let body = text
        .get(read_front_matter(text).body_start..)
        .unwrap_or_default();
    let addresses = Parser::new(body)
        .filter_map(|event| match event {
            Event::Start(Tag::Link { dest_url, .. } | Tag::Image { dest_url, .. }) => {
                relative_address(&dest_url)
            }
            _ => None,
        })
        .collect();
    let embedded_names = wiki_link_occurrences(text)
        .into_iter()
        .filter(|occurrence| occurrence.is_embed)
        .filter_map(|occurrence| {
            let inner = text.get(occurrence.inner)?;
            let destination = inner.split(['|', '#']).next()?.trim();
            (!destination.is_empty()).then(|| destination.to_owned())
        })
        .collect();
    AttachmentReferences {
        addresses,
        embedded_names,
    }
}

/// A link to a file next to the note, not a web address, a mail address or a heading in the note.
fn relative_address(address: &str) -> Option<String> {
    let address = address.split(['#', '?']).next()?.trim();
    let has_scheme = address.split_once(':').is_some();
    let is_relative = !address.is_empty() && !has_scheme && !address.starts_with(['/', '\\']);
    is_relative.then(|| address.replace("%20", " "))
}

/// The path from the folder of one note to another, both as paths inside the location.
pub fn relative_path(from_note: &str, to: &str) -> String {
    let from_folder = folder_of(from_note);
    let to_parts: Vec<&str> = to.split('/').collect();
    let shared = from_folder
        .iter()
        .zip(&to_parts)
        .take_while(|(from, to)| from.eq_ignore_ascii_case(to))
        .count();
    let ups = std::iter::repeat_n("..", from_folder.len() - shared);
    ups.chain(to_parts.iter().skip(shared).copied())
        .collect::<Vec<_>>()
        .join("/")
}

/// Spaces and brackets would end a Markdown link address, so they are written as `%20`, `%28`, `%29`.
fn encoded_address(path: &str) -> String {
    path.replace('%', "%25")
        .replace(' ', "%20")
        .replace('(', "%28")
        .replace(')', "%29")
        .replace('<', "%3C")
        .replace('>', "%3E")
        .replace('#', "%23")
        .replace('?', "%3F")
}

/// The anchor GitHub and most viewers give a heading: lower case, spaces as `-`, punctuation dropped.
fn heading_slug(heading: &str) -> String {
    heading
        .trim()
        .to_lowercase()
        .chars()
        .filter_map(|character| match character {
            ' ' => Some('-'),
            '-' | '_' => Some(character),
            _ if character.is_alphanumeric() => Some(character),
            _ => None,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn converted(text: &str, from_note: &str, known: &[KnownNote]) -> Option<String> {
        let exported: HashSet<String> = known.iter().map(|note| note.path.to_lowercase()).collect();
        with_relative_links(
            text,
            from_note,
            &LinkTargets {
                notes: known,
                exported: &exported,
            },
        )
    }

    fn notes(paths: &[&str]) -> Vec<KnownNote> {
        paths
            .iter()
            .map(|path| KnownNote {
                path: (*path).to_owned(),
                aliases: Vec::new(),
            })
            .collect()
    }

    #[test]
    fn relative_link_computed_across_folders() {
        let known = notes(&["Projects/Plan.md", "Finance/Budget.md"]);

        let converted = converted("See [[Budget]].\n", "Projects/Plan.md", &known);

        assert_eq!(
            converted.as_deref(),
            Some("See [Budget](../Finance/Budget.md).\n")
        );
    }

    #[test]
    fn keeps_the_link_text_and_heading_and_encodes_spaces() {
        let known = notes(&["Plan.md", "Team notes/Weekly review.md"]);

        let converted = converted("[[Weekly review#Next steps|this week]]", "Plan.md", &known);

        assert_eq!(
            converted.as_deref(),
            Some("[this week](Team%20notes/Weekly%20review.md#next-steps)")
        );
    }

    #[test]
    fn leaves_unknown_targets_code_and_untouched_text_as_they_are() {
        let known = notes(&["Plan.md", "Budget.md"]);
        let text = "Line one\r\n`[[Budget]]` and [[Nowhere]]\r\n";

        assert_eq!(converted(text, "Plan.md", &known), None);
    }

    #[test]
    fn an_embed_stays_an_embed_and_line_endings_are_kept() {
        let known = notes(&["Plan.md", "Charts/Sales.md"]);

        let converted = converted("A\r\n![[Sales]]\r\nB", "Plan.md", &known);

        assert_eq!(
            converted.as_deref(),
            Some("A\r\n![Sales](Charts/Sales.md)\r\nB")
        );
    }

    #[test]
    fn a_note_the_export_leaves_out_keeps_its_wiki_link() {
        let known = notes(&["Plan.md", "Budget.md"]);
        let exported: HashSet<String> = HashSet::from(["plan.md".to_owned()]);

        let result = with_relative_links(
            "[[Budget]]",
            "Plan.md",
            &LinkTargets {
                notes: &known,
                exported: &exported,
            },
        );

        assert_eq!(result, None);
    }

    #[test]
    fn encodes_hash_and_question_marks_and_escapes_backslashes_in_the_text() {
        let known = notes(&["Plan.md", "C# docs/What?.md"]);

        let result = converted("[[What?|a\\b]]", "Plan.md", &known);

        assert_eq!(result.as_deref(), Some("[a\\\\b](C%23%20docs/What%3F.md)"));
    }

    #[test]
    fn reads_aliases_from_front_matter() {
        let text = "---\naliases:\n  - Roadmap\n---\n# Plan\n";

        assert_eq!(aliases_of(text), vec!["Roadmap".to_owned()]);
    }

    #[test]
    fn finds_attachments_by_address_and_by_embedded_name() {
        let text = "![Chart](images/sales%20chart.png#top) [site](https://example.com) [x](#here)\n![[Scan.pdf|scan]]\n";

        assert_eq!(
            attachment_references_of(text),
            AttachmentReferences {
                addresses: vec!["images/sales chart.png".to_owned()],
                embedded_names: vec!["Scan.pdf".to_owned()],
            }
        );
    }

    #[test]
    fn a_relative_path_climbs_only_out_of_folders_not_shared() {
        assert_eq!(
            relative_path("A/B/Note.md", "A/C/Other.md"),
            "../C/Other.md"
        );
        assert_eq!(relative_path("Note.md", "A/Other.md"), "A/Other.md");
    }
}
