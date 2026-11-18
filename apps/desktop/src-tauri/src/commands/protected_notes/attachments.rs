//! Pictures pasted or dropped into protected notes, sealed in the section and served to the window
//! only as bytes while it is unlocked, never as a file or a cached response.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri::{State, WebviewWindow};
use zeroize::Zeroizing;

use super::{
    Answer, ProtectedCommandError, ProtectedNotes, SectionPlace, section_place, state_of,
    validated_note_id,
};
use crate::attachments::{DroppedImages, ImageKind, MAX_ATTACHMENT_BYTES, attachment_stem};
use crate::commands::attachments::{AttachmentSource, source_bytes};
use crate::commands::documents::run_blocking;
use crate::commands::notes_location::now_ms;
use crate::protected_notes::NewAttachment;

/// A picture for a protected note, by the name the window suggests; its kind comes from its bytes.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProtectedAttachmentRequest {
    suggested_name: String,
    source: AttachmentSource,
}

/// The attachment's id, and the file name it is listed by in the section's `Attachments` folder.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddedAttachmentAnswer {
    note_id: String,
    file_name: String,
}

impl ProtectedNotes {
    fn add_attachment(
        &self,
        place: &SectionPlace,
        request: ProtectedAttachmentRequest,
        dropped: &DroppedImages,
    ) -> Answer<AddedAttachmentAnswer> {
        let stem = attachment_stem(&request.suggested_name)?;
        let bytes = Zeroizing::new(source_bytes(request.source, dropped)?);
        if bytes.len() > MAX_ATTACHMENT_BYTES {
            return Err(ProtectedCommandError::TooLarge);
        }
        let kind = ImageKind::of(&bytes).ok_or(ProtectedCommandError::InvalidRequest)?;
        self.with_section(place, |section| {
            let added = section.add_attachment(&NewAttachment {
                stem: &stem,
                extension: kind.extension(),
                media_type: kind.media_type(),
                bytes: &bytes,
                now_ms: now_ms(),
            })?;
            Ok(AddedAttachmentAnswer {
                note_id: added.note_id,
                file_name: added.file_name,
            })
        })
    }

    fn open_attachment(&self, place: &SectionPlace, note_id: &str) -> Answer<Zeroizing<Vec<u8>>> {
        let note_id = validated_note_id(note_id)?;
        self.with_section(place, |section| Ok(section.open_attachment(note_id)?))
    }
}

/// Seals a pasted picture, or one dropped on the window, as an attachment of the section.
#[tauri::command]
pub async fn protected_add_attachment(
    location: String,
    request: ProtectedAttachmentRequest,
    window: WebviewWindow,
    dropped: State<'_, Arc<DroppedImages>>,
) -> Answer<AddedAttachmentAnswer> {
    let place = section_place(&window, &location)?;
    let state = state_of(&window);
    let dropped = Arc::clone(&dropped);
    run_blocking(move || state.add_attachment(&place, request, &dropped)).await?
}

/// An attachment's bytes, for the window to show from memory while the section is unlocked.
#[tauri::command]
pub async fn protected_open_attachment(
    location: String,
    note_id: String,
    window: WebviewWindow,
) -> Answer<Response> {
    let place = section_place(&window, &location)?;
    let state = state_of(&window);
    run_blocking(move || {
        state
            .open_attachment(&place, &note_id)
            .map(|mut bytes| Response::new(std::mem::take(&mut *bytes)))
    })
    .await?
}

#[cfg(test)]
mod tests;
