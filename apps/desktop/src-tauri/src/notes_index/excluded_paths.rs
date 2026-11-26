pub const MAX_EXCLUDED_PATHS: usize = 100;
const MAX_EXCLUDED_PATH_CHARACTERS: usize = 1_024;

/// Folders and notes inside a location that the index never opens, so search, backlinks,
/// suggestions and tags never see them.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ExcludedPaths(Vec<String>);

#[derive(Debug, PartialEq, Eq)]
pub struct InvalidExcludedPath;

impl ExcludedPaths {
    /// Paths relative to the location, with `/` or `\` between their parts; an absolute path or one
    /// climbing out of the location is refused.
    pub fn new(paths: &[String]) -> Result<Self, InvalidExcludedPath> {
        if paths.len() > MAX_EXCLUDED_PATHS {
            return Err(InvalidExcludedPath);
        }
        paths
            .iter()
            .map(|path| key_of(path))
            .collect::<Option<Vec<_>>>()
            .map(Self)
            .ok_or(InvalidExcludedPath)
    }

    /// Whether a path inside the location is excluded or inside an excluded folder, ignoring case
    /// as Windows does.
    pub fn contains(&self, relative_path: &str) -> bool {
        let path = relative_path.replace('\\', "/").to_lowercase();
        self.0.iter().any(|excluded| {
            path.strip_prefix(excluded.as_str())
                .is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
        })
    }
}

fn key_of(path: &str) -> Option<String> {
    if path.chars().count() > MAX_EXCLUDED_PATH_CHARACTERS {
        return None;
    }
    let parts: Vec<&str> = path.split(['/', '\\']).collect();
    let is_inside_location = parts.iter().all(|part| {
        !part.trim().is_empty() && *part != "." && *part != ".." && !part.contains(':')
    });
    is_inside_location.then(|| parts.join("/").to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn excluded(paths: &[&str]) -> ExcludedPaths {
        ExcludedPaths::new(
            &paths
                .iter()
                .map(|path| (*path).to_owned())
                .collect::<Vec<_>>(),
        )
        .unwrap()
    }

    #[test]
    fn a_folder_excludes_everything_inside_it() {
        let paths = excluded(&["Private"]);

        assert!(paths.contains("Private"));
        assert!(paths.contains("Private/Salary.md"));
        assert!(paths.contains("Private/2026/Review.md"));
        assert!(!paths.contains("Plan.md"));
    }

    #[test]
    fn a_folder_with_a_longer_name_is_not_inside() {
        let paths = excluded(&["Private"]);

        assert!(!paths.contains("Private notes/Plan.md"));
    }

    #[test]
    fn paths_compare_ignoring_case_and_separator() {
        let paths = excluded(&["Work\\Reviews"]);

        assert!(paths.contains("work/reviews/Anna.md"));
    }

    #[test]
    fn a_single_note_can_be_excluded() {
        let paths = excluded(&["Journal/Diary.md"]);

        assert!(paths.contains("Journal/Diary.md"));
        assert!(!paths.contains("Journal/Plan.md"));
    }

    #[test]
    fn paths_outside_the_location_are_refused() {
        for path in [
            "",
            "..",
            "Notes/../..",
            "C:\\Users",
            "/Private",
            "Private/",
            " ",
        ] {
            assert_eq!(
                ExcludedPaths::new(&[path.to_owned()]),
                Err(InvalidExcludedPath),
                "{path:?}"
            );
        }
    }

    #[test]
    fn too_many_paths_are_refused() {
        let paths: Vec<String> = (0..=MAX_EXCLUDED_PATHS)
            .map(|number| format!("Folder {number}"))
            .collect();

        assert_eq!(ExcludedPaths::new(&paths), Err(InvalidExcludedPath));
    }
}
