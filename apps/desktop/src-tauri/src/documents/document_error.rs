use std::io;

use serde::Serialize;

use crate::platform;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum DocumentError {
    #[error("the document was not found")]
    NotFound,
    #[error("the document's location cannot be reached")]
    Unreachable,
    #[error("the document is too large to open")]
    TooLarge,
    #[error("the file is not a Markdown document")]
    NotMarkdown,
    #[error("access to the document was denied")]
    AccessDenied,
    #[error("the document could not be read")]
    Unreadable,
    #[error("the request was invalid")]
    InvalidRequest,
    #[error("another program changed the document since it was opened")]
    ChangedOnDisk,
    #[error("the document contains characters its encoding cannot store")]
    CannotEncode,
}

impl From<io::Error> for DocumentError {
    fn from(error: io::Error) -> Self {
        match error.kind() {
            io::ErrorKind::NotFound => Self::NotFound,
            io::ErrorKind::PermissionDenied => Self::AccessDenied,
            _ if is_network_failure(&error) => Self::Unreachable,
            _ => Self::Unreadable,
        }
    }
}

fn is_network_failure(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::NetworkUnreachable
            | io::ErrorKind::HostUnreachable
            | io::ErrorKind::NetworkDown
            | io::ErrorKind::TimedOut
    ) || error
        .raw_os_error()
        .is_some_and(platform::is_network_error_code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_missing_files_to_not_found() {
        let error = io::Error::from(io::ErrorKind::NotFound);

        assert_eq!(DocumentError::from(error), DocumentError::NotFound);
    }

    #[test]
    fn maps_permission_errors_to_access_denied() {
        let error = io::Error::from(io::ErrorKind::PermissionDenied);

        assert_eq!(DocumentError::from(error), DocumentError::AccessDenied);
    }

    #[test]
    fn maps_network_errors_to_unreachable() {
        let error = io::Error::from(io::ErrorKind::TimedOut);

        assert_eq!(DocumentError::from(error), DocumentError::Unreachable);
    }

    #[test]
    fn maps_other_errors_to_unreadable() {
        let error = io::Error::from(io::ErrorKind::InvalidData);

        assert_eq!(DocumentError::from(error), DocumentError::Unreadable);
    }

    #[test]
    fn serializes_as_a_code_the_frontend_understands() {
        let json = serde_json::to_string(&DocumentError::NotMarkdown).unwrap();

        assert_eq!(json, r#"{"code":"notMarkdown"}"#);
    }
}
