use std::collections::BTreeMap;

use rusqlite::Connection;
use serde::Deserialize;

use super::DatabaseError;
use super::stored_values::{
    AppValueKey, JsonText, ListName, WindowId, WorkspaceRecord, WorkspaceRecordInput,
};
use super::workspace_tables::{save_app_value, save_list, save_window_session, save_workspace};

/// The earlier single state, already split by the core into one workspace and app values.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LegacyStateImport {
    pub workspace: WorkspaceRecord,
    pub lists: Vec<(ListName, JsonText)>,
    pub window_id: WindowId,
    pub window_session: JsonText,
    pub app_values: Vec<(AppValueKey, JsonText)>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyStateImportInput {
    workspace: WorkspaceRecordInput,
    lists: BTreeMap<String, String>,
    window_id: String,
    window_session: String,
    app_values: BTreeMap<String, String>,
}

impl TryFrom<LegacyStateImportInput> for LegacyStateImport {
    type Error = DatabaseError;

    fn try_from(input: LegacyStateImportInput) -> Result<Self, Self::Error> {
        let lists = input
            .lists
            .into_iter()
            .map(|(name, value)| Ok((ListName::parse(&name)?, JsonText::try_from(value)?)))
            .collect::<Result<_, DatabaseError>>()?;
        let app_values = input
            .app_values
            .into_iter()
            .map(|(key, value)| Ok((AppValueKey::try_from(key)?, JsonText::try_from(value)?)))
            .collect::<Result<_, DatabaseError>>()?;
        Ok(Self {
            workspace: WorkspaceRecord::try_from(input.workspace)?,
            lists,
            window_id: WindowId::try_from(input.window_id)?,
            window_session: JsonText::try_from(input.window_session)?,
            app_values,
        })
    }
}

/// Writes the whole import or nothing: any failure, or counts that do not read back, rolls it back.
pub fn import_legacy_state(
    connection: &Connection,
    import: &LegacyStateImport,
) -> Result<(), DatabaseError> {
    let transaction = connection.unchecked_transaction()?;
    if count_rows(&transaction, "workspaces")? > 0 {
        return Err(DatabaseError::AlreadyImported);
    }
    save_workspace(&transaction, &import.workspace)?;
    for (list_name, value) in &import.lists {
        save_list(&transaction, &import.workspace.id, *list_name, value)?;
    }
    save_window_session(
        &transaction,
        &import.window_id,
        &import.workspace.id,
        &import.window_session,
    )?;
    for (key, value) in &import.app_values {
        save_app_value(&transaction, key, value)?;
    }
    check_counts_read_back(&transaction, import)?;
    transaction.commit()?;
    Ok(())
}

fn check_counts_read_back(
    connection: &Connection,
    import: &LegacyStateImport,
) -> Result<(), DatabaseError> {
    let expected = [
        ("workspaces", 1),
        ("workspace_lists", import.lists.len()),
        ("window_sessions", 1),
        ("app_values", import.app_values.len()),
    ];
    for (table, expected_rows) in expected {
        if usize::try_from(count_rows(connection, table)?).ok() != Some(expected_rows) {
            return Err(DatabaseError::ImportMismatch(table));
        }
    }
    Ok(())
}

/// Only called with the fixed table names above, never with text from the webview.
fn count_rows(connection: &Connection, table: &str) -> Result<i64, DatabaseError> {
    Ok(
        connection.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
            row.get(0)
        })?,
    )
}

pub fn clear_all(connection: &Connection) -> Result<(), DatabaseError> {
    let transaction = connection.unchecked_transaction()?;
    transaction.execute_batch("DELETE FROM workspaces; DELETE FROM app_values;")?;
    transaction.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::schema_steps::{SCHEMA_STEPS, upgrade_schema};
    use super::super::workspace_tables::load_registry;
    use super::*;

    fn database() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "foreign_keys", true)
            .unwrap();
        upgrade_schema(&mut connection, SCHEMA_STEPS).unwrap();
        connection
    }

    fn import_input() -> LegacyStateImportInput {
        LegacyStateImportInput {
            workspace: WorkspaceRecordInput {
                id: "default".to_owned(),
                kind_id: "markdownViewer".to_owned(),
                name: None,
                icon: None,
                colour: None,
                position: 0,
                last_shown_at_ms: Some(1),
            },
            lists: BTreeMap::from([
                ("favourites".to_owned(), "[1]".to_owned()),
                ("recentFiles".to_owned(), "[]".to_owned()),
            ]),
            window_id: "main".to_owned(),
            window_session: r#"{"tabs":{"tabs":[]}}"#.to_owned(),
            app_values: BTreeMap::from([("viewSettings".to_owned(), "{}".to_owned())]),
        }
    }

    fn total_rows(connection: &Connection) -> i64 {
        [
            "workspaces",
            "workspace_lists",
            "window_sessions",
            "app_values",
        ]
        .into_iter()
        .map(|table| count_rows(connection, table).unwrap())
        .sum()
    }

    #[test]
    fn imports_the_workspace_lists_session_and_values_together() {
        let connection = database();
        let import = LegacyStateImport::try_from(import_input()).unwrap();

        import_legacy_state(&connection, &import).unwrap();

        assert_eq!(total_rows(&connection), 5);
        assert_eq!(load_registry(&connection).unwrap()[0].name, None);
    }

    #[test]
    fn a_mismatch_rolls_back() {
        let connection = database();
        let mut import = LegacyStateImport::try_from(import_input()).unwrap();
        let duplicate = import.lists[0].clone();
        import.lists.push(duplicate);

        let result = import_legacy_state(&connection, &import);

        assert_eq!(
            result,
            Err(DatabaseError::ImportMismatch("workspace_lists"))
        );
        assert_eq!(total_rows(&connection), 0);
    }

    #[test]
    fn a_second_import_is_refused() {
        let connection = database();
        let import = LegacyStateImport::try_from(import_input()).unwrap();
        import_legacy_state(&connection, &import).unwrap();

        assert_eq!(
            import_legacy_state(&connection, &import),
            Err(DatabaseError::AlreadyImported)
        );
    }

    #[test]
    fn refuses_an_import_with_an_unknown_list_or_invalid_json() {
        let mut unknown_list = import_input();
        unknown_list
            .lists
            .insert("tabs".to_owned(), "[]".to_owned());
        let mut invalid_json = import_input();
        invalid_json.window_session = "{ broken".to_owned();

        assert_eq!(
            LegacyStateImport::try_from(unknown_list),
            Err(DatabaseError::InvalidArgument("listName"))
        );
        assert_eq!(
            LegacyStateImport::try_from(invalid_json),
            Err(DatabaseError::InvalidJson)
        );
    }

    #[test]
    fn clearing_removes_every_row() {
        let connection = database();
        let import = LegacyStateImport::try_from(import_input()).unwrap();
        import_legacy_state(&connection, &import).unwrap();

        clear_all(&connection).unwrap();

        assert_eq!(total_rows(&connection), 0);
    }
}
