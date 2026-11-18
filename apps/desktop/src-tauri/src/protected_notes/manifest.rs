use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use super::ProtectedError;
use super::encrypted_file::{
    FileHeader, FileKind, FileMetadata, MANIFEST_NOTE_ID, NOTE_ID_BYTES, open_file, seal_file,
};
use super::hex_text::{bytes_of_hex, hex_of};
use super::key_slots::{DataKey, VAULT_ID_BYTES};

pub const MANIFEST_FILE_NAME: &str = "manifest.mdxp";
/// More notes than this in one section is not a manifest MDX wrote.
pub const MAX_MANIFEST_ENTRIES: usize = 100_000;

/// One note as the manifest lists it, so unlocking decrypts one file to show the whole tree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManifestEntry {
    pub note_id: [u8; NOTE_ID_BYTES],
    pub revision: u64,
    pub title: String,
    pub folder: String,
    pub kind: FileKind,
    pub modified_ms: u64,
}

/// The encrypted list of every note in the section, with the revision each was last saved at.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Manifest {
    pub revision: u64,
    pub entries: Vec<ManifestEntry>,
}

/// How a note file on disk compares with the manifest.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NoteState {
    Current,
    /// The file's revision is below the manifest's: an older copy replaced the note.
    OlderCopy,
    /// Saved after the manifest, by a crash between the two writes or a sync; the file wins.
    NewerThanManifest,
    /// A file the manifest does not list; it is read and added.
    Unlisted,
    /// Listed, but its file is gone.
    Missing,
}

impl Manifest {
    pub fn seal(
        &self,
        vault_id: &[u8; VAULT_ID_BYTES],
        data_key: &DataKey,
    ) -> Result<Vec<u8>, ProtectedError> {
        let saved = SavedManifest {
            notes: self.entries.iter().map(SavedEntry::of).collect(),
        };
        let content =
            Zeroizing::new(serde_json::to_vec(&saved).map_err(|_| ProtectedError::TooLarge)?);
        let header = FileHeader {
            vault_id: *vault_id,
            data_key_id: data_key.id,
            note_id: MANIFEST_NOTE_ID,
            revision: self.revision,
        };
        let metadata = FileMetadata {
            kind: FileKind::Manifest,
            title: String::new(),
            folder: String::new(),
            created_ms: 0,
            modified_ms: 0,
            content_length: 0,
            file_name: None,
            media_type: None,
        };
        seal_file(&header, &metadata, &content, data_key)
    }

    /// Opens the manifest; a note file put in its place is refused as damage.
    pub fn open(
        bytes: &[u8],
        data_key: &DataKey,
        vault_id: &[u8; VAULT_ID_BYTES],
    ) -> Result<Self, ProtectedError> {
        let opened = open_file(bytes, data_key, vault_id)?;
        if opened.header.note_id != MANIFEST_NOTE_ID || opened.metadata.kind != FileKind::Manifest {
            return Err(ProtectedError::Tampered);
        }
        let saved: SavedManifest =
            serde_json::from_slice(&opened.content).map_err(|_| ProtectedError::Tampered)?;
        if saved.notes.len() > MAX_MANIFEST_ENTRIES {
            return Err(ProtectedError::TooLarge);
        }
        Ok(Self {
            revision: opened.header.revision,
            entries: saved
                .notes
                .iter()
                .map(SavedEntry::to_entry)
                .collect::<Result<_, _>>()?,
        })
    }

    /// A manifest made again from the note files themselves, which are all authenticated, for when the
    /// manifest file is lost.
    pub fn rebuilt_from(notes: &[(FileHeader, FileMetadata)]) -> Self {
        let entries: Vec<ManifestEntry> = notes
            .iter()
            .filter(|(header, metadata)| {
                header.note_id != MANIFEST_NOTE_ID && metadata.kind != FileKind::Manifest
            })
            .map(|(header, metadata)| ManifestEntry {
                note_id: header.note_id,
                revision: header.revision,
                title: metadata.title.clone(),
                folder: metadata.folder.clone(),
                kind: metadata.kind,
                modified_ms: metadata.modified_ms,
            })
            .collect();
        Self {
            revision: 1,
            entries,
        }
    }

    /// Each listed note and each note file on disk, by note id, compared by revision.
    pub fn reconcile(
        &self,
        files_on_disk: &[FileHeader],
    ) -> BTreeMap<[u8; NOTE_ID_BYTES], NoteState> {
        let on_disk: BTreeMap<[u8; NOTE_ID_BYTES], u64> = files_on_disk
            .iter()
            .filter(|header| header.note_id != MANIFEST_NOTE_ID)
            .map(|header| (header.note_id, header.revision))
            .collect();
        let mut states: BTreeMap<[u8; NOTE_ID_BYTES], NoteState> = on_disk
            .keys()
            .map(|note_id| (*note_id, NoteState::Unlisted))
            .collect();
        for entry in &self.entries {
            let state = match on_disk.get(&entry.note_id) {
                None => NoteState::Missing,
                Some(revision) if *revision < entry.revision => NoteState::OlderCopy,
                Some(revision) if *revision > entry.revision => NoteState::NewerThanManifest,
                Some(_) => NoteState::Current,
            };
            states.insert(entry.note_id, state);
        }
        states
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SavedManifest {
    notes: Vec<SavedEntry>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SavedEntry {
    note_id: String,
    revision: u64,
    title: String,
    folder: String,
    kind: FileKind,
    modified_ms: u64,
}

impl SavedEntry {
    fn of(entry: &ManifestEntry) -> Self {
        Self {
            note_id: hex_of(&entry.note_id),
            revision: entry.revision,
            title: entry.title.clone(),
            folder: entry.folder.clone(),
            kind: entry.kind,
            modified_ms: entry.modified_ms,
        }
    }

    fn to_entry(&self) -> Result<ManifestEntry, ProtectedError> {
        Ok(ManifestEntry {
            note_id: bytes_of_hex(&self.note_id)?,
            revision: self.revision,
            title: self.title.clone(),
            folder: self.folder.clone(),
            kind: self.kind,
            modified_ms: self.modified_ms,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protected_notes::encrypted_file::tests::{VAULT, header as note_header, metadata};

    fn entry(note: u8, revision: u64) -> ManifestEntry {
        ManifestEntry {
            note_id: [note; NOTE_ID_BYTES],
            revision,
            title: format!("Note {note}"),
            folder: String::new(),
            kind: FileKind::Note,
            modified_ms: 5,
        }
    }

    fn on_disk(note: u8, revision: u64) -> FileHeader {
        FileHeader {
            vault_id: VAULT,
            data_key_id: 1,
            note_id: [note; NOTE_ID_BYTES],
            revision,
        }
    }

    #[test]
    fn the_manifest_round_trips_encrypted() {
        let key = DataKey::generate(1).unwrap();
        let manifest = Manifest {
            revision: 4,
            entries: vec![entry(1, 2), entry(2, 7)],
        };

        let sealed = manifest.seal(&VAULT, &key).unwrap();

        assert_eq!(Manifest::open(&sealed, &key, &VAULT).unwrap(), manifest);
        assert!(!sealed.windows(6).any(|window| window == b"Note 1"));
    }

    #[test]
    fn an_older_copy_replaced_this_note() {
        let manifest = Manifest {
            revision: 3,
            entries: vec![entry(1, 2)],
        };

        let states = manifest.reconcile(&[on_disk(1, 1)]);

        assert_eq!(states.get(&[1; NOTE_ID_BYTES]), Some(&NoteState::OlderCopy));
    }

    #[test]
    fn a_missing_note_is_listed_as_missing_and_an_unlisted_file_is_found() {
        let manifest = Manifest {
            revision: 3,
            entries: vec![entry(1, 2), entry(2, 2)],
        };

        let states = manifest.reconcile(&[on_disk(1, 2), on_disk(3, 1), on_disk(2, 5)]);

        assert_eq!(
            states.into_iter().collect::<Vec<_>>(),
            [
                ([1; NOTE_ID_BYTES], NoteState::Current),
                ([2; NOTE_ID_BYTES], NoteState::NewerThanManifest),
                ([3; NOTE_ID_BYTES], NoteState::Unlisted),
            ]
        );
        let gone = Manifest {
            revision: 1,
            entries: vec![entry(4, 1)],
        }
        .reconcile(&[]);
        assert_eq!(gone.get(&[4; NOTE_ID_BYTES]), Some(&NoteState::Missing));
    }

    #[test]
    fn the_manifest_is_rebuilt_from_the_note_files() {
        let key = DataKey::generate(1).unwrap();
        let notes = [
            (note_header(3, &key), metadata("Bank details")),
            (
                FileHeader {
                    note_id: MANIFEST_NOTE_ID,
                    ..note_header(9, &key)
                },
                metadata(""),
            ),
        ];

        let rebuilt = Manifest::rebuilt_from(&notes);

        assert_eq!(rebuilt.entries.len(), 1);
        assert_eq!(rebuilt.entries[0].title, "Bank details");
        assert_eq!(rebuilt.entries[0].revision, 3);
    }

    #[test]
    fn a_note_file_put_in_place_of_the_manifest_is_refused() {
        let key = DataKey::generate(1).unwrap();
        let note = seal_file(
            &note_header(1, &key),
            &metadata("Bank details"),
            b"text",
            &key,
        )
        .unwrap();

        assert_eq!(
            Manifest::open(&note, &key, &VAULT),
            Err(ProtectedError::Tampered)
        );
    }
}
