use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use crate::documents::{
    DocumentError, DocumentLocation, canonical_key_of, is_markdown_path, locate_document,
    location_of_resolved_path,
};

const NEW_NOTE_EXTENSION: &str = "md";
const MAX_NOTE_NAME_CHARACTERS: usize = 200;
const FORBIDDEN_NAME_CHARACTERS: [char; 9] = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
const RESERVED_DEVICE_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// A Notes location's folder, resolved once; every path a note command touches must be inside it.
#[derive(Debug)]
pub struct NotesRoot {
    folder: PathBuf,
}

impl NotesRoot {
    pub fn new(location: &Path) -> Result<Self, DocumentError> {
        let folder = dunce::canonicalize(location)?;
        if !folder.is_dir() {
            return Err(DocumentError::NotFound);
        }
        Ok(Self { folder })
    }

    pub fn folder(&self) -> &Path {
        &self.folder
    }

    /// An existing path inside the location, and not inside a dot entry such as the app folder.
    pub(crate) fn resolve_inside(&self, path: &Path) -> Result<PathBuf, DocumentError> {
        let resolved = dunce::canonicalize(path)?;
        let relative = resolved
            .strip_prefix(&self.folder)
            .map_err(|_| DocumentError::AccessDenied)?;
        let is_in_dot_entry = relative
            .components()
            .any(|component| component.as_os_str().to_string_lossy().starts_with('.'));
        if is_in_dot_entry {
            return Err(DocumentError::AccessDenied);
        }
        Ok(resolved)
    }

    /// The location itself, a folder in it, or the folder that holds a note's child notes,
    /// which may not exist yet.
    fn folder_for_children(&self, parent: &Path) -> Result<PathBuf, DocumentError> {
        let parent = self.resolve_inside(parent)?;
        if parent.is_dir() {
            return Ok(parent);
        }
        require_note(&parent)?;
        Ok(children_folder_of(&parent))
    }
}

/// Makes an empty note; under a note without children, its folder of child notes is made first.
pub fn create_note(
    root: &NotesRoot,
    parent: &Path,
    name: &str,
) -> Result<DocumentLocation, DocumentError> {
    let name = valid_note_name(name)?;
    let folder = root.folder_for_children(parent)?;
    if note_named(&folder, &name).is_some() {
        return Err(DocumentError::NameTaken);
    }
    fs::create_dir_all(&folder)?;
    let path = folder.join(format!("{name}.{NEW_NOTE_EXTENSION}"));
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(name_taken_or_other)?;
    Ok(location_of_resolved_path(&path))
}

/// Makes a note with text in a folder inside the location, such as `Daily`; folders are made on first use.
pub fn create_note_in_folder(
    root: &NotesRoot,
    folder: &str,
    name: &str,
    text: &str,
) -> Result<DocumentLocation, DocumentError> {
    let name = valid_note_name(name)?;
    let folder = folder_inside(root, folder)?;
    if folder.is_dir() && note_named(&folder, &name).is_some() {
        return Err(DocumentError::NameTaken);
    }
    fs::create_dir_all(&folder)?;
    root.resolve_inside(&folder)?;
    let path = folder.join(format!("{name}.{NEW_NOTE_EXTENSION}"));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(name_taken_or_other)?;
    file.write_all(text.as_bytes())?;
    Ok(location_of_resolved_path(&path))
}

/// A folder of the location named by its parts with `/` between them; the empty name is the location.
fn folder_inside(root: &NotesRoot, folder: &str) -> Result<PathBuf, DocumentError> {
    let mut path = root.folder().to_path_buf();
    for part in folder.split('/').filter(|part| !part.is_empty()) {
        if valid_note_name(part)? != part {
            return Err(DocumentError::InvalidName);
        }
        path.push(part);
    }
    Ok(path)
}
/// Renames a note and the folder of its child notes together; the extension stays.
pub fn rename_note(
    root: &NotesRoot,
    note: &Path,
    new_name: &str,
) -> Result<DocumentLocation, DocumentError> {
    let note = root.resolve_inside(note)?;
    require_note(&note)?;
    let new_name = valid_note_name(new_name)?;
    let folder = note.parent().ok_or(DocumentError::InvalidRequest)?;
    if note_named(folder, &new_name).is_some_and(|existing| !is_same_entry(&existing, &note)) {
        return Err(DocumentError::NameTaken);
    }
    let extension = note.extension().map_or_else(String::new, |extension| {
        extension.to_string_lossy().into_owned()
    });
    move_with_children(&note, &folder.join(format!("{new_name}.{extension}")))
}

/// Moves a note and its child notes into a folder or under another note, keeping every byte.
pub fn move_note(
    root: &NotesRoot,
    note: &Path,
    into: &Path,
) -> Result<DocumentLocation, DocumentError> {
    let note = root.resolve_inside(note)?;
    require_note(&note)?;
    let folder = root.folder_for_children(into)?;
    if folder.starts_with(children_folder_of(&note)) {
        return Err(DocumentError::InvalidRequest);
    }
    let file_name = note.file_name().ok_or(DocumentError::InvalidRequest)?;
    let target = folder.join(file_name);
    if is_same_entry(&target, &note) {
        return locate_document(&note);
    }
    if note_named(&folder, &note_name_of(&note)).is_some() {
        return Err(DocumentError::NameTaken);
    }
    let is_new_folder = !folder.exists();
    fs::create_dir_all(&folder)?;
    move_with_children(&note, &target).inspect_err(|_| {
        if is_new_folder {
            let _ = fs::remove_dir(&folder);
        }
    })
}

fn move_with_children(note: &Path, target: &Path) -> Result<DocumentLocation, DocumentError> {
    let children = children_folder_of(note);
    let target_children = children_folder_of(target);
    let has_children = children.is_dir();
    if has_children && target_children.exists() && !is_same_entry(&children, &target_children) {
        return Err(DocumentError::NameTaken);
    }
    fs::rename(note, target)?;
    if has_children && let Err(error) = fs::rename(&children, &target_children) {
        // Put the note back, so a note and its child notes never end up apart.
        let _ = fs::rename(target, note);
        return Err(error.into());
    }
    locate_document(target)
}

pub(super) fn require_note(path: &Path) -> Result<(), DocumentError> {
    if path.is_file() && is_markdown_path(path) {
        Ok(())
    } else {
        Err(DocumentError::NotMarkdown)
    }
}

pub(super) fn children_folder_of(note: &Path) -> PathBuf {
    note.with_extension("")
}

pub(super) fn note_name_of(note: &Path) -> String {
    note.file_stem()
        .map_or_else(String::new, |stem| stem.to_string_lossy().into_owned())
}

/// A note in the folder with this name, whatever its Markdown extension and case.
pub(super) fn note_named(folder: &Path, name: &str) -> Option<PathBuf> {
    let wanted = name.to_lowercase();
    fs::read_dir(folder)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| {
            path.is_file() && is_markdown_path(path) && note_name_of(path).to_lowercase() == wanted
        })
}

fn is_same_entry(first: &Path, second: &Path) -> bool {
    canonical_key_of(&first.to_string_lossy()) == canonical_key_of(&second.to_string_lossy())
}

/// A name Windows accepts for a file, without a typed Markdown extension.
fn valid_note_name(name: &str) -> Result<String, DocumentError> {
    let trimmed = name.trim();
    let name = if is_markdown_path(Path::new(trimmed)) {
        note_name_of(Path::new(trimmed))
    } else {
        trimmed.to_owned()
    };
    let is_valid = !name.is_empty()
        && name.chars().count() <= MAX_NOTE_NAME_CHARACTERS
        && !name.starts_with('.')
        && !name.ends_with('.')
        && !name.chars().any(|character| {
            character.is_control() || FORBIDDEN_NAME_CHARACTERS.contains(&character)
        })
        && !is_reserved_device_name(&name);
    if is_valid {
        Ok(name)
    } else {
        Err(DocumentError::InvalidName)
    }
}

fn is_reserved_device_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name).trim_end();
    RESERVED_DEVICE_NAMES
        .iter()
        .any(|reserved| reserved.eq_ignore_ascii_case(stem))
}

fn name_taken_or_other(error: io::Error) -> DocumentError {
    if error.kind() == io::ErrorKind::AlreadyExists {
        DocumentError::NameTaken
    } else {
        error.into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Location {
        _folder: tempfile::TempDir,
        root: NotesRoot,
    }

    impl Location {
        fn new() -> Self {
            let folder = tempfile::tempdir().unwrap();
            fs::create_dir(folder.path().join(".mdx-notes")).unwrap();
            let root = NotesRoot::new(folder.path()).unwrap();
            Self {
                _folder: folder,
                root,
            }
        }

        fn path(&self, relative: &str) -> PathBuf {
            self.root.folder().join(relative)
        }

        fn write(&self, relative: &str, text: &str) -> PathBuf {
            let path = self.path(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, text).unwrap();
            path
        }
    }

    #[test]
    fn creates_an_empty_note_in_a_folder() {
        let location = Location::new();

        let note = create_note(&location.root, location.root.folder(), "Inbox").unwrap();

        assert_eq!(note.file_name, "Inbox.md");
        assert_eq!(fs::read(location.path("Inbox.md")).unwrap(), b"");
    }

    #[test]
    fn a_child_note_creates_its_folder() {
        let location = Location::new();
        let parent = location.write("Projects.md", "# Projects");

        let child = create_note(&location.root, &parent, "Plan").unwrap();

        assert_eq!(child.path(), location.path(r"Projects\Plan.md"));
        assert!(location.path("Projects").is_dir());
        assert_eq!(fs::read_to_string(&parent).unwrap(), "# Projects");
    }

    #[test]
    fn create_refuses_a_name_any_note_in_the_folder_has() {
        let location = Location::new();
        location.write("Plan.markdown", "kept");

        let result = create_note(&location.root, location.root.folder(), "plan");

        assert_eq!(result, Err(DocumentError::NameTaken));
        assert_eq!(
            fs::read_to_string(location.path("Plan.markdown")).unwrap(),
            "kept"
        );
    }

    #[test]
    fn a_typed_markdown_extension_is_not_doubled() {
        let location = Location::new();

        let note = create_note(&location.root, location.root.folder(), "Ideas.md").unwrap();

        assert_eq!(note.file_name, "Ideas.md");
    }

    #[test]
    fn names_windows_cannot_store_are_refused() {
        let location = Location::new();

        for name in [
            "",
            "  ",
            "a/b",
            "what?",
            "CON",
            "com1.notes",
            ".hidden",
            "ends.",
        ] {
            assert_eq!(
                create_note(&location.root, location.root.folder(), name),
                Err(DocumentError::InvalidName),
                "{name:?}"
            );
        }
    }

    #[test]
    fn rename_refuses_a_taken_name() {
        let location = Location::new();
        let plan = location.write("Plan.md", "plan");
        location.write("Ideas.md", "ideas");

        let result = rename_note(&location.root, &plan, "Ideas");

        assert_eq!(result, Err(DocumentError::NameTaken));
        assert_eq!(fs::read_to_string(&plan).unwrap(), "plan");
        assert_eq!(
            fs::read_to_string(location.path("Ideas.md")).unwrap(),
            "ideas"
        );
    }

    #[test]
    fn rename_moves_the_child_notes_and_keeps_the_extension() {
        let location = Location::new();
        let note = location.write("Projects.markdown", "# Projects");
        location.write(r"Projects\Plan.md", "child");

        let renamed = rename_note(&location.root, &note, "Work").unwrap();

        assert_eq!(renamed.file_name, "Work.markdown");
        assert_eq!(
            fs::read_to_string(location.path(r"Work\Plan.md")).unwrap(),
            "child"
        );
        assert!(!location.path("Projects").exists());
    }

    #[test]
    fn rename_may_change_only_the_case() {
        let location = Location::new();
        let note = location.write("plan.md", "plan");

        let renamed = rename_note(&location.root, &note, "Plan").unwrap();

        assert_eq!(renamed.file_name, "Plan.md");
    }

    #[test]
    fn move_keeps_the_bytes() {
        let location = Location::new();
        let bytes = b"\xEF\xBB\xBF# Plan\r\nline\r\n";
        let note = location.path("Plan.md");
        fs::write(&note, bytes).unwrap();
        let modified = fs::metadata(&note).unwrap().modified().unwrap();
        fs::create_dir(location.path("Archive")).unwrap();

        let moved = move_note(&location.root, &note, &location.path("Archive")).unwrap();

        assert_eq!(fs::read(moved.path()).unwrap(), bytes);
        assert_eq!(
            fs::metadata(moved.path()).unwrap().modified().unwrap(),
            modified
        );
        assert!(!note.exists());
    }

    #[test]
    fn move_under_a_note_creates_its_folder_and_takes_the_child_notes() {
        let location = Location::new();
        let note = location.write("Plan.md", "plan");
        location.write(r"Plan\Step.md", "step");
        let projects = location.write("Projects.md", "projects");

        let moved = move_note(&location.root, &note, &projects).unwrap();

        assert_eq!(moved.path(), location.path(r"Projects\Plan.md"));
        assert_eq!(
            fs::read_to_string(location.path(r"Projects\Plan\Step.md")).unwrap(),
            "step"
        );
    }

    #[test]
    fn move_refuses_a_note_into_its_own_child_notes() {
        let location = Location::new();
        let note = location.write("Plan.md", "plan");
        let step = location.write(r"Plan\Step.md", "step");

        assert_eq!(
            move_note(&location.root, &note, &location.path("Plan")),
            Err(DocumentError::InvalidRequest)
        );
        assert_eq!(
            move_note(&location.root, &note, &step),
            Err(DocumentError::InvalidRequest)
        );
        assert!(note.exists());
    }

    #[test]
    fn move_refuses_a_name_taken_in_the_target_and_removes_no_folder() {
        let location = Location::new();
        let note = location.write("Plan.md", "plan");
        location.write(r"Archive\plan.md", "older");

        let result = move_note(&location.root, &note, &location.path("Archive"));

        assert_eq!(result, Err(DocumentError::NameTaken));
        assert_eq!(
            fs::read_to_string(location.path(r"Archive\plan.md")).unwrap(),
            "older"
        );
        assert!(note.exists());
    }

    #[test]
    fn paths_outside_the_location_are_refused() {
        let location = Location::new();
        let elsewhere = tempfile::tempdir().unwrap();
        let outside_note = elsewhere.path().join("Outside.md");
        fs::write(&outside_note, "outside").unwrap();
        let note = location.write("Plan.md", "plan");

        assert_eq!(
            create_note(&location.root, elsewhere.path(), "New"),
            Err(DocumentError::AccessDenied)
        );
        assert_eq!(
            rename_note(&location.root, &outside_note, "Renamed"),
            Err(DocumentError::AccessDenied)
        );
        assert_eq!(
            move_note(&location.root, &note, elsewhere.path()),
            Err(DocumentError::AccessDenied)
        );
        assert_eq!(
            move_note(&location.root, &note, &location.path(r"Plan.md\..\..")),
            Err(DocumentError::AccessDenied)
        );
        assert!(note.exists());
    }

    #[test]
    fn the_app_folder_is_out_of_reach() {
        let location = Location::new();
        let note = location.write("Plan.md", "plan");

        assert_eq!(
            create_note(&location.root, &location.path(".mdx-notes"), "New"),
            Err(DocumentError::AccessDenied)
        );
        assert_eq!(
            move_note(&location.root, &note, &location.path(".mdx-notes")),
            Err(DocumentError::AccessDenied)
        );
    }

    #[test]
    fn a_note_in_a_folder_makes_the_folder_on_first_use() {
        let location = Location::new();
        assert!(!location.path("Daily").exists());

        let note =
            create_note_in_folder(&location.root, "Daily/2026", "2026-11-12", "# Thursday\n")
                .unwrap();

        assert_eq!(note.path(), location.path(r"Daily\2026\2026-11-12.md"));
        assert_eq!(fs::read_to_string(note.path()).unwrap(), "# Thursday\n");
        assert_eq!(
            create_note_in_folder(&location.root, "Daily/2026", "2026-11-12", "again"),
            Err(DocumentError::NameTaken)
        );
        assert_eq!(fs::read_to_string(note.path()).unwrap(), "# Thursday\n");
    }

    #[test]
    fn a_folder_that_leaves_the_location_is_refused() {
        let location = Location::new();

        for folder in ["..", "Daily/../..", ".mdx-notes", r"a\b", "Days."] {
            assert!(
                create_note_in_folder(&location.root, folder, "Note", "").is_err(),
                "{folder:?}"
            );
        }
    }
}
