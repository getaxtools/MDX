use std::ffi::OsString;
use std::path::PathBuf;

/// Adds the extension when the chosen name lacks it, whatever its case, as save dialogs may.
pub fn with_extension(path: PathBuf, extension: &str) -> PathBuf {
    let has_extension = path
        .extension()
        .is_some_and(|existing| existing.eq_ignore_ascii_case(extension));
    if has_extension {
        return path;
    }
    let mut file_name = path.file_name().map(OsString::from).unwrap_or_default();
    file_name.push(format!(".{extension}"));
    path.with_file_name(file_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_the_extension_when_missing_and_keeps_it_in_any_case() {
        assert_eq!(
            with_extension(PathBuf::from("handbook"), "mdxworkspace"),
            PathBuf::from("handbook.mdxworkspace")
        );
        assert_eq!(
            with_extension(PathBuf::from("handbook.MDXWorkspace"), "mdxworkspace"),
            PathBuf::from("handbook.MDXWorkspace")
        );
        assert_eq!(
            with_extension(PathBuf::from("v1.2"), "json"),
            PathBuf::from("v1.2.json")
        );
    }
}
