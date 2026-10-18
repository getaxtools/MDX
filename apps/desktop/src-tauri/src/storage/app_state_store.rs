use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

pub const MAX_APP_STATE_BYTES: usize = 5 * 1024 * 1024;

const STATE_FILE_NAME: &str = "app-state.json";
const PENDING_FILE_NAME: &str = "app-state.json.pending";
const CORRUPT_BACKUP_FILE_NAME: &str = "app-state.corrupt.json";

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
        if !is_json(&saved) {
            fs::write(self.folder.join(CORRUPT_BACKUP_FILE_NAME), &saved)?;
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
        fs::create_dir_all(&self.folder)?;
        let pending_path = self.folder.join(PENDING_FILE_NAME);
        let mut pending_file = File::create(&pending_path)?;
        pending_file.write_all(state_json.as_bytes())?;
        pending_file.sync_all()?;
        fs::rename(&pending_path, self.folder.join(STATE_FILE_NAME))?;
        Ok(())
    }
}

fn is_json(text: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(text).is_ok()
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
        assert!(!folder.path().join(PENDING_FILE_NAME).exists());
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
