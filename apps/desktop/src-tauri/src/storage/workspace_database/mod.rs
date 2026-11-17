mod legacy_import;
mod schema_steps;
mod stored_values;
mod workspace_tables;

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use rusqlite::{Connection, ErrorCode};

pub use legacy_import::{LegacyStateImport, LegacyStateImportInput};
use schema_steps::{SCHEMA_STEPS, refuse_newer_schema, upgrade_schema};
pub use stored_values::{
    AppValueKey, JsonText, ListName, WindowId, WorkspaceId, WorkspaceRecord, WorkspaceRecordInput,
};
pub use workspace_tables::WorkspaceContents;

pub const DATABASE_FILE_NAME: &str = "mdx.db";

/// 1 MB, given in KiB as a negative number, which is how SQLite reads `cache_size`.
const PAGE_CACHE_KIB: i64 = -1024;

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum DatabaseError {
    #[error("the argument {0} is not valid")]
    InvalidArgument(&'static str),
    #[error("the value is not valid JSON")]
    InvalidJson,
    #[error("the value is larger than the column allows")]
    TooLarge,
    #[error("the workspace does not exist")]
    UnknownWorkspace,
    #[error("workspaces exist already, so the earlier state is not imported again")]
    AlreadyImported,
    #[error("the imported {0} did not read back as written")]
    ImportMismatch(&'static str),
    #[error("the database was written by a newer version")]
    NewerDatabase,
    #[error("the database could not be read or written: {0}")]
    Storage(String),
}

impl From<rusqlite::Error> for DatabaseError {
    fn from(error: rusqlite::Error) -> Self {
        let is_missing_parent = error.sqlite_error().is_some_and(|failure| {
            failure.code == ErrorCode::ConstraintViolation
                && failure.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_FOREIGNKEY
        });
        if is_missing_parent {
            Self::UnknownWorkspace
        } else {
            Self::Storage(error.to_string())
        }
    }
}

impl From<std::io::Error> for DatabaseError {
    fn from(error: std::io::Error) -> Self {
        Self::Storage(error.to_string())
    }
}

/// The workspace store in the app data folder, opened on first use and checkpointed on close.
#[derive(Debug)]
pub struct WorkspaceDatabase {
    file_path: PathBuf,
    connection: Mutex<Option<Connection>>,
}

impl WorkspaceDatabase {
    pub fn new(folder: &Path) -> Self {
        Self {
            file_path: folder.join(DATABASE_FILE_NAME),
            connection: Mutex::new(None),
        }
    }

    pub fn load_registry(&self) -> Result<Vec<WorkspaceRecord>, DatabaseError> {
        self.with_connection(workspace_tables::load_registry)
    }

    pub fn load_workspace(
        &self,
        workspace_id: &WorkspaceId,
        window_id: &WindowId,
    ) -> Result<Option<WorkspaceContents>, DatabaseError> {
        self.with_connection(|connection| {
            workspace_tables::load_workspace(connection, workspace_id, window_id)
        })
    }

    pub fn saved_paths_json(
        &self,
        workspace_id: &WorkspaceId,
        window_id: &WindowId,
    ) -> Result<Option<String>, DatabaseError> {
        self.with_connection(|connection| {
            workspace_tables::saved_paths_json(connection, workspace_id, window_id)
        })
    }

    pub fn save_workspace(&self, record: &WorkspaceRecord) -> Result<(), DatabaseError> {
        self.with_connection(|connection| workspace_tables::save_workspace(connection, record))
    }

    pub fn delete_workspace(&self, workspace_id: &WorkspaceId) -> Result<(), DatabaseError> {
        self.with_connection(|connection| {
            workspace_tables::delete_workspace(connection, workspace_id)
        })
    }

    pub fn save_list(
        &self,
        workspace_id: &WorkspaceId,
        list_name: ListName,
        value: &JsonText,
    ) -> Result<(), DatabaseError> {
        self.with_connection(|connection| {
            workspace_tables::save_list(connection, workspace_id, list_name, value)
        })
    }

    pub fn save_window_session(
        &self,
        window_id: &WindowId,
        workspace_id: &WorkspaceId,
        session: &JsonText,
    ) -> Result<(), DatabaseError> {
        self.with_connection(|connection| {
            workspace_tables::save_window_session(connection, window_id, workspace_id, session)
        })
    }

    pub fn delete_window_sessions(&self, window_id: &WindowId) -> Result<(), DatabaseError> {
        self.with_connection(|connection| {
            workspace_tables::delete_window_sessions(connection, window_id)
        })
    }

    pub fn load_app_values(&self) -> Result<BTreeMap<String, String>, DatabaseError> {
        self.with_connection(workspace_tables::load_app_values)
    }

    pub fn save_app_value(&self, key: &AppValueKey, value: &JsonText) -> Result<(), DatabaseError> {
        self.with_connection(|connection| workspace_tables::save_app_value(connection, key, value))
    }

    pub fn import_legacy_state(&self, import: &LegacyStateImport) -> Result<(), DatabaseError> {
        self.with_connection(|connection| legacy_import::import_legacy_state(connection, import))
    }

    pub fn clear_all(&self) -> Result<(), DatabaseError> {
        self.with_connection(legacy_import::clear_all)
    }

    /// Folds the write-ahead log into the database file, so a roaming profile copies one complete file.
    pub fn close(&self) -> Result<(), DatabaseError> {
        let Some(connection) = self.lock_connection().take() else {
            return Ok(());
        };
        connection.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))?;
        connection.close().map_err(|(_, error)| error.into())
    }

    fn lock_connection(&self) -> std::sync::MutexGuard<'_, Option<Connection>> {
        self.connection
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    fn with_connection<T>(
        &self,
        action: impl FnOnce(&Connection) -> Result<T, DatabaseError>,
    ) -> Result<T, DatabaseError> {
        let mut connection = self.lock_connection();
        if connection.is_none() {
            *connection = Some(open_database(&self.file_path)?);
        }
        match connection.as_ref() {
            Some(connection) => action(connection),
            None => Err(DatabaseError::Storage(
                "the database is not open".to_owned(),
            )),
        }
    }
}

fn open_database(file_path: &Path) -> Result<Connection, DatabaseError> {
    if let Some(folder) = file_path.parent() {
        fs::create_dir_all(folder)?;
    }
    let mut connection = Connection::open(file_path)?;
    connection.pragma_update(None, "foreign_keys", true)?;
    connection.pragma_update(None, "synchronous", "NORMAL")?;
    connection.pragma_update(None, "cache_size", PAGE_CACHE_KIB)?;
    refuse_newer_schema(&connection, SCHEMA_STEPS)?;
    connection
        .pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get::<_, String>(0))?;
    upgrade_schema(&mut connection, SCHEMA_STEPS)?;
    Ok(connection)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace_input(id: &str) -> WorkspaceRecordInput {
        WorkspaceRecordInput {
            id: id.to_owned(),
            kind_id: "markdownViewer".to_owned(),
            name: None,
            icon: None,
            colour: None,
            position: 0,
            last_shown_at_ms: None,
            source_file: None,
            kind_data: None,
        }
    }

    fn save_default_workspace(database: &WorkspaceDatabase) -> WorkspaceId {
        let record = WorkspaceRecord::try_from(workspace_input("default")).unwrap();
        database.save_workspace(&record).unwrap();
        record.id
    }

    #[test]
    fn does_not_create_the_file_until_first_used() {
        let folder = tempfile::tempdir().unwrap();
        let database = WorkspaceDatabase::new(folder.path());

        let existed_before_use = folder.path().join(DATABASE_FILE_NAME).exists();
        database.load_registry().unwrap();

        assert!(!existed_before_use);
        assert!(folder.path().join(DATABASE_FILE_NAME).exists());
    }

    #[test]
    fn keeps_what_was_saved_after_closing_and_reopening() {
        let folder = tempfile::tempdir().unwrap();
        let database = WorkspaceDatabase::new(folder.path());
        let workspace_id = save_default_workspace(&database);
        let favourites = JsonText::try_from("[1]".to_owned()).unwrap();
        database
            .save_list(&workspace_id, ListName::Favourites, &favourites)
            .unwrap();

        database.close().unwrap();
        let window_id = WindowId::try_from("main".to_owned()).unwrap();
        let contents = WorkspaceDatabase::new(folder.path())
            .load_workspace(&workspace_id, &window_id)
            .unwrap();

        assert_eq!(
            contents.unwrap().lists.get("favourites"),
            Some(&"[1]".to_owned())
        );
    }

    #[test]
    fn uses_the_write_ahead_log_and_foreign_keys() {
        let folder = tempfile::tempdir().unwrap();
        let connection = open_database(&folder.path().join(DATABASE_FILE_NAME)).unwrap();

        let journal_mode: String = connection
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .unwrap();
        let foreign_keys: bool = connection
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        let synchronous: i64 = connection
            .query_row("PRAGMA synchronous", [], |row| row.get(0))
            .unwrap();

        assert_eq!(journal_mode, "wal");
        assert!(foreign_keys);
        assert_eq!(synchronous, 1, "NORMAL");
    }

    #[test]
    fn after_close_no_write_ahead_log_content_remains() {
        let folder = tempfile::tempdir().unwrap();
        let database = WorkspaceDatabase::new(folder.path());
        save_default_workspace(&database);

        database.close().unwrap();

        let log_path = folder.path().join(format!("{DATABASE_FILE_NAME}-wal"));
        let log_bytes = fs::metadata(&log_path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        assert_eq!(log_bytes, 0);
    }

    /// Workspaces that each have four 25-entry lists and a window session, closed as on exit.
    fn database_with_workspaces(workspace_count: i64) -> tempfile::TempDir {
        let folder = tempfile::tempdir().unwrap();
        let database = WorkspaceDatabase::new(folder.path());
        let recent_files = format!("[{}]", vec![r#"{"location":{"canonicalKey":"c:\\docs\\a.md","displayPath":"C:\\Docs\\a.md","fileName":"a.md"},"isPinned":false,"lastOpenedAtMs":1}"#; 25].join(","));
        let session =
            format!(r#"{{"tabs":{{"tabs":{recent_files}}},"layout":{{"isSidebarShown":true}}}}"#);
        for position in 0..workspace_count {
            let record = WorkspaceRecord::try_from(WorkspaceRecordInput {
                id: format!("workspace-{position}"),
                position,
                ..workspace_input("default")
            })
            .unwrap();
            database.save_workspace(&record).unwrap();
            for list_name in ListName::ALL {
                database
                    .save_list(
                        &record.id,
                        list_name,
                        &JsonText::try_from(recent_files.clone()).unwrap(),
                    )
                    .unwrap();
            }
            let window_id = WindowId::try_from("main".to_owned()).unwrap();
            database
                .save_window_session(
                    &window_id,
                    &record.id,
                    &JsonText::try_from(session.clone()).unwrap(),
                )
                .unwrap();
        }
        database.close().unwrap();
        folder
    }

    /// Start-up budget check, run on demand: `cargo test --lib -- --ignored --nocapture opens_and_reads`.
    #[test]
    #[ignore = "timing check for the reference machine, not a correctness test"]
    fn opens_and_reads_the_registry_and_one_session_within_budget() {
        const WORKSPACE_COUNT: i64 = 50;
        const BUDGET: std::time::Duration = std::time::Duration::from_millis(15);
        let folder = database_with_workspaces(WORKSPACE_COUNT);

        let started = std::time::Instant::now();
        let reopened = WorkspaceDatabase::new(folder.path());
        let registry = reopened.load_registry().unwrap();
        let window_id = WindowId::try_from("main".to_owned()).unwrap();
        let contents = reopened
            .load_workspace(&registry[0].id, &window_id)
            .unwrap();
        let elapsed = started.elapsed();

        println!(
            "open, registry of {} and one session: {elapsed:?}",
            registry.len()
        );
        assert!(contents.is_some());
        assert!(
            elapsed < BUDGET,
            "{elapsed:?} is over the {BUDGET:?} budget"
        );
    }

    #[test]
    fn refuses_a_database_from_a_newer_version_without_changing_it() {
        let folder = tempfile::tempdir().unwrap();
        let file_path = folder.path().join(DATABASE_FILE_NAME);
        let newer_version = i64::try_from(SCHEMA_STEPS.len() + 1).unwrap();
        let newer = Connection::open(&file_path).unwrap();
        newer
            .pragma_update(None, "user_version", newer_version)
            .unwrap();
        newer.close().unwrap();
        let bytes_before = fs::read(&file_path).unwrap();

        let result = WorkspaceDatabase::new(folder.path()).load_registry();

        assert_eq!(result, Err(DatabaseError::NewerDatabase));
        assert_eq!(fs::read(&file_path).unwrap(), bytes_before);
    }
}
