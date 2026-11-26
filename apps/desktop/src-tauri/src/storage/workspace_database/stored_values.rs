use serde::{Deserialize, Serialize};

use super::DatabaseError;

/// The same cap as the earlier state file, applied to every JSON column.
pub const MAX_JSON_COLUMN_BYTES: usize = 5 * 1024 * 1024;

const MAX_ID_LENGTH: usize = 64;
const MAX_KIND_ID_LENGTH: usize = 40;
const MAX_APP_VALUE_KEY_LENGTH: usize = 64;
const MAX_NAME_CHARACTERS: usize = 100;
const MAX_ICON_LENGTH: usize = 40;
const MAX_COLOUR_LENGTH: usize = 20;
/// The longest path Windows accepts with long paths turned on.
const MAX_SOURCE_FILE_CHARACTERS: usize = 32_767;
/// Kind data is read with every registry load, so it stays small.
const MAX_KIND_DATA_BYTES: usize = 64 * 1024;

/// `default` or a generated id: lowercase letters, digits and hyphens.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceId(String);

impl TryFrom<String> for WorkspaceId {
    type Error = DatabaseError;

    fn try_from(id: String) -> Result<Self, Self::Error> {
        if is_lowercase_slug(&id, MAX_ID_LENGTH) {
            Ok(Self(id))
        } else {
            Err(DatabaseError::InvalidArgument("workspaceId"))
        }
    }
}

impl WorkspaceId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A window label such as `main`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowId(String);

impl TryFrom<String> for WindowId {
    type Error = DatabaseError;

    fn try_from(id: String) -> Result<Self, Self::Error> {
        if is_lowercase_slug(&id, MAX_ID_LENGTH) {
            Ok(Self(id))
        } else {
            Err(DatabaseError::InvalidArgument("windowId"))
        }
    }
}

impl WindowId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Any well-formed kind id is kept, even one this version does not know, so a workspace of an unknown kind survives.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct KindId(String);

impl TryFrom<String> for KindId {
    type Error = DatabaseError;

    fn try_from(id: String) -> Result<Self, Self::Error> {
        if is_camel_case_identifier(&id, MAX_KIND_ID_LENGTH) {
            Ok(Self(id))
        } else {
            Err(DatabaseError::InvalidArgument("kindId"))
        }
    }
}

impl KindId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppValueKey(String);

impl TryFrom<String> for AppValueKey {
    type Error = DatabaseError;

    fn try_from(key: String) -> Result<Self, Self::Error> {
        if is_camel_case_identifier(&key, MAX_APP_VALUE_KEY_LENGTH) {
            Ok(Self(key))
        } else {
            Err(DatabaseError::InvalidArgument("key"))
        }
    }
}

impl AppValueKey {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// The lists a workspace keeps; named like the fields of the earlier state file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ListName {
    RecentFiles,
    Favourites,
    FavouriteGroups,
    ExplorerFolders,
    SettingsOverrides,
}

impl ListName {
    pub const ALL: [Self; 5] = [
        Self::RecentFiles,
        Self::Favourites,
        Self::FavouriteGroups,
        Self::ExplorerFolders,
        Self::SettingsOverrides,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::RecentFiles => "recentFiles",
            Self::Favourites => "favourites",
            Self::FavouriteGroups => "favouriteGroups",
            Self::ExplorerFolders => "explorerFolders",
            Self::SettingsOverrides => "settingsOverrides",
        }
    }

    pub fn parse(name: &str) -> Result<Self, DatabaseError> {
        Self::ALL
            .into_iter()
            .find(|list_name| list_name.as_str() == name)
            .ok_or(DatabaseError::InvalidArgument("listName"))
    }
}

/// JSON text checked for size and syntax before it reaches the database.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JsonText(String);

impl TryFrom<String> for JsonText {
    type Error = DatabaseError;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        if text.len() > MAX_JSON_COLUMN_BYTES {
            return Err(DatabaseError::TooLarge);
        }
        if serde_json::from_str::<serde_json::Value>(&text).is_err() {
            return Err(DatabaseError::InvalidJson);
        }
        Ok(Self(text))
    }
}

impl JsonText {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A workspace's row in the registry; its lists and sessions are stored separately.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRecord {
    pub id: WorkspaceId,
    pub kind_id: KindId,
    /// None until the user renames it, so the catalog name is shown in the display language.
    pub name: Option<String>,
    pub icon: Option<String>,
    pub colour: Option<String>,
    pub position: i64,
    pub last_shown_at_ms: Option<i64>,
    /// The workspace file it was opened from, if any.
    pub source_file: Option<String>,
    /// What its kind keeps for it, as JSON text, such as a Notes workspace's location.
    pub kind_data: Option<String>,
}

/// A workspace as the webview sends it, validated into a `WorkspaceRecord`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRecordInput {
    pub id: String,
    pub kind_id: String,
    pub name: Option<String>,
    pub icon: Option<String>,
    pub colour: Option<String>,
    pub position: i64,
    pub last_shown_at_ms: Option<i64>,
    #[serde(default)]
    pub source_file: Option<String>,
    #[serde(default)]
    pub kind_data: Option<String>,
}

impl TryFrom<WorkspaceRecordInput> for WorkspaceRecord {
    type Error = DatabaseError;

    fn try_from(input: WorkspaceRecordInput) -> Result<Self, Self::Error> {
        Ok(Self {
            id: WorkspaceId::try_from(input.id)?,
            kind_id: KindId::try_from(input.kind_id)?,
            name: input.name.map(validated_name).transpose()?,
            icon: validated_label(input.icon, MAX_ICON_LENGTH, "icon")?,
            colour: validated_label(input.colour, MAX_COLOUR_LENGTH, "colour")?,
            position: input.position,
            last_shown_at_ms: input.last_shown_at_ms,
            source_file: input.source_file.map(validated_source_file).transpose()?,
            kind_data: input.kind_data.map(validated_kind_data).transpose()?,
        })
    }
}

fn validated_name(name: String) -> Result<String, DatabaseError> {
    let character_count = name.chars().count();
    let is_valid = name.trim() == name
        && (1..=MAX_NAME_CHARACTERS).contains(&character_count)
        && !name.chars().any(char::is_control);
    if is_valid {
        Ok(name)
    } else {
        Err(DatabaseError::InvalidArgument("name"))
    }
}

fn validated_source_file(path: String) -> Result<String, DatabaseError> {
    let is_valid = !path.trim().is_empty()
        && path.chars().count() <= MAX_SOURCE_FILE_CHARACTERS
        && !path.chars().any(char::is_control);
    if is_valid {
        Ok(path)
    } else {
        Err(DatabaseError::InvalidArgument("sourceFile"))
    }
}

fn validated_kind_data(json: String) -> Result<String, DatabaseError> {
    if json.len() > MAX_KIND_DATA_BYTES {
        return Err(DatabaseError::TooLarge);
    }
    if serde_json::from_str::<serde_json::Value>(&json).is_err() {
        return Err(DatabaseError::InvalidJson);
    }
    Ok(json)
}

fn validated_label(
    label: Option<String>,
    max_length: usize,
    argument: &'static str,
) -> Result<Option<String>, DatabaseError> {
    match label {
        Some(label) if !is_lowercase_slug(&label, max_length) && !is_colour_code(&label) => {
            Err(DatabaseError::InvalidArgument(argument))
        }
        label => Ok(label),
    }
}

fn is_lowercase_slug(text: &str, max_length: usize) -> bool {
    (1..=max_length).contains(&text.len())
        && text
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn is_camel_case_identifier(text: &str, max_length: usize) -> bool {
    (1..=max_length).contains(&text.len())
        && text.starts_with(|first: char| first.is_ascii_lowercase())
        && text.bytes().all(|byte| byte.is_ascii_alphanumeric())
}

fn is_colour_code(text: &str) -> bool {
    text.len() == "#rrggbb".len()
        && text.starts_with('#')
        && text.bytes().skip(1).all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace_input(name: &str) -> WorkspaceRecordInput {
        WorkspaceRecordInput {
            id: "default".to_owned(),
            kind_id: "markdownViewer".to_owned(),
            name: Some(name.to_owned()),
            icon: Some("book".to_owned()),
            colour: Some("#3366cc".to_owned()),
            position: 0,
            last_shown_at_ms: None,
            source_file: None,
            kind_data: None,
        }
    }

    #[test]
    fn accepts_default_and_generated_workspace_ids() {
        for id in ["default", "3f2c9a4e-8b1d-4c6e-9f00-1234567890ab"] {
            assert!(WorkspaceId::try_from(id.to_owned()).is_ok(), "{id}");
        }
    }

    #[test]
    fn refuses_workspace_ids_that_are_empty_too_long_or_not_slugs() {
        for id in ["", "Default", "a b", "../x", "x;drop", &"a".repeat(65)] {
            assert_eq!(
                WorkspaceId::try_from(id.to_owned()),
                Err(DatabaseError::InvalidArgument("workspaceId")),
                "{id}"
            );
        }
    }

    #[test]
    fn keeps_unknown_but_well_formed_kind_ids() {
        assert!(KindId::try_from("kindFromTheFuture".to_owned()).is_ok());
        assert!(KindId::try_from("Notes".to_owned()).is_err());
        assert!(KindId::try_from("notes-app".to_owned()).is_err());
    }

    #[test]
    fn allows_only_the_known_list_names() {
        assert_eq!(ListName::parse("favourites"), Ok(ListName::Favourites));
        for name in ["tabs", "Favourites", "", "recentFiles2"] {
            assert_eq!(
                ListName::parse(name),
                Err(DatabaseError::InvalidArgument("listName"))
            );
        }
    }

    #[test]
    fn refuses_oversized_or_invalid_json() {
        let oversized = format!("\"{}\"", "a".repeat(MAX_JSON_COLUMN_BYTES));

        assert_eq!(JsonText::try_from(oversized), Err(DatabaseError::TooLarge));
        assert_eq!(
            JsonText::try_from("{ broken".to_owned()),
            Err(DatabaseError::InvalidJson)
        );
        assert!(JsonText::try_from("[]".to_owned()).is_ok());
    }

    #[test]
    fn keeps_small_valid_kind_data_and_refuses_the_rest() {
        let with_kind_data = |kind_data: &str| WorkspaceRecordInput {
            kind_data: Some(kind_data.to_owned()),
            ..workspace_input("Journal")
        };

        assert!(WorkspaceRecord::try_from(with_kind_data(r#"{"locationId":"a"}"#)).is_ok());
        assert_eq!(
            WorkspaceRecord::try_from(with_kind_data("{ broken")),
            Err(DatabaseError::InvalidJson)
        );
        let oversized = format!("\"{}\"", "a".repeat(MAX_KIND_DATA_BYTES));
        assert_eq!(
            WorkspaceRecord::try_from(with_kind_data(&oversized)),
            Err(DatabaseError::TooLarge)
        );
    }

    #[test]
    fn validates_a_workspace_name_icon_and_colour() {
        assert!(WorkspaceRecord::try_from(workspace_input("Research")).is_ok());
        let unnamed = WorkspaceRecordInput {
            name: None,
            ..workspace_input("Research")
        };
        assert_eq!(WorkspaceRecord::try_from(unnamed).unwrap().name, None);
        for name in ["", " padded", "line\nbreak", &"n".repeat(101)] {
            assert_eq!(
                WorkspaceRecord::try_from(workspace_input(name)),
                Err(DatabaseError::InvalidArgument("name")),
                "{name:?}"
            );
        }
        let bad_colour = WorkspaceRecordInput {
            colour: Some("red; x".to_owned()),
            ..workspace_input("Research")
        };
        assert_eq!(
            WorkspaceRecord::try_from(bad_colour),
            Err(DatabaseError::InvalidArgument("colour"))
        );
    }
}
