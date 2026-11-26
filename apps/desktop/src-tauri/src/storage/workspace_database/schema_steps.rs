use rusqlite::Connection;

use super::DatabaseError;

/// Each step moves the schema up by one version and never changes once released; add new steps at the end.
pub const SCHEMA_STEPS: &[&str] = &[
    CREATE_WORKSPACE_TABLES,
    ADD_WORKSPACE_SOURCE_FILE,
    ADD_WORKSPACE_KIND_DATA,
];

const CREATE_WORKSPACE_TABLES: &str = "
CREATE TABLE app_values (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL CHECK (json_valid(value_json) AND length(value_json) <= 5242880)
) STRICT;

CREATE TABLE workspaces (
    id TEXT PRIMARY KEY NOT NULL,
    kind_id TEXT NOT NULL,
    name TEXT,
    icon TEXT,
    colour TEXT,
    position INTEGER NOT NULL,
    last_shown_at_ms INTEGER
) STRICT;

CREATE TABLE workspace_lists (
    workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    list_name TEXT NOT NULL,
    value_json TEXT NOT NULL CHECK (json_valid(value_json) AND length(value_json) <= 5242880),
    PRIMARY KEY (workspace_id, list_name)
) STRICT;

CREATE TABLE window_sessions (
    window_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    session_json TEXT NOT NULL CHECK (json_valid(session_json) AND length(session_json) <= 5242880),
    PRIMARY KEY (window_id, workspace_id)
) STRICT;

CREATE INDEX window_sessions_by_workspace ON window_sessions (workspace_id);
";

/// The workspace file a workspace was opened from, so opening that file again switches to it.
const ADD_WORKSPACE_SOURCE_FILE: &str = "ALTER TABLE workspaces ADD COLUMN source_file TEXT;";

/// What a kind keeps for its workspace, such as a Notes workspace's location; read with the registry.
const ADD_WORKSPACE_KIND_DATA: &str = "ALTER TABLE workspaces ADD COLUMN kind_data_json TEXT
    CHECK (kind_data_json IS NULL OR (json_valid(kind_data_json) AND length(kind_data_json) <= 65536));";

pub fn schema_version(connection: &Connection) -> Result<usize, DatabaseError> {
    let version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    usize::try_from(version)
        .map_err(|_| DatabaseError::Storage("negative schema version".to_owned()))
}

/// Refuses a database written by a newer version before anything in it changes.
pub fn refuse_newer_schema(connection: &Connection, steps: &[&str]) -> Result<(), DatabaseError> {
    let version = schema_version(connection)?;
    if version > steps.len() {
        return Err(DatabaseError::NewerDatabase);
    }
    Ok(())
}

/// Runs the missing steps in order, each in its own transaction with the version it reaches.
pub fn upgrade_schema(connection: &mut Connection, steps: &[&str]) -> Result<(), DatabaseError> {
    refuse_newer_schema(connection, steps)?;
    let version = schema_version(connection)?;
    for (index, step) in steps.iter().enumerate().skip(version) {
        let reached_version = i64::try_from(index + 1)
            .map_err(|_| DatabaseError::Storage("too many schema steps".to_owned()))?;
        let transaction = connection.transaction()?;
        transaction.execute_batch(step)?;
        transaction.pragma_update(None, "user_version", reached_version)?;
        transaction.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use sha2::{Digest, Sha256};

    use super::*;

    /// SHA-256 of each step already in use. Data folders hold databases at these steps, so a changed
    /// step would leave them with a schema no step describes.
    const SHIPPED_STEP_HASHES: &[&str] = &[
        "0b62ba6aef99e92938e3e2491a195eab82f66ea8e3cc16187a16a6714db3dfcc",
        "32ef3097a2e746f52bd2225f75b75f1fdf3a8fc67c917ffa520c493055494c41",
        "68812ee47b93a512d2e81013f332bfcac24114d74553f0f9e9bddf6c11269b4c",
    ];

    const FIRST_STEP: &str = "CREATE TABLE first (id INTEGER PRIMARY KEY);";
    const SECOND_STEP: &str = "CREATE TABLE second (id INTEGER PRIMARY KEY);";
    const FAILING_STEP: &str =
        "CREATE TABLE third (id INTEGER PRIMARY KEY); INSERT INTO missing VALUES (1);";

    fn table_names(connection: &Connection) -> Vec<String> {
        let mut statement = connection
            .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
            .unwrap();
        statement
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    #[test]
    fn shipped_schema_steps_never_change() {
        let step_hashes: Vec<String> = SCHEMA_STEPS
            .iter()
            .map(|step| format!("{:x}", Sha256::digest(step.as_bytes())))
            .collect();

        assert!(
            SCHEMA_STEPS.len() >= SHIPPED_STEP_HASHES.len(),
            "a step in use was removed"
        );
        assert_eq!(
            step_hashes[..SHIPPED_STEP_HASHES.len()],
            *SHIPPED_STEP_HASHES,
            "add a new step instead of editing one in use"
        );
    }

    #[test]
    fn a_new_database_gets_the_current_schema() {
        let mut connection = Connection::open_in_memory().unwrap();

        upgrade_schema(&mut connection, SCHEMA_STEPS).unwrap();

        assert_eq!(schema_version(&connection).unwrap(), SCHEMA_STEPS.len());
        assert_eq!(
            table_names(&connection),
            [
                "app_values",
                "window_sessions",
                "workspace_lists",
                "workspaces"
            ]
        );
    }

    #[test]
    fn a_first_version_database_gains_the_source_file_and_keeps_its_workspaces() {
        let mut connection = Connection::open_in_memory().unwrap();
        upgrade_schema(&mut connection, &SCHEMA_STEPS[..1]).unwrap();
        connection
            .execute(
                "INSERT INTO workspaces (id, kind_id, name, position) VALUES ('default', 'markdownViewer', NULL, 0)",
                [],
            )
            .unwrap();

        upgrade_schema(&mut connection, SCHEMA_STEPS).unwrap();

        let source_file: Option<String> = connection
            .query_row(
                "SELECT source_file FROM workspaces WHERE id = 'default'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(source_file, None);
        assert_eq!(schema_version(&connection).unwrap(), SCHEMA_STEPS.len());
    }

    #[test]
    fn an_older_schema_is_upgraded_step_by_step() {
        let mut connection = Connection::open_in_memory().unwrap();
        upgrade_schema(&mut connection, &[FIRST_STEP]).unwrap();

        upgrade_schema(&mut connection, &[FIRST_STEP, SECOND_STEP]).unwrap();

        assert_eq!(schema_version(&connection).unwrap(), 2);
        assert_eq!(table_names(&connection), ["first", "second"]);
    }

    #[test]
    fn a_failing_step_rolls_back_and_leaves_the_version_unchanged() {
        let mut connection = Connection::open_in_memory().unwrap();
        upgrade_schema(&mut connection, &[FIRST_STEP]).unwrap();

        let result = upgrade_schema(&mut connection, &[FIRST_STEP, FAILING_STEP]);

        assert!(matches!(result, Err(DatabaseError::Storage(_))));
        assert_eq!(schema_version(&connection).unwrap(), 1);
        assert_eq!(table_names(&connection), ["first"]);
    }

    #[test]
    fn a_database_from_a_newer_version_is_refused_and_not_changed() {
        let mut connection = Connection::open_in_memory().unwrap();
        upgrade_schema(&mut connection, &[FIRST_STEP, SECOND_STEP]).unwrap();

        let result = upgrade_schema(&mut connection, &[FIRST_STEP]);

        assert_eq!(result, Err(DatabaseError::NewerDatabase));
        assert_eq!(schema_version(&connection).unwrap(), 2);
        assert_eq!(table_names(&connection), ["first", "second"]);
    }
}
