//! Notes moving into and out of a section. A note moved in counts only once its sealed file has
//! been read back and opened to the same bytes; a note moved out is removed only after its plain
//! copy is written, which the caller checks.

use std::fs;

use zeroize::Zeroizing;

use super::UnlockedSection;
use crate::protected_notes::encrypted_file::{
    ExpectedFile, FileKind, FileMetadata, NOTE_ID_BYTES, open_file,
};
use crate::protected_notes::hex_text::{bytes_of_hex, hex_of};
use crate::protected_notes::random::random_bytes;
use crate::protected_notes::{ProtectedError, is_same_in_constant_time};

/// A plain note to bring into the section: its exact bytes, the title it is listed by, the folder
/// inside the section, and when it is moved.
pub struct NoteMovedIn<'note> {
    pub title: &'note str,
    pub folder: &'note str,
    pub bytes: &'note [u8],
    pub now_ms: u64,
}

/// A note to take out of the section: its title and its exact bytes, wiped when dropped.
pub struct NoteTakenOut {
    pub title: String,
    pub bytes: Zeroizing<Vec<u8>>,
}

impl UnlockedSection {
    /// Seals a plain note's bytes as a new note, then reads the file back and opens it: only when
    /// it gives the same bytes and title does the note count, and its id is returned; otherwise the
    /// new note is removed again, so the plain note is never let go of on a copy that does not open.
    pub fn move_in(&mut self, note: &NoteMovedIn<'_>) -> Result<String, ProtectedError> {
        let note_id: [u8; NOTE_ID_BYTES] = random_bytes()?;
        let metadata = FileMetadata {
            kind: FileKind::Note,
            title: note.title.to_owned(),
            folder: note.folder.to_owned(),
            created_ms: note.now_ms,
            modified_ms: note.now_ms,
            content_length: 0,
            file_name: None,
            media_type: None,
        };
        self.write_note(&self.header_of(note_id, 1), &metadata, note.bytes)?;
        let id = hex_of(&note_id);
        if self.is_sealed_as(&id, note) {
            return Ok(id);
        }
        let _ = self.remove(&id);
        Err(ProtectedError::Storage)
    }

    /// Whether the sealed file of a note opens to exactly these bytes and this title.
    fn is_sealed_as(&self, note_id: &str, note: &NoteMovedIn<'_>) -> bool {
        let (Ok(bytes), Ok(id)) = (
            fs::read(self.folder.note_path(note_id)),
            bytes_of_hex::<NOTE_ID_BYTES>(note_id),
        ) else {
            return false;
        };
        open_file(
            &bytes,
            &self.data_key,
            &self.vault.vault_id,
            &ExpectedFile::note(id),
        )
        .is_ok_and(|opened| {
            is_same_in_constant_time(&opened.content, note.bytes)
                && opened.metadata.title == note.title
        })
    }

    /// A note's title and exact bytes, to write as a plain note before the note is removed.
    pub fn take_out(&self, note_id: &str) -> Result<NoteTakenOut, ProtectedError> {
        let title = self.note_entry(note_id)?.title.clone();
        let opened = self.open(note_id)?;
        if opened.is_older_copy {
            return Err(ProtectedError::Tampered);
        }
        Ok(NoteTakenOut {
            title,
            bytes: opened.bytes,
        })
    }

    /// Removes a note from the section: from the manifest first, then its file, so a stop in
    /// between leaves the file to be listed again rather than a note listed without one. A
    /// re-encryption's record of it goes too, as its file going is no longer a loss.
    pub fn remove(&mut self, note_id: &str) -> Result<(), ProtectedError> {
        let id: [u8; NOTE_ID_BYTES] = self.entry(note_id)?.note_id;
        self.manifest.entries.retain(|entry| entry.note_id != id);
        if let Some(files) = &mut self.manifest.previous_key_files {
            files.retain(|file| file.note_id != id);
        }
        self.states.retain(|(listed, _)| listed != note_id);
        self.manifest.revision += 1;
        self.write_manifest_now()?;
        match fs::remove_file(self.folder.note_path(note_id)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err(ProtectedError::Storage),
        }
    }
}

#[cfg(test)]
mod tests;
