use std::cmp::Reverse;
use std::fs::{self, DirEntry, File};
use std::io;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use rusqlite::Connection;

use super::DatabaseError;

const COPY_PREFIX: &str = "mdx.before-";
const SCHEMA_MARKER: &str = "-schema-";
const COPY_SUFFIX: &str = ".db";
const PARTIAL_SUFFIX: &str = ".partial";
const COPIES_KEPT: usize = 2;

/// Copies the database next to itself before this version upgrades its schema, keeping the newest two
/// copies. A copy already made for the same upgrade is kept, so a retried upgrade keeps the original.
pub fn copy_before_upgrade(
    connection: &Connection,
    file_path: &Path,
    app_version: &str,
    schema_version: usize,
) -> Result<(), DatabaseError> {
    let folder = file_path.parent().ok_or(DatabaseError::Storage(
        "the database has no folder".to_owned(),
    ))?;
    let copy_path = folder.join(copy_file_name(app_version, schema_version));
    if copy_path.is_file() {
        return Ok(());
    }
    write_copy(connection, &copy_path)?;
    remove_older_copies(folder, &copy_path);
    Ok(())
}

/// Clear All Data also forgets the copies kept before upgrades. A copy that cannot be removed does
/// not stop the others from being removed.
pub fn remove_all_copies(folder: &Path) -> Result<(), DatabaseError> {
    let entries = match fs::read_dir(folder) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.into()),
    };
    let mut first_failure = None;
    for entry in entries {
        let removed = entry.and_then(|entry| {
            if is_copy_or_partial_copy(&entry) {
                remove_unless_gone(&entry.path())
            } else {
                Ok(())
            }
        });
        if let Err(error) = removed {
            first_failure.get_or_insert(error);
        }
    }
    first_failure.map_or(Ok(()), |error| Err(error.into()))
}

fn remove_unless_gone(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

/// SQLite writes the copy from one consistent read, with what is still in the write-ahead log and
/// without the free pages that can hold removed rows.
fn write_copy(connection: &Connection, copy_path: &Path) -> Result<(), DatabaseError> {
    let partial_path = partial_path_for(copy_path);
    let partial_text = partial_path.to_str().ok_or(DatabaseError::Storage(
        "the data folder path is not valid Unicode".to_owned(),
    ))?;
    let _ = fs::remove_file(&partial_path);
    let written = connection
        .execute("VACUUM INTO ?1", [partial_text])
        .map_err(DatabaseError::from)
        .and_then(|_| finish_copy(&partial_path, copy_path).map_err(DatabaseError::from));
    if written.is_err() {
        let _ = fs::remove_file(&partial_path);
    }
    written
}

fn finish_copy(partial_path: &Path, copy_path: &Path) -> io::Result<()> {
    File::options().write(true).open(partial_path)?.sync_all()?;
    fs::rename(partial_path, copy_path)
}

/// Also removes partial copies left by an upgrade that stopped. A copy that cannot be removed now is
/// removed after a later upgrade.
fn remove_older_copies(folder: &Path, new_copy: &Path) {
    let Ok(entries) = fs::read_dir(folder) else {
        return;
    };
    let mut older_copies = Vec::new();
    for entry in entries.flatten() {
        if entry.path() == new_copy || !is_copy_or_partial_copy(&entry) {
            continue;
        }
        if file_name_text(&entry).is_some_and(|name| name.ends_with(PARTIAL_SUFFIX)) {
            let _ = fs::remove_file(entry.path());
        } else if let Ok(modified) = entry.metadata().and_then(|metadata| metadata.modified()) {
            older_copies.push((modified, entry.path()));
        }
    }
    older_copies.sort_by_key(|(modified, _): &(SystemTime, PathBuf)| Reverse(*modified));
    for (_, path) in older_copies.into_iter().skip(COPIES_KEPT - 1) {
        let _ = fs::remove_file(path);
    }
}

fn copy_file_name(app_version: &str, schema_version: usize) -> String {
    format!("{COPY_PREFIX}{app_version}{SCHEMA_MARKER}{schema_version}{COPY_SUFFIX}")
}

fn partial_path_for(copy_path: &Path) -> PathBuf {
    let mut partial_path = copy_path.as_os_str().to_owned();
    partial_path.push(PARTIAL_SUFFIX);
    PathBuf::from(partial_path)
}

/// The name is checked first, so an unrelated entry that cannot be read is never touched.
fn is_copy_or_partial_copy(entry: &DirEntry) -> bool {
    let Some(file_name) = file_name_text(entry) else {
        return false;
    };
    let copy_name = file_name.strip_suffix(PARTIAL_SUFFIX).unwrap_or(&file_name);
    is_upgrade_copy_name(copy_name) && entry.file_type().is_ok_and(|file_type| file_type.is_file())
}

/// A name that is not valid Unicode was never written by this app.
fn file_name_text(entry: &DirEntry) -> Option<String> {
    entry.file_name().into_string().ok()
}

/// Only names this app writes, so a file the user named otherwise is never removed.
fn is_upgrade_copy_name(file_name: &str) -> bool {
    file_name
        .strip_prefix(COPY_PREFIX)
        .and_then(|rest| rest.strip_suffix(COPY_SUFFIX))
        .and_then(|versions| versions.rsplit_once(SCHEMA_MARKER))
        .is_some_and(|(app_version, schema_version)| {
            is_app_version(app_version) && is_number(schema_version)
        })
}

/// A semantic version such as `1.2.3`, `1.2.3-beta.1` or `1.2.3+build.5`.
fn is_app_version(version: &str) -> bool {
    let (version, build) = split_at_first(version, '+');
    let (release, pre_release) = split_at_first(version, '-');
    let numbers: Vec<&str> = release.split('.').collect();
    numbers.len() == 3
        && numbers.iter().all(|number| is_number(number))
        && pre_release.is_none_or(is_dotted_identifiers)
        && build.is_none_or(is_dotted_identifiers)
}

fn split_at_first(text: &str, separator: char) -> (&str, Option<&str>) {
    match text.split_once(separator) {
        Some((before, after)) => (before, Some(after)),
        None => (text, None),
    }
}

fn is_dotted_identifiers(text: &str) -> bool {
    text.split('.').all(|identifier| {
        !identifier.is_empty()
            && identifier
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    })
}

fn is_number(text: &str) -> bool {
    !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::super::schema_steps::{SCHEMA_STEPS, schema_version, upgrade_schema};
    use super::super::{DATABASE_FILE_NAME, WorkspaceDatabase};
    use super::*;

    const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
    const DAY: Duration = Duration::from_secs(24 * 60 * 60);
    const WAL_FILE_NAME: &str = "mdx.db-wal";
    const REMOVED_NAME: &str = "removed-workspace-7f3a9c";
    const UNRELATED_NAMES: [&str; 8] = [
        "mdx.before-notes.txt",
        "mdx.before-.db",
        "mdx.before-my-backup.db",
        "mdx.before-0.1.0.db",
        "mdx.before-1.0.0-my notes-schema-2.db",
        "mdx.before-1.0.0--schema-2.db",
        "mdx.before-1.0.0-beta..1-schema-2.db",
        "mdx.before-1.0.0-schema-2 - Copy.db",
    ];

    fn copy_path(folder: &Path, app_version: &str, schema_version: usize) -> PathBuf {
        folder.join(copy_file_name(app_version, schema_version))
    }

    /// A database at the first step with one workspace, still open, so the row is only in the log.
    fn first_step_database(folder: &Path) -> Connection {
        let mut connection = Connection::open(folder.join(DATABASE_FILE_NAME)).unwrap();
        connection
            .pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get::<_, String>(0))
            .unwrap();
        upgrade_schema(&mut connection, &SCHEMA_STEPS[..1]).unwrap();
        connection
            .execute(
                "INSERT INTO workspaces (id, kind_id, position) VALUES ('default', 'markdownViewer', 0)",
                [],
            )
            .unwrap();
        connection
    }

    fn copy_into(folder: &Path, connection: &Connection, app_version: &str, schema_version: usize) {
        copy_before_upgrade(
            connection,
            &folder.join(DATABASE_FILE_NAME),
            app_version,
            schema_version,
        )
        .unwrap();
    }

    fn workspace_count(path: &Path) -> i64 {
        Connection::open(path)
            .unwrap()
            .query_row("SELECT count(*) FROM workspaces", [], |row| row.get(0))
            .unwrap()
    }

    fn contains(bytes: &[u8], text: &str) -> bool {
        bytes
            .windows(text.len())
            .any(|window| window == text.as_bytes())
    }

    fn create_file_dated(path: &Path, modified: SystemTime) {
        File::create(path).unwrap().set_modified(modified).unwrap();
    }

    fn names_with_copy_prefix(folder: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(folder)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with(COPY_PREFIX))
            .collect();
        names.sort();
        names
    }

    fn create_copies_and_unrelated_files(folder: &Path) {
        let now = SystemTime::now();
        create_file_dated(&copy_path(folder, "0.1.0", 1), now);
        create_file_dated(&copy_path(folder, "0.2.0", 2), now);
        create_file_dated(&partial_path_for(&copy_path(folder, "0.3.0", 3)), now);
        for unrelated in UNRELATED_NAMES {
            create_file_dated(&folder.join(unrelated), now);
        }
    }

    fn unrelated_names_sorted() -> Vec<&'static str> {
        let mut names = UNRELATED_NAMES.to_vec();
        names.sort_unstable();
        names
    }

    #[test]
    fn an_older_database_is_copied_before_it_is_upgraded() {
        let folder = tempfile::tempdir().unwrap();
        first_step_database(folder.path()).close().unwrap();

        WorkspaceDatabase::new(folder.path())
            .load_registry()
            .unwrap();

        let copy = copy_path(folder.path(), APP_VERSION, 1);
        assert_eq!(
            schema_version(&Connection::open(&copy).unwrap()).unwrap(),
            1
        );
        assert_eq!(workspace_count(&copy), 1);
    }

    #[test]
    fn the_copy_holds_what_was_still_in_the_write_ahead_log() {
        let folder = tempfile::tempdir().unwrap();
        let connection = first_step_database(folder.path());

        assert!(
            fs::metadata(folder.path().join(WAL_FILE_NAME))
                .unwrap()
                .len()
                > 0
        );

        copy_into(folder.path(), &connection, "1.0.0", 1);

        assert_eq!(workspace_count(&copy_path(folder.path(), "1.0.0", 1)), 1);
    }

    #[test]
    fn the_copy_leaves_out_rows_removed_before_it() {
        let folder = tempfile::tempdir().unwrap();
        let connection = first_step_database(folder.path());
        connection
            .pragma_update(None, "secure_delete", false)
            .unwrap();
        connection
            .execute(
                "INSERT INTO workspaces (id, kind_id, name, position) VALUES ('removed', 'notes', ?1, 1)",
                [REMOVED_NAME],
            )
            .unwrap();
        connection
            .execute("DELETE FROM workspaces WHERE id = 'removed'", [])
            .unwrap();
        assert!(contains(
            &fs::read(folder.path().join(WAL_FILE_NAME)).unwrap(),
            REMOVED_NAME
        ));

        copy_into(folder.path(), &connection, "1.0.0", 1);

        let copy = fs::read(copy_path(folder.path(), "1.0.0", 1)).unwrap();
        assert!(!contains(&copy, REMOVED_NAME));
        assert_eq!(workspace_count(&copy_path(folder.path(), "1.0.0", 1)), 1);
    }

    #[test]
    fn a_new_or_current_database_is_not_copied() {
        let folder = tempfile::tempdir().unwrap();

        WorkspaceDatabase::new(folder.path())
            .load_registry()
            .unwrap();
        let reopened = WorkspaceDatabase::new(folder.path());
        reopened.load_registry().unwrap();

        assert!(names_with_copy_prefix(folder.path()).is_empty());
    }

    #[test]
    fn keeps_the_newest_two_copies_and_nothing_else_is_removed() {
        let folder = tempfile::tempdir().unwrap();
        let connection = first_step_database(folder.path());
        let now = SystemTime::now();
        create_file_dated(&copy_path(folder.path(), "0.1.0", 1), now - DAY * 3);
        create_file_dated(&copy_path(folder.path(), "0.2.0", 1), now - DAY * 2);
        create_file_dated(&copy_path(folder.path(), "0.3.0-beta.1", 1), now - DAY);
        create_file_dated(
            &partial_path_for(&copy_path(folder.path(), "0.4.0", 1)),
            now - DAY,
        );
        for unrelated in UNRELATED_NAMES {
            create_file_dated(&folder.path().join(unrelated), now - DAY * 9);
        }

        copy_into(folder.path(), &connection, "1.0.0", 1);

        let mut expected = vec![
            "mdx.before-0.3.0-beta.1-schema-1.db",
            "mdx.before-1.0.0-schema-1.db",
        ];
        expected.extend(UNRELATED_NAMES);
        expected.sort_unstable();
        assert_eq!(names_with_copy_prefix(folder.path()), expected);
    }

    #[test]
    fn only_names_in_the_copy_form_are_copy_names() {
        for name in [
            "mdx.before-1.2.3-schema-2.db",
            "mdx.before-1.2.3-beta.1-schema-2.db",
            "mdx.before-1.2.3-rc-1+build.5-schema-2.db",
        ] {
            assert!(is_upgrade_copy_name(name), "{name}");
        }
        for name in UNRELATED_NAMES {
            assert!(!is_upgrade_copy_name(name), "{name}");
        }
    }

    #[test]
    fn the_new_copy_is_kept_when_older_copies_are_dated_later() {
        let folder = tempfile::tempdir().unwrap();
        let connection = first_step_database(folder.path());
        let now = SystemTime::now();
        create_file_dated(&copy_path(folder.path(), "0.1.0", 1), now + DAY);
        create_file_dated(&copy_path(folder.path(), "0.2.0", 1), now + DAY * 2);

        copy_into(folder.path(), &connection, "1.0.0", 1);

        assert_eq!(
            names_with_copy_prefix(folder.path()),
            [
                "mdx.before-0.2.0-schema-1.db",
                "mdx.before-1.0.0-schema-1.db"
            ]
        );
    }

    #[test]
    fn each_upgrade_under_the_same_app_version_gets_its_own_copy() {
        let folder = tempfile::tempdir().unwrap();
        let connection = first_step_database(folder.path());
        fs::write(copy_path(folder.path(), "1.0.0", 1), b"earlier copy").unwrap();

        copy_into(folder.path(), &connection, "1.0.0", 2);

        assert_eq!(
            fs::read(copy_path(folder.path(), "1.0.0", 1)).unwrap(),
            b"earlier copy"
        );
        assert_eq!(workspace_count(&copy_path(folder.path(), "1.0.0", 2)), 1);
    }

    #[test]
    fn a_retried_upgrade_keeps_the_copy_made_first() {
        let folder = tempfile::tempdir().unwrap();
        let connection = first_step_database(folder.path());
        fs::write(copy_path(folder.path(), "1.0.0", 1), b"earlier copy").unwrap();

        copy_into(folder.path(), &connection, "1.0.0", 1);

        assert_eq!(
            fs::read(copy_path(folder.path(), "1.0.0", 1)).unwrap(),
            b"earlier copy"
        );
    }

    #[test]
    fn no_upgrade_runs_when_the_copy_cannot_be_made() {
        let folder = tempfile::tempdir().unwrap();
        first_step_database(folder.path()).close().unwrap();
        let blocked_copy = copy_path(folder.path(), APP_VERSION, 1);
        fs::create_dir(&blocked_copy).unwrap();

        let result = WorkspaceDatabase::new(folder.path()).load_registry();

        assert!(matches!(result, Err(DatabaseError::Storage(_))));
        let database = Connection::open(folder.path().join(DATABASE_FILE_NAME)).unwrap();
        assert_eq!(schema_version(&database).unwrap(), 1);
        assert!(blocked_copy.is_dir());
        assert!(!partial_path_for(&blocked_copy).exists());
    }

    #[test]
    fn the_upgrade_copies_are_removed_when_the_database_cannot_open() {
        let folder = tempfile::tempdir().unwrap();
        Connection::open(folder.path().join(DATABASE_FILE_NAME))
            .unwrap()
            .pragma_update(
                None,
                "user_version",
                i64::try_from(SCHEMA_STEPS.len() + 1).unwrap(),
            )
            .unwrap();
        create_copies_and_unrelated_files(folder.path());
        let database = WorkspaceDatabase::new(folder.path());
        assert!(matches!(
            database.load_registry(),
            Err(DatabaseError::NewerDatabase)
        ));

        database.remove_upgrade_copies().unwrap();

        assert_eq!(
            names_with_copy_prefix(folder.path()),
            unrelated_names_sorted()
        );
    }

    #[cfg(windows)]
    #[test]
    fn the_other_copies_are_removed_when_one_is_in_use() {
        use std::os::windows::fs::OpenOptionsExt;

        let folder = tempfile::tempdir().unwrap();
        create_copies_and_unrelated_files(folder.path());
        let copy_in_use = copy_path(folder.path(), "0.1.0", 1);
        let _held = File::options()
            .read(true)
            .share_mode(0)
            .open(&copy_in_use)
            .unwrap();

        let result = remove_all_copies(folder.path());

        assert!(matches!(result, Err(DatabaseError::Storage(_))));
        let mut expected = vec!["mdx.before-0.1.0-schema-1.db"];
        expected.extend(UNRELATED_NAMES);
        expected.sort_unstable();
        assert_eq!(names_with_copy_prefix(folder.path()), expected);
    }
}
