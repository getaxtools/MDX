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
}
