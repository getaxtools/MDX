/// A note's front matter, read the way the properties panel reads it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum FrontMatter {
    #[default]
    None,
    /// `name: value` lines, `[a, b]` lists and indented `- item` lists, in their order.
    Simple(Vec<Property>),
    /// Anything else; shown read-only and never parsed further.
    Complex,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Property {
    pub name: String,
    pub values: Vec<String>,
}

pub struct ReadFrontMatter {
    pub front_matter: FrontMatter,
    /// Where the note's body starts, after the closing line of the front matter.
    pub body_start: usize,
}

const BYTE_ORDER_MARK: &str = "\u{feff}";
const FENCE: &str = "---";
const CLOSING_FENCES: [&str; 2] = ["---", "..."];

/// Front matter is a `---` first line, after any byte order mark, up to a `---` or `...` line.
pub fn read_front_matter(text: &str) -> ReadFrontMatter {
    let start = if text.starts_with(BYTE_ORDER_MARK) {
        BYTE_ORDER_MARK.len()
    } else {
        0
    };
    let rest = text.get(start..).unwrap_or_default();
    let mut lines = rest.split_inclusive('\n');
    let none = ReadFrontMatter {
        front_matter: FrontMatter::None,
        body_start: 0,
    };
    if lines.next().is_none_or(|first| first.trim_end() != FENCE) {
        return none;
    }
    let mut offset = start + rest.split_inclusive('\n').next().map_or(0, str::len);
    let content_start = offset;
    for line in lines {
        let line_start = offset;
        offset += line.len();
        if CLOSING_FENCES.contains(&line.trim_end()) {
            let content = text.get(content_start..line_start).unwrap_or_default();
            return ReadFrontMatter {
                front_matter: properties_of(content)
                    .map_or(FrontMatter::Complex, FrontMatter::Simple),
                body_start: offset,
            };
        }
    }
    none
}

fn properties_of(content: &str) -> Option<Vec<Property>> {
    let mut properties: Vec<Property> = Vec::new();
    let mut is_list_open = false;
    for line in content.lines().filter(|line| is_meaningful(line)) {
        if let Some(item) = list_item_of(line) {
            let list = properties.last_mut().filter(|_| is_list_open)?;
            list.values.push(unquoted(item).to_owned());
            continue;
        }
        let property = property_of(line)?;
        is_list_open = property.values.is_empty();
        properties.push(property);
    }
    Some(properties)
}

fn is_meaningful(line: &str) -> bool {
    !line.trim().is_empty() && !line.trim_start().starts_with('#')
}

/// An indented `- item` line, as the properties panel accepts it.
fn list_item_of(line: &str) -> Option<&str> {
    if !line.starts_with(char::is_whitespace) {
        return None;
    }
    let item = line.trim_start().strip_prefix('-')?;
    item.starts_with(char::is_whitespace).then(|| item.trim())
}

fn property_of(line: &str) -> Option<Property> {
    let (name, value) = line.split_once(':')?;
    let name = name.trim_end();
    let mut characters = name.chars();
    let is_name = characters
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic() || first == '_')
        && characters.all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '_' | '.' | '-')
        });
    is_name.then(|| Property {
        name: name.to_owned(),
        values: values_of(value.trim()),
    })
}

fn values_of(value: &str) -> Vec<String> {
    if value.is_empty() {
        return Vec::new();
    }
    let Some(inline_list) = value
        .strip_prefix('[')
        .and_then(|list| list.strip_suffix(']'))
    else {
        return vec![unquoted(value).to_owned()];
    };
    inline_list
        .split(',')
        .map(|item| unquoted(item.trim()).to_owned())
        .filter(|item| !item.is_empty())
        .collect()
}

fn unquoted(value: &str) -> &str {
    ['"', '\'']
        .iter()
        .find_map(|quote| value.strip_prefix(*quote)?.strip_suffix(*quote))
        .filter(|_| value.len() >= 2)
        .unwrap_or(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn simple(text: &str) -> Vec<Property> {
        match read_front_matter(text).front_matter {
            FrontMatter::Simple(properties) => properties,
            other => panic!("expected simple front matter, got {other:?}"),
        }
    }

    fn property(name: &str, values: &[&str]) -> Property {
        Property {
            name: name.to_owned(),
            values: values.iter().map(|value| (*value).to_owned()).collect(),
        }
    }

    #[test]
    fn front_matter_lists_in_both_styles() {
        let text =
            "---\ntags: [work, \"plans\"]\naliases:\n  - Roadmap\n  - 'Q3 plan'\n---\n# Plan\n";

        assert_eq!(
            simple(text),
            vec![
                property("tags", &["work", "plans"]),
                property("aliases", &["Roadmap", "Q3 plan"])
            ]
        );
    }

    #[test]
    fn complex_front_matter_is_reported_as_complex() {
        let text = "---\nauthor:\n  name: Ana\n---\nBody";

        assert_eq!(read_front_matter(text).front_matter, FrontMatter::Complex);
    }

    #[test]
    fn the_body_starts_after_the_closing_line_and_a_byte_order_mark_is_allowed() {
        let text = "\u{feff}---\r\ntitle: Plan\r\n...\r\n# Plan";

        let read = read_front_matter(text);

        assert_eq!(text.get(read.body_start..), Some("# Plan"));
        assert_eq!(
            read.front_matter,
            FrontMatter::Simple(vec![property("title", &["Plan"])])
        );
    }

    #[test]
    fn a_note_without_a_closing_line_has_no_front_matter() {
        let read = read_front_matter("---\ntitle: Plan\n# Plan");

        assert_eq!(read.front_matter, FrontMatter::None);
        assert_eq!(read.body_start, 0);
    }
}
