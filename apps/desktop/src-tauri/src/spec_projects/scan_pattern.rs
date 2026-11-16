use crate::documents::DocumentError;

const MAX_PATTERN_CHARACTERS: usize = 200;
const ANY_DEPTH: &str = "**";

/// One part of a location to scan: a name, a name with `*` wildcards, or `**` for any folders.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Segment {
    Name(String),
    Wildcard(String),
    AnyDepth,
}

impl Segment {
    fn matches(&self, entry_name: &str) -> bool {
        match self {
            Self::Name(name) => name.eq_ignore_ascii_case(entry_name),
            // As in shell globs, `*` does not pick up hidden names such as `.git` or `.cache`.
            Self::Wildcard(pattern) => {
                !entry_name.starts_with('.') && wildcard_matches(pattern, entry_name)
            }
            Self::AnyDepth => true,
        }
    }
}

/// A location below a project root, such as `openspec/**` or `.github/instructions/**/*.instructions.md`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanPattern {
    segments: Vec<Segment>,
}

impl ScanPattern {
    /// Reads a pattern with `/` between its parts; `..`, drive letters and empty parts are refused.
    pub fn parse(pattern: &str) -> Result<Self, DocumentError> {
        if pattern.chars().count() > MAX_PATTERN_CHARACTERS {
            return Err(DocumentError::InvalidRequest);
        }
        let segments = pattern
            .split('/')
            .map(segment_of)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self { segments })
    }

    /// The same location inside each direct subfolder of the root.
    pub fn in_each_subfolder(&self) -> Self {
        let mut segments = vec![Segment::Wildcard("*".to_owned())];
        segments.extend(self.segments.iter().cloned());
        Self { segments }
    }

    pub fn start(&self) -> PatternState<'_> {
        PatternState {
            remaining: &self.segments,
        }
    }
}

fn segment_of(part: &str) -> Result<Segment, DocumentError> {
    let is_unsafe =
        part.is_empty() || part == "." || part == ".." || part.contains(['\\', ':', '\0']);
    if is_unsafe {
        return Err(DocumentError::InvalidRequest);
    }
    Ok(if part == ANY_DEPTH {
        Segment::AnyDepth
    } else if part.contains('*') {
        Segment::Wildcard(part.to_owned())
    } else {
        Segment::Name(part.to_owned())
    })
}

/// How much of a pattern is still to match below the folder the walk is in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PatternState<'pattern> {
    remaining: &'pattern [Segment],
}

impl<'pattern> PatternState<'pattern> {
    /// True when the files of this folder and all its subfolders belong to the location.
    pub fn is_whole_tree(&self) -> bool {
        self.remaining.first() == Some(&Segment::AnyDepth)
    }

    pub fn matches_file(&self, file_name: &str) -> bool {
        match self.remaining {
            [last] => last.matches(file_name),
            [Segment::AnyDepth, rest @ ..] => {
                PatternState { remaining: rest }.matches_file(file_name)
            }
            _ => false,
        }
    }

    /// The states to carry into a subfolder of this name; empty when the pattern cannot match below it.
    pub fn enter_folder(&self, folder_name: &str) -> Vec<Self> {
        match self.remaining {
            [Segment::AnyDepth, rest @ ..] => {
                let mut states = vec![*self];
                states.extend(PatternState { remaining: rest }.enter_folder(folder_name));
                states
            }
            [first, rest @ ..] if !rest.is_empty() && first.matches(folder_name) => {
                vec![PatternState { remaining: rest }]
            }
            _ => Vec::new(),
        }
    }
}

/// Matches `*` against any run of characters, including none.
fn wildcard_matches(pattern: &str, name: &str) -> bool {
    let pattern = pattern.to_lowercase();
    let name = name.to_lowercase();
    let mut parts = pattern.split('*');
    let first = parts.next().unwrap_or_default();
    let Some(mut rest) = name.strip_prefix(first) else {
        return false;
    };
    let parts: Vec<&str> = parts.collect();
    let Some((last, middle)) = parts.split_last() else {
        return rest.is_empty();
    };
    for part in middle {
        match rest.find(part) {
            Some(index) => rest = rest.get(index + part.len()..).unwrap_or_default(),
            None => return false,
        }
    }
    rest.len() >= last.len() && rest.ends_with(last)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pattern(text: &str) -> ScanPattern {
        ScanPattern::parse(text).unwrap()
    }

    fn walk_to<'pattern>(
        pattern: &'pattern ScanPattern,
        folders: &[&str],
    ) -> Vec<PatternState<'pattern>> {
        folders
            .iter()
            .fold(vec![pattern.start()], |states, folder| {
                states
                    .iter()
                    .flat_map(|state| state.enter_folder(folder))
                    .collect()
            })
    }

    fn matches_path(pattern: &ScanPattern, path: &str) -> bool {
        let parts: Vec<&str> = path.split('/').collect();
        let Some((file, folders)) = parts.split_last() else {
            return false;
        };
        walk_to(pattern, folders)
            .iter()
            .any(|state| state.matches_file(file))
    }

    #[test]
    fn a_whole_tree_location_matches_every_file_below_it() {
        let location = pattern("openspec/**");

        assert!(matches_path(&location, "openspec/config.yaml"));
        assert!(matches_path(
            &location,
            "openspec/changes/add-tabs/.openspec.yaml"
        ));
        assert!(!matches_path(&location, "docs/plan.md"));
    }

    #[test]
    fn a_wildcard_matches_one_folder_but_not_a_hidden_one() {
        let location = pattern("skills/*/SKILL.md");

        assert!(matches_path(&location, "skills/review/SKILL.md"));
        assert!(!matches_path(&location, "skills/.cache/SKILL.md"));
        assert!(!matches_path(&location, "skills/a/b/SKILL.md"));
    }

    #[test]
    fn any_depth_in_the_middle_matches_zero_or_more_folders() {
        let location = pattern(".github/instructions/**/*.instructions.md");

        assert!(matches_path(
            &location,
            ".github/instructions/api.instructions.md"
        ));
        assert!(matches_path(
            &location,
            ".github/instructions/a/b/api.instructions.md"
        ));
        assert!(!matches_path(&location, ".github/instructions/api.md"));
    }

    #[test]
    fn names_match_in_any_case() {
        assert!(matches_path(
            &pattern("docs/adr/**"),
            "Docs/ADR/0001-use-x.md"
        ));
    }

    #[test]
    fn a_location_inside_each_subfolder_starts_one_level_down() {
        let location = pattern("openspec/**").in_each_subfolder();

        assert!(matches_path(&location, "app/openspec/config.yaml"));
        assert!(!matches_path(&location, "openspec/config.yaml"));
        assert!(!matches_path(&location, ".hidden/openspec/config.yaml"));
    }

    #[test]
    fn marks_only_folders_inside_a_whole_tree_location() {
        let location = pattern("specs/**");

        assert!(!location.start().is_whole_tree());
        assert!(
            walk_to(&location, &["specs"])
                .iter()
                .any(PatternState::is_whole_tree)
        );
    }

    #[test]
    fn refuses_patterns_that_could_leave_the_root() {
        for unsafe_pattern in ["../x.md", "a//b.md", "C:/x.md", r"a\b.md", "./a.md", ""] {
            assert_eq!(
                ScanPattern::parse(unsafe_pattern),
                Err(DocumentError::InvalidRequest),
                "{unsafe_pattern}"
            );
        }
        assert_eq!(
            ScanPattern::parse(&"a".repeat(MAX_PATTERN_CHARACTERS + 1)),
            Err(DocumentError::InvalidRequest)
        );
    }

    #[test]
    fn wildcards_match_inside_a_name() {
        assert!(wildcard_matches("*.mdc", "style.mdc"));
        assert!(wildcard_matches("*.instructions.md", "a.instructions.md"));
        assert!(wildcard_matches("a*b*c", "aXXbYYc"));
        assert!(!wildcard_matches("*.mdc", "style.md"));
        assert!(!wildcard_matches("ab*ba", "aba"));
    }
}
