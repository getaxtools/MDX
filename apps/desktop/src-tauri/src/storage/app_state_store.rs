use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

pub const MAX_APP_STATE_BYTES: usize = 5 * 1024 * 1024;

/// The schema version the core writes (`APP_STATE_SCHEMA_VERSION`); a higher one came from a newer MDX.
const KNOWN_SCHEMA_VERSION: u64 = 1;

const STATE_FILE_NAME: &str = "app-state.json";
const PENDING_SUFFIX: &str = ".pending";
const CORRUPT_BACKUP_FILE_NAME: &str = "app-state.corrupt.json";
const NEWER_VERSION_BACKUP_FILE_NAME: &str = "app-state.newer-version.json";
const BEFORE_WORKSPACES_BACKUP_FILE_NAME: &str = "app-state.before-workspaces.json";

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum AppStateError {
    #[error("the saved state is not valid JSON")]
    InvalidJson,
    #[error("the saved state is larger than {MAX_APP_STATE_BYTES} bytes")]
    TooLarge,
    #[error("the state file could not be read or written: {0}")]
    Storage(String),
}

impl From<io::Error> for AppStateError {
    fn from(error: io::Error) -> Self {
        Self::Storage(error.to_string())
    }
}

#[derive(Debug)]
pub struct AppStateStore {
    folder: PathBuf,
}

impl AppStateStore {
    pub fn new(folder: &Path) -> Self {
        Self {
            folder: folder.to_path_buf(),
        }
    }

    pub fn folder(&self) -> &Path {
        &self.folder
    }

    pub fn load(&self) -> Result<Option<String>, AppStateError> {
        let saved = match fs::read_to_string(self.folder.join(STATE_FILE_NAME)) {
            Ok(saved) => saved,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        match serde_json::from_str::<serde_json::Value>(&saved) {
            Err(_) => fs::write(self.folder.join(CORRUPT_BACKUP_FILE_NAME), &saved)?,
            Ok(state) => {
                if let Some(version) = newer_schema_version(&state) {
                    self.keep_newer_version_copy(&saved, version)?;
                }
            }
        }
        Ok(Some(saved))
    }

    pub fn save(&self, state_json: &str) -> Result<(), AppStateError> {
        if state_json.len() > MAX_APP_STATE_BYTES {
            return Err(AppStateError::TooLarge);
        }
        if !is_json(state_json) {
            return Err(AppStateError::InvalidJson);
        }
        self.write_atomically(STATE_FILE_NAME, state_json)
    }

    /// Clear All Data also forgets the copies kept of state this version could not use, including one
    /// a crash left half written, and a backup that cannot be removed does not keep the others.
    pub fn remove_backups(&self) -> Result<(), AppStateError> {
        let mut first_failure = None;
        for file_name in [
            CORRUPT_BACKUP_FILE_NAME,
            NEWER_VERSION_BACKUP_FILE_NAME,
            BEFORE_WORKSPACES_BACKUP_FILE_NAME,
        ] {
            for path in [
                self.folder.join(file_name),
                self.folder.join(format!("{file_name}{PENDING_SUFFIX}")),
            ] {
                match fs::remove_file(path) {
                    Err(error) if error.kind() != io::ErrorKind::NotFound => {
                        first_failure.get_or_insert(error);
                    }
                    _ => {}
                }
            }
        }
        first_failure.map_or(Ok(()), |error| Err(error.into()))
    }

    /// A one-time copy of the state as it was before workspaces, kept until Clear All Data.
    pub fn keep_copy_before_workspaces(&self) -> Result<(), AppStateError> {
        let backup_path = self.folder.join(BEFORE_WORKSPACES_BACKUP_FILE_NAME);
        if backup_path.exists() {
            return Ok(());
        }
        match fs::read_to_string(self.folder.join(STATE_FILE_NAME)) {
            Ok(saved) => self.write_atomically(BEFORE_WORKSPACES_BACKUP_FILE_NAME, &saved),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    /// Runs before the first save, so going back to an older MDX never loses what a newer one saved.
    fn keep_newer_version_copy(&self, saved: &str, version: u64) -> Result<(), AppStateError> {
        let kept_version = fs::read_to_string(self.folder.join(NEWER_VERSION_BACKUP_FILE_NAME))
            .ok()
            .and_then(|kept| serde_json::from_str::<serde_json::Value>(&kept).ok())
            .and_then(|kept| schema_version_of(&kept));
        if kept_version.is_some_and(|kept_version| kept_version > version) {
            return Ok(());
        }
        self.write_atomically(NEWER_VERSION_BACKUP_FILE_NAME, saved)
    }

    fn write_atomically(&self, file_name: &str, contents: &str) -> Result<(), AppStateError> {
        fs::create_dir_all(&self.folder)?;
        let pending_path = self.folder.join(format!("{file_name}{PENDING_SUFFIX}"));
        let mut pending_file = File::create(&pending_path)?;
        pending_file.write_all(contents.as_bytes())?;
        pending_file.sync_all()?;
        fs::rename(&pending_path, self.folder.join(file_name))?;
        Ok(())
    }
}

fn is_json(text: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(text).is_ok()
}

fn schema_version_of(state: &serde_json::Value) -> Option<u64> {
    state.get("schemaVersion")?.as_u64()
}

fn newer_schema_version(state: &serde_json::Value) -> Option<u64> {
    schema_version_of(state).filter(|version| *version > KNOWN_SCHEMA_VERSION)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_nothing_to_load_on_first_launch() {
        let folder = tempfile::tempdir().unwrap();

        assert_eq!(AppStateStore::new(folder.path()).load(), Ok(None));
    }

    #[test]
    fn loads_what_was_saved() {
        let folder = tempfile::tempdir().unwrap();
        let store = AppStateStore::new(folder.path());

        store.save(r#"{"schemaVersion":1}"#).unwrap();

        assert_eq!(store.load(), Ok(Some(r#"{"schemaVersion":1}"#.to_owned())));
    }

    #[test]
    fn replaces_the_previous_state_and_leaves_no_pending_file() {
        let folder = tempfile::tempdir().unwrap();
        let store = AppStateStore::new(folder.path());

        store.save(r#"{"version":"old"}"#).unwrap();
        store.save(r#"{"version":"new"}"#).unwrap();

        assert_eq!(store.load(), Ok(Some(r#"{"version":"new"}"#.to_owned())));
        assert!(
            !folder
                .path()
                .join(format!("{STATE_FILE_NAME}{PENDING_SUFFIX}"))
                .exists()
        );
    }

    #[test]
    fn creates_the_data_folder_when_saving() {
        let folder = tempfile::tempdir().unwrap();
        let store = AppStateStore::new(&folder.path().join("getaxtools").join("MDX"));

        store.save("{}").unwrap();

        assert_eq!(store.load(), Ok(Some("{}".to_owned())));
    }

    #[test]
    fn backs_up_a_corrupt_state_file_and_still_returns_it() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join(STATE_FILE_NAME), "{ broken").unwrap();

        let loaded = AppStateStore::new(folder.path()).load();

        assert_eq!(loaded, Ok(Some("{ broken".to_owned())));
        assert_eq!(
            fs::read_to_string(folder.path().join(CORRUPT_BACKUP_FILE_NAME)).unwrap(),
            "{ broken"
        );
    }

    #[test]
    fn copies_newer_state_before_it_can_be_overwritten() {
        let folder = tempfile::tempdir().unwrap();
        let store = AppStateStore::new(folder.path());
        let newer = r#"{"schemaVersion":2,"workspaces":[]}"#;
        fs::write(folder.path().join(STATE_FILE_NAME), newer).unwrap();

        assert_eq!(store.load(), Ok(Some(newer.to_owned())));
        store.save(r#"{"schemaVersion":1}"#).unwrap();

        let kept = fs::read_to_string(folder.path().join(NEWER_VERSION_BACKUP_FILE_NAME)).unwrap();
        assert_eq!(kept, newer);
        assert!(
            !folder
                .path()
                .join(format!("{NEWER_VERSION_BACKUP_FILE_NAME}{PENDING_SUFFIX}"))
                .exists()
        );
    }

    #[test]
    fn keeps_a_copy_from_an_even_newer_version() {
        let folder = tempfile::tempdir().unwrap();
        let newest = r#"{"schemaVersion":3}"#;
        fs::write(folder.path().join(NEWER_VERSION_BACKUP_FILE_NAME), newest).unwrap();
        fs::write(
            folder.path().join(STATE_FILE_NAME),
            r#"{"schemaVersion":2}"#,
        )
        .unwrap();

        AppStateStore::new(folder.path()).load().unwrap();

        let kept = fs::read_to_string(folder.path().join(NEWER_VERSION_BACKUP_FILE_NAME)).unwrap();
        assert_eq!(kept, newest);
    }

    #[test]
    fn makes_no_copy_of_state_this_version_can_read() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(
            folder.path().join(STATE_FILE_NAME),
            r#"{"schemaVersion":1}"#,
        )
        .unwrap();

        AppStateStore::new(folder.path()).load().unwrap();

        assert!(!folder.path().join(NEWER_VERSION_BACKUP_FILE_NAME).exists());
    }

    #[test]
    fn the_copy_before_workspaces_is_written_once_and_leaves_the_state_file_unchanged() {
        let folder = tempfile::tempdir().unwrap();
        let store = AppStateStore::new(folder.path());
        let earlier = br#"{"schemaVersion":1,"favourites":[]}"#;
        fs::write(folder.path().join(STATE_FILE_NAME), earlier).unwrap();

        store.keep_copy_before_workspaces().unwrap();
        store.save(r#"{"schemaVersion":1,"changed":true}"#).unwrap();
        store.keep_copy_before_workspaces().unwrap();

        let backup = fs::read(folder.path().join(BEFORE_WORKSPACES_BACKUP_FILE_NAME)).unwrap();
        assert_eq!(backup, earlier);
    }

    #[test]
    fn the_earlier_file_is_byte_for_byte_unchanged_by_the_copy() {
        let folder = tempfile::tempdir().unwrap();
        let earlier = "{\r\n  \"schemaVersion\": 1\r\n}";
        fs::write(folder.path().join(STATE_FILE_NAME), earlier).unwrap();

        AppStateStore::new(folder.path())
            .keep_copy_before_workspaces()
            .unwrap();

        assert_eq!(
            fs::read_to_string(folder.path().join(STATE_FILE_NAME)).unwrap(),
            earlier
        );
    }

    #[test]
    fn removes_the_backups_and_tolerates_missing_ones() {
        let folder = tempfile::tempdir().unwrap();
        let store = AppStateStore::new(folder.path());
        fs::write(folder.path().join(NEWER_VERSION_BACKUP_FILE_NAME), "{}").unwrap();

        store.remove_backups().unwrap();
        store.remove_backups().unwrap();

        assert!(!folder.path().join(NEWER_VERSION_BACKUP_FILE_NAME).exists());
        assert!(!folder.path().join(CORRUPT_BACKUP_FILE_NAME).exists());
    }

    #[test]
    fn removes_backups_left_half_written_by_a_crash() {
        let folder = tempfile::tempdir().unwrap();
        let half_written: Vec<_> = [
            CORRUPT_BACKUP_FILE_NAME,
            NEWER_VERSION_BACKUP_FILE_NAME,
            BEFORE_WORKSPACES_BACKUP_FILE_NAME,
        ]
        .iter()
        .map(|file_name| folder.path().join(format!("{file_name}{PENDING_SUFFIX}")))
        .collect();
        for path in &half_written {
            fs::write(path, r#"{"schemaVersion":1,"favou"#).unwrap();
        }

        AppStateStore::new(folder.path()).remove_backups().unwrap();

        assert!(half_written.iter().all(|path| !path.exists()));
    }

    #[test]
    fn the_other_backups_are_removed_when_one_cannot_be_removed() {
        let folder = tempfile::tempdir().unwrap();
        fs::create_dir(folder.path().join(CORRUPT_BACKUP_FILE_NAME)).unwrap();
        fs::write(folder.path().join(NEWER_VERSION_BACKUP_FILE_NAME), "{}").unwrap();
        fs::write(folder.path().join(BEFORE_WORKSPACES_BACKUP_FILE_NAME), "{}").unwrap();

        let result = AppStateStore::new(folder.path()).remove_backups();

        assert!(matches!(result, Err(AppStateError::Storage(_))));
        assert!(!folder.path().join(NEWER_VERSION_BACKUP_FILE_NAME).exists());
        assert!(
            !folder
                .path()
                .join(BEFORE_WORKSPACES_BACKUP_FILE_NAME)
                .exists()
        );
    }

    #[test]
    fn refuses_to_save_invalid_json() {
        let folder = tempfile::tempdir().unwrap();

        assert_eq!(
            AppStateStore::new(folder.path()).save("not json"),
            Err(AppStateError::InvalidJson)
        );
    }

    #[test]
    fn refuses_to_save_oversized_state() {
        let folder = tempfile::tempdir().unwrap();
        let oversized = format!("\"{}\"", "a".repeat(MAX_APP_STATE_BYTES));

        assert_eq!(
            AppStateStore::new(folder.path()).save(&oversized),
            Err(AppStateError::TooLarge)
        );
    }
}
