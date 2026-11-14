use std::collections::BTreeMap;

use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::Serialize;

use super::DatabaseError;
use super::stored_values::{
    AppValueKey, JsonText, KindId, ListName, WindowId, WorkspaceId, WorkspaceRecord,
};

/// What a window needs to show a workspace: its lists and that window's last session in it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceContents {
    /// JSON text per list name; the core parses each entry.
    pub lists: BTreeMap<&'static str, String>,
    pub window_session: Option<String>,
}

pub fn load_registry(connection: &Connection) -> Result<Vec<WorkspaceRecord>, DatabaseError> {
    let mut statement = connection.prepare_cached(
        "SELECT id, kind_id, name, icon, colour, position, last_shown_at_ms, source_file,
             kind_data_json
         FROM workspaces ORDER BY position, id",
    )?;
    let rows = statement.query_map([], |row| Ok(stored_record_of(row)))?;
    let mut records = Vec::new();
    for row in rows {
        // A row this version cannot read is skipped, not fatal, so one bad row never hides the others.
        if let Ok(record) = row? {
            records.push(record);
        }
    }
    Ok(records)
}

fn stored_record_of(row: &Row<'_>) -> Result<WorkspaceRecord, DatabaseError> {
    Ok(WorkspaceRecord {
        id: WorkspaceId::try_from(row.get::<_, String>(0)?)?,
        kind_id: KindId::try_from(row.get::<_, String>(1)?)?,
        name: row.get(2)?,
        icon: row.get(3)?,
        colour: row.get(4)?,
        position: row.get(5)?,
        last_shown_at_ms: row.get(6)?,
        source_file: row.get(7)?,
        kind_data: row.get(8)?,
    })
}

pub fn load_workspace(
    connection: &Connection,
    workspace_id: &WorkspaceId,
    window_id: &WindowId,
) -> Result<Option<WorkspaceContents>, DatabaseError> {
    let exists = connection
        .prepare_cached("SELECT 1 FROM workspaces WHERE id = ?1")?
        .exists([workspace_id.as_str()])?;
    if !exists {
        return Ok(None);
    }
    let window_session = connection
        .prepare_cached(
            "SELECT session_json FROM window_sessions WHERE window_id = ?1 AND workspace_id = ?2",
        )?
        .query_row([window_id.as_str(), workspace_id.as_str()], |row| {
            row.get(0)
        })
        .optional()?;
    Ok(Some(WorkspaceContents {
        lists: load_lists(connection, workspace_id)?,
        window_session,
    }))
}

/// A workspace's tabs and lists in the shape of the earlier state file, for collecting the paths to grant.
pub fn saved_paths_json(
    connection: &Connection,
    workspace_id: &WorkspaceId,
    window_id: &WindowId,
) -> Result<Option<String>, DatabaseError> {
    let Some(contents) = load_workspace(connection, workspace_id, window_id)? else {
        return Ok(None);
    };
    let mut state = serde_json::Map::new();
    for (list_name, value_json) in contents.lists {
        let value = serde_json::from_str(&value_json).unwrap_or(serde_json::Value::Null);
        state.insert(list_name.to_owned(), value);
    }
    let session = contents
        .window_session
        .and_then(|session_json| serde_json::from_str::<serde_json::Value>(&session_json).ok());
    if let Some(tabs) =
        session.and_then(|mut session| session.get_mut("tabs").map(serde_json::Value::take))
    {
        state.insert("tabs".to_owned(), tabs);
    }
    Ok(Some(serde_json::Value::Object(state).to_string()))
}

fn load_lists(
    connection: &Connection,
    workspace_id: &WorkspaceId,
) -> Result<BTreeMap<&'static str, String>, DatabaseError> {
    let mut statement = connection.prepare_cached(
        "SELECT list_name, value_json FROM workspace_lists WHERE workspace_id = ?1",
    )?;
    let rows = statement.query_map([workspace_id.as_str()], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut lists = BTreeMap::new();
    for row in rows {
        let (name, value_json) = row?;
        if let Ok(list_name) = ListName::parse(&name) {
            lists.insert(list_name.as_str(), value_json);
        }
    }
    Ok(lists)
}

pub fn save_workspace(
    connection: &Connection,
    record: &WorkspaceRecord,
) -> Result<(), DatabaseError> {
    connection
        .prepare_cached(
            "INSERT INTO workspaces (id, kind_id, name, icon, colour, position, last_shown_at_ms, source_file,
                 kind_data_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT (id) DO UPDATE SET kind_id = excluded.kind_id, name = excluded.name,
                 icon = excluded.icon, colour = excluded.colour, position = excluded.position,
                 last_shown_at_ms = excluded.last_shown_at_ms, source_file = excluded.source_file,
                 kind_data_json = excluded.kind_data_json",
        )?
        .execute(params![
            record.id.as_str(),
            record.kind_id.as_str(),
            record.name,
            record.icon,
            record.colour,
            record.position,
            record.last_shown_at_ms,
            record.source_file,
            record.kind_data,
        ])?;
    Ok(())
}

/// Its lists and window sessions go with it; documents and folders on disk are never touched.
pub fn delete_workspace(
    connection: &Connection,
    workspace_id: &WorkspaceId,
) -> Result<(), DatabaseError> {
    connection
        .prepare_cached("DELETE FROM workspaces WHERE id = ?1")?
        .execute([workspace_id.as_str()])?;
    Ok(())
}

pub fn save_list(
    connection: &Connection,
    workspace_id: &WorkspaceId,
    list_name: ListName,
    value: &JsonText,
) -> Result<(), DatabaseError> {
    connection
        .prepare_cached(
            "INSERT INTO workspace_lists (workspace_id, list_name, value_json) VALUES (?1, ?2, ?3)
             ON CONFLICT (workspace_id, list_name) DO UPDATE SET value_json = excluded.value_json",
        )?
        .execute([workspace_id.as_str(), list_name.as_str(), value.as_str()])?;
    Ok(())
}

pub fn save_window_session(
    connection: &Connection,
    window_id: &WindowId,
    workspace_id: &WorkspaceId,
    session: &JsonText,
) -> Result<(), DatabaseError> {
    connection
        .prepare_cached(
            "INSERT INTO window_sessions (window_id, workspace_id, session_json) VALUES (?1, ?2, ?3)
             ON CONFLICT (window_id, workspace_id) DO UPDATE SET session_json = excluded.session_json",
        )?
        .execute([window_id.as_str(), workspace_id.as_str(), session.as_str()])?;
    Ok(())
}

pub fn load_app_values(connection: &Connection) -> Result<BTreeMap<String, String>, DatabaseError> {
    let mut statement = connection.prepare_cached("SELECT key, value_json FROM app_values")?;
    let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn save_app_value(
    connection: &Connection,
    key: &AppValueKey,
    value: &JsonText,
) -> Result<(), DatabaseError> {
    connection
        .prepare_cached(
            "INSERT INTO app_values (key, value_json) VALUES (?1, ?2)
             ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json",
        )?
        .execute([key.as_str(), value.as_str()])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::schema_steps::{SCHEMA_STEPS, upgrade_schema};
    use super::*;

    fn database() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "foreign_keys", true)
            .unwrap();
        upgrade_schema(&mut connection, SCHEMA_STEPS).unwrap();
        connection
    }

    fn workspace(id: &str, name: &str, position: i64) -> WorkspaceRecord {
        WorkspaceRecord {
            id: WorkspaceId::try_from(id.to_owned()).unwrap(),
            kind_id: KindId::try_from("markdownViewer".to_owned()).unwrap(),
            name: Some(name.to_owned()),
            icon: None,
            colour: None,
            position,
            last_shown_at_ms: Some(1_000),
            source_file: None,
            kind_data: None,
        }
    }

    fn id(text: &str) -> WorkspaceId {
        WorkspaceId::try_from(text.to_owned()).unwrap()
    }

    fn window(text: &str) -> WindowId {
        WindowId::try_from(text.to_owned()).unwrap()
    }

    fn json(text: &str) -> JsonText {
        JsonText::try_from(text.to_owned()).unwrap()
    }

    #[test]
    fn the_registry_lists_workspaces_in_their_order() {
        let connection = database();
        save_workspace(&connection, &workspace("second", "Second", 1)).unwrap();
        save_workspace(&connection, &workspace("default", "Default", 0)).unwrap();

        let names: Vec<String> = load_registry(&connection)
            .unwrap()
            .into_iter()
            .filter_map(|record| record.name)
            .collect();

        assert_eq!(names, ["Default", "Second"]);
    }

    #[test]
    fn saving_a_workspace_again_renames_it() {
        let connection = database();
        save_workspace(&connection, &workspace("default", "Default", 0)).unwrap();

        save_workspace(&connection, &workspace("default", "Reading", 0)).unwrap();

        assert_eq!(
            load_registry(&connection).unwrap()[0].name.as_deref(),
            Some("Reading")
        );
    }

    #[test]
    fn lists_and_the_window_session_round_trip() {
        let connection = database();
        save_workspace(&connection, &workspace("default", "Default", 0)).unwrap();

        save_list(
            &connection,
            &id("default"),
            ListName::Favourites,
            &json("[1]"),
        )
        .unwrap();
        save_list(
            &connection,
            &id("default"),
            ListName::Favourites,
            &json("[1,2]"),
        )
        .unwrap();
        save_list(
            &connection,
            &id("default"),
            ListName::RecentFiles,
            &json("[]"),
        )
        .unwrap();
        save_window_session(&connection, &window("main"), &id("default"), &json("{}")).unwrap();
        let contents = load_workspace(&connection, &id("default"), &window("main")).unwrap();

        let expected_lists = BTreeMap::from([
            ("favourites", "[1,2]".to_owned()),
            ("recentFiles", "[]".to_owned()),
        ]);
        assert_eq!(
            contents,
            Some(WorkspaceContents {
                lists: expected_lists,
                window_session: Some("{}".to_owned())
            })
        );
    }

    #[test]
    fn a_window_without_a_session_gets_the_lists_only() {
        let connection = database();
        save_workspace(&connection, &workspace("default", "Default", 0)).unwrap();
        save_window_session(&connection, &window("main"), &id("default"), &json("{}")).unwrap();

        let contents = load_workspace(&connection, &id("default"), &window("second")).unwrap();

        assert_eq!(contents.map(|contents| contents.window_session), Some(None));
    }

    #[test]
    fn an_unknown_workspace_has_no_contents_and_takes_no_lists() {
        let connection = database();

        assert_eq!(
            load_workspace(&connection, &id("missing"), &window("main")),
            Ok(None)
        );
        assert_eq!(
            save_list(
                &connection,
                &id("missing"),
                ListName::Favourites,
                &json("[]")
            ),
            Err(DatabaseError::UnknownWorkspace)
        );
    }

    #[test]
    fn deleting_a_workspace_removes_its_lists_and_sessions() {
        let connection = database();
        save_workspace(&connection, &workspace("default", "Default", 0)).unwrap();
        save_workspace(&connection, &workspace("other", "Other", 1)).unwrap();
        save_list(
            &connection,
            &id("other"),
            ListName::RecentFiles,
            &json("[]"),
        )
        .unwrap();
        save_window_session(&connection, &window("main"), &id("other"), &json("{}")).unwrap();

        delete_workspace(&connection, &id("other")).unwrap();

        let remaining_rows: i64 = connection
            .query_row(
                "SELECT (SELECT count(*) FROM workspace_lists) + (SELECT count(*) FROM window_sessions)",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining_rows, 0);
        assert_eq!(load_registry(&connection).unwrap().len(), 1);
    }

    #[test]
    fn composes_the_tabs_and_lists_whose_paths_are_granted() {
        let connection = database();
        save_workspace(&connection, &workspace("default", "Default", 0)).unwrap();
        let favourite = r#"[{"location":{"displayPath":"C:\\Docs"},"kind":"folder"}]"#;
        save_list(
            &connection,
            &id("default"),
            ListName::Favourites,
            &json(favourite),
        )
        .unwrap();
        let session = r#"{"tabs":{"tabs":[{"location":{"displayPath":"C:\\a.md"}}]},"layout":{}}"#;
        save_window_session(&connection, &window("main"), &id("default"), &json(session)).unwrap();

        let composed = saved_paths_json(&connection, &id("default"), &window("main"))
            .unwrap()
            .unwrap();
        let paths = crate::storage::saved_document_paths(&composed);

        assert_eq!(paths.documents, [std::path::PathBuf::from("C:\\a.md")]);
        assert_eq!(paths.folders, [std::path::PathBuf::from("C:\\Docs")]);
    }

    #[test]
    fn paths_of_a_workspace_not_shown_are_not_granted() {
        let connection = database();
        save_workspace(&connection, &workspace("default", "Default", 0)).unwrap();
        save_workspace(&connection, &workspace("other", "Other", 1)).unwrap();
        let other_favourite = r#"[{"location":{"displayPath":"C:\\Private\\b.md"},"kind":"file"}]"#;
        save_list(
            &connection,
            &id("other"),
            ListName::Favourites,
            &json(other_favourite),
        )
        .unwrap();

        let composed = saved_paths_json(&connection, &id("default"), &window("main"))
            .unwrap()
            .unwrap();

        let paths = crate::storage::saved_document_paths(&composed);
        assert!(paths.documents.is_empty());
        assert!(paths.folders.is_empty());
    }

    #[test]
    fn the_database_itself_refuses_invalid_json() {
        let connection = database();

        let result = connection.execute(
            "INSERT INTO app_values (key, value_json) VALUES ('theme', '{ broken')",
            [],
        );

        assert!(result.is_err());
    }

    #[test]
    fn app_values_round_trip() {
        let connection = database();
        let key = AppValueKey::try_from("controlWheel".to_owned()).unwrap();

        save_app_value(&connection, &key, &json(r#"{"dock":"left"}"#)).unwrap();

        assert_eq!(
            load_app_values(&connection).unwrap(),
            BTreeMap::from([("controlWheel".to_owned(), r#"{"dock":"left"}"#.to_owned())])
        );
    }
}
