/// Why a protected section could not be read or written. The messages never hold a key, a title or
/// any text of a note, so they are safe to log and to send to the window as codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ProtectedError {
    #[error("the key derivation settings are below the minimum")]
    WeakKeyDerivation,
    #[error("the key derivation settings are above what MDX reads")]
    ExcessiveKeyDerivation,
    #[error("the key did not open the protected notes")]
    WrongKey,
    #[error("the file was damaged or changed outside MDX")]
    Tampered,
    #[error("the file was written by a newer version of MDX")]
    UnsupportedVersion,
    #[error("the file is larger than a protected file may be")]
    TooLarge,
    #[error("the random number generator of the system failed")]
    RandomUnavailable,
    #[error("the notes folder has no protected section")]
    NotSetUp,
    #[error("the notes folder has a protected section already")]
    AlreadySetUp,
    #[error("protected files are there without their vault file")]
    VaultFileMissing,
    #[error("the protected note was not found")]
    NoteNotFound,
    #[error("this PC does not remember the protected section")]
    NotRemembered,
    #[error("the secret store of this PC could not be used")]
    SecretStoreUnavailable,
    #[error("a protected file could not be read or written")]
    Storage,
}

impl From<std::io::Error> for ProtectedError {
    fn from(_: std::io::Error) -> Self {
        Self::Storage
    }
}
