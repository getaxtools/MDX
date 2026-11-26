use std::ffi::OsString;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use super::move_journal::{JournalFile, nanoseconds_of};
use super::move_plan::PENDING_SUFFIX;

const HASH_BUFFER_BYTES: usize = 64 * 1024;

/// A copy the move made has the journal's size and the time its drive kept for it, which no other
/// program sets; the source is compared with its own time, as a drive may round the copy's.
pub fn is_own_copy(target: &Path, file: &JournalFile) -> bool {
    file.target_modified_ns
        .is_some_and(|kept| has_size_and_time(target, file.size, kept))
}

/// The source still has the size and time it had when it was copied.
pub fn is_unchanged_source(source: &Path, file: &JournalFile) -> bool {
    has_size_and_time(source, file.size, file.modified_ns)
}

fn has_size_and_time(path: &Path, size: u64, modified_ns: i64) -> bool {
    fs::symlink_metadata(path).is_ok_and(|metadata| {
        metadata.is_file()
            && metadata.len() == size
            && metadata
                .modified()
                .is_ok_and(|modified| nanoseconds_of(modified) == modified_ns)
    })
}

/// Both files can be read and hold exactly the same bytes.
pub fn has_same_bytes(first: &Path, second: &Path) -> bool {
    let size = |path: &Path| fs::metadata(path).map(|metadata| metadata.len()).ok();
    size(first).is_some_and(|first_size| size(second) == Some(first_size))
        && matches!((hash_of_file(first), hash_of_file(second)), (Ok(first), Ok(second)) if first == second)
}

pub fn hash_of_file(path: &Path) -> std::io::Result<String> {
    let mut reader = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0; HASH_BUFFER_BYTES];
    loop {
        let read = reader.read(&mut buffer)?;
        let Some(chunk) = buffer.get(..read).filter(|chunk| !chunk.is_empty()) else {
            return Ok(hex_of(hasher.finalize().as_slice()));
        };
        hasher.update(chunk);
    }
}

pub fn hex_of(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn pending_path_of(target: &Path) -> PathBuf {
    let mut name = target.file_name().map(OsString::from).unwrap_or_default();
    name.push(PENDING_SUFFIX);
    target.with_file_name(name)
}
