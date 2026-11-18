//! Pictures added to protected notes. Each is a sealed file of the section like a note, listed in
//! its `Attachments` folder under a file name of its own, so it never exists unencrypted on disk.

use zeroize::Zeroizing;

use super::UnlockedSection;
use crate::protected_notes::ProtectedError;
use crate::protected_notes::encrypted_file::{FileKind, FileMetadata, NOTE_ID_BYTES};
use crate::protected_notes::hex_text::hex_of;
use crate::protected_notes::random::random_bytes;

/// The section folder every attachment is listed in, as plain notes keep theirs in `Attachments`.
pub const ATTACHMENT_FOLDER: &str = "Attachments";
/// Gives up rather than trying names forever in a folder full of same-named pictures.
const MAX_NAME_SUFFIX: u32 = 10_000;

/// A picture to add: the name it is listed by, before its extension, the extension and media type
/// its bytes show, and the bytes.
pub struct NewAttachment<'picture> {
    pub stem: &'picture str,
    pub extension: &'picture str,
    pub media_type: &'picture str,
    pub bytes: &'picture [u8],
    pub now_ms: u64,
}

#[derive(Debug, PartialEq, Eq)]
pub struct AddedAttachment {
    pub note_id: String,
    pub file_name: String,
}

impl UnlockedSection {
    /// Seals a picture as an attachment under the first file name no other attachment has, such as
    /// `chart.png`, then `chart-2.png`.
    pub fn add_attachment(
        &mut self,
        attachment: &NewAttachment<'_>,
    ) -> Result<AddedAttachment, ProtectedError> {
        let file_name = self.free_attachment_name(attachment.stem, attachment.extension)?;
        let note_id: [u8; NOTE_ID_BYTES] = random_bytes()?;
        let metadata = FileMetadata {
            kind: FileKind::Attachment,
            title: file_name.clone(),
            folder: ATTACHMENT_FOLDER.to_owned(),
            created_ms: attachment.now_ms,
            modified_ms: attachment.now_ms,
            content_length: 0,
            file_name: Some(file_name.clone()),
            media_type: Some(attachment.media_type.to_owned()),
        };
        self.write_note(&self.header_of(note_id, 1), &metadata, attachment.bytes)?;
        Ok(AddedAttachment {
            note_id: hex_of(&note_id),
            file_name,
        })
    }

    /// An attachment's exact bytes; a note's id is refused, so a note is never served as a picture.
    pub fn open_attachment(&self, note_id: &str) -> Result<Zeroizing<Vec<u8>>, ProtectedError> {
        let entry = self.entry(note_id)?;
        if entry.kind != FileKind::Attachment {
            return Err(ProtectedError::NoteNotFound);
        }
        Ok(self.open_entry(note_id, entry)?.bytes)
    }

    fn free_attachment_name(&self, stem: &str, extension: &str) -> Result<String, ProtectedError> {
        (1..=MAX_NAME_SUFFIX)
            .map(|number| match number {
                1 => format!("{stem}.{extension}"),
                _ => format!("{stem}-{number}.{extension}"),
            })
            .find(|name| !self.has_attachment_named(name))
            .ok_or(ProtectedError::TooLarge)
    }

    /// Names are compared without case, as Windows does, so a moved-out picture keeps its name.
    fn has_attachment_named(&self, name: &str) -> bool {
        self.manifest.entries.iter().any(|entry| {
            entry.kind == FileKind::Attachment
                && entry.folder == ATTACHMENT_FOLDER
                && entry.title.to_lowercase() == name.to_lowercase()
        })
    }
}

#[cfg(test)]
mod tests;
