use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

use super::ProtectedError;
use super::encrypted_file::{
    ExpectedFile, FileHeader, FileKind, FileMetadata, MANIFEST_NOTE_ID, NOTE_ID_BYTES,
    json_sized_once, open_file, seal_file,
};
use super::hex_text::{bytes_of_hex, hex_of};
use super::key_slots::{DataKey, VAULT_ID_BYTES};

pub const MANIFEST_FILE_NAME: &str = "manifest.mdxp";
/// More notes than this in one section is not a manifest MDX wrote.
pub const MAX_MANIFEST_ENTRIES: usize = 100_000;

/// One note as the manifest lists it, so unlocking decrypts one file to show the whole tree. Wiped
/// when dropped, and shown by `Debug` without its title or folder.
#[derive(Clone, PartialEq, Eq, Zeroize, ZeroizeOnDrop)]
pub struct ManifestEntry {
    pub note_id: [u8; NOTE_ID_BYTES],
    pub revision: u64,
    pub title: String,
    pub folder: String,
    #[zeroize(skip)]
    pub kind: FileKind,
    pub modified_ms: u64,
}

impl std::fmt::Debug for ManifestEntry {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ManifestEntry")
            .field("revision", &self.revision)
            .field("kind", &self.kind)
            .field("modified_ms", &self.modified_ms)
            .finish_non_exhaustive()
    }
}

/// A file a re-encryption has to seal again, as it was when the re-encryption started: the hash of
/// its sealed bytes.
#[derive(Debug, Clone, PartialEq, Eq, Zeroize)]
pub struct PreviousKeyFile {
    pub note_id: [u8; NOTE_ID_BYTES],
    pub sha256: [u8; 32],
}

/// The encrypted list of every note in the section, with the revision each was last saved at.
#[derive(Debug, Clone, PartialEq, Eq, Default, Zeroize, ZeroizeOnDrop)]
pub struct Manifest {
    pub revision: u64,
    pub entries: Vec<ManifestEntry>,
    /// While a re-encryption runs: the files sealed with the previous key when it started. The
    /// manifest is sealed with the new key, so only a file byte for byte as it was then is carried
    /// over; whoever knows the old key cannot add or change one. `None` outside a re-encryption,
    /// and in a manifest made again from the note files, which cannot end one.
    pub previous_key_files: Option<Vec<PreviousKeyFile>>,
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
        let saved = SavedManifestOut {
            notes: self.entries.iter().map(SavedEntryOut::of).collect(),
            previous_key_files: self.previous_key_files.as_ref().map(|files| {
                files
                    .iter()
                    .map(|file| SavedPreviousKeyFile {
                        note_id: hex_of(&file.note_id),
                        sha256: hex_of(&file.sha256),
                    })
                    .collect()
            }),
        };
        let content = json_sized_once(&saved)?;
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
        let opened = open_file(bytes, data_key, vault_id, &ExpectedFile::MANIFEST)?;
        let mut saved: SavedManifestIn =
            serde_json::from_slice(&opened.content).map_err(|_| ProtectedError::Tampered)?;
        let previous_count = saved.previous_key_files.as_ref().map_or(0, Vec::len);
        if saved.notes.len() > MAX_MANIFEST_ENTRIES || previous_count > MAX_MANIFEST_ENTRIES {
            return Err(ProtectedError::TooLarge);
        }
        let previous_key_files = match &saved.previous_key_files {
            Some(files) => Some(
                files
                    .iter()
                    .map(|file| {
                        Ok(PreviousKeyFile {
                            note_id: bytes_of_hex(&file.note_id)?,
                            sha256: bytes_of_hex(&file.sha256)?,
                        })
                    })
                    .collect::<Result<_, ProtectedError>>()?,
            ),
            None => None,
        };
        Ok(Self {
            revision: opened.header.revision,
            entries: saved
                .notes
                .iter_mut()
                .map(SavedEntryIn::take_entry)
                .collect::<Result<_, _>>()?,
            previous_key_files,
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
            previous_key_files: None,
        }
    }

    /// Each listed note and each note file on disk, by note id, compared by revision. Two files or two
    /// entries naming the same note can only come from tampering.
    pub fn reconcile(
        &self,
        files_on_disk: &[FileHeader],
    ) -> Result<BTreeMap<[u8; NOTE_ID_BYTES], NoteState>, ProtectedError> {
        let mut on_disk: BTreeMap<[u8; NOTE_ID_BYTES], u64> = BTreeMap::new();
        for header in files_on_disk
            .iter()
            .filter(|header| header.note_id != MANIFEST_NOTE_ID)
        {
            if on_disk.insert(header.note_id, header.revision).is_some() {
                return Err(ProtectedError::Tampered);
            }
        }
        let mut states: BTreeMap<[u8; NOTE_ID_BYTES], NoteState> = on_disk
            .keys()
            .map(|note_id| (*note_id, NoteState::Unlisted))
            .collect();
        let mut listed = std::collections::BTreeSet::new();
        for entry in &self.entries {
            if !listed.insert(entry.note_id) {
                return Err(ProtectedError::Tampered);
            }
            let state = match on_disk.get(&entry.note_id) {
                None => NoteState::Missing,
                Some(revision) if *revision < entry.revision => NoteState::OlderCopy,
                Some(revision) if *revision > entry.revision => NoteState::NewerThanManifest,
                Some(_) => NoteState::Current,
            };
            states.insert(entry.note_id, state);
        }
        Ok(states)
    }
}

/// The manifest as written: borrowed, so no copy of a title is made to write it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedManifestOut<'manifest> {
    notes: Vec<SavedEntryOut<'manifest>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    previous_key_files: Option<Vec<SavedPreviousKeyFile>>,
}

#[derive(Serialize, Deserialize, Zeroize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SavedPreviousKeyFile {
    note_id: String,
    sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedEntryOut<'manifest> {
    note_id: String,
    revision: u64,
    title: &'manifest str,
    folder: &'manifest str,
    kind: FileKind,
    modified_ms: u64,
}

impl<'manifest> SavedEntryOut<'manifest> {
    fn of(entry: &'manifest ManifestEntry) -> Self {
        Self {
            note_id: hex_of(&entry.note_id),
            revision: entry.revision,
            title: &entry.title,
            folder: &entry.folder,
            kind: entry.kind,
            modified_ms: entry.modified_ms,
        }
    }
}

/// The manifest as read; its texts are moved into the entries, not copied, and wiped when dropped.
#[derive(Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SavedManifestIn {
    notes: Vec<SavedEntryIn>,
    #[serde(default)]
    previous_key_files: Option<Vec<SavedPreviousKeyFile>>,
}

#[derive(Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SavedEntryIn {
    note_id: String,
    revision: u64,
    title: String,
    folder: String,
    #[zeroize(skip)]
    kind: FileKind,
    modified_ms: u64,
}

impl SavedEntryIn {
    fn take_entry(&mut self) -> Result<ManifestEntry, ProtectedError> {
        Ok(ManifestEntry {
            note_id: bytes_of_hex(&self.note_id)?,
            revision: self.revision,
            title: std::mem::take(&mut self.title),
            folder: std::mem::take(&mut self.folder),
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
            previous_key_files: None,
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
            previous_key_files: None,
        };

        let states = manifest.reconcile(&[on_disk(1, 1)]).unwrap();

        assert_eq!(states.get(&[1; NOTE_ID_BYTES]), Some(&NoteState::OlderCopy));
    }

    #[test]
    fn a_missing_note_is_listed_as_missing_and_an_unlisted_file_is_found() {
        let manifest = Manifest {
            revision: 3,
            entries: vec![entry(1, 2), entry(2, 2)],
            previous_key_files: None,
        };

        let states = manifest
            .reconcile(&[on_disk(1, 2), on_disk(3, 1), on_disk(2, 5)])
            .unwrap();

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
            previous_key_files: None,
        }
        .reconcile(&[])
        .unwrap();
        assert_eq!(gone.get(&[4; NOTE_ID_BYTES]), Some(&NoteState::Missing));
    }

    #[test]
    fn duplicate_note_ids_on_disk_or_in_the_manifest_are_tampering() {
        let manifest = Manifest {
            revision: 3,
            entries: vec![entry(1, 2)],
            previous_key_files: None,
        };
        let doubled = Manifest {
            revision: 3,
            entries: vec![entry(1, 2), entry(1, 2)],
            previous_key_files: None,
        };

        assert_eq!(
            manifest.reconcile(&[on_disk(1, 2), on_disk(1, 2)]),
            Err(ProtectedError::Tampered)
        );
        assert_eq!(
            doubled.reconcile(&[on_disk(1, 2)]),
            Err(ProtectedError::Tampered)
        );
    }

    #[test]
    fn debug_output_leaves_titles_and_folders_out() {
        let mut listed = entry(1, 2);
        listed.title = "Bank details".to_owned();
        listed.folder = "Finance".to_owned();

        let debug = format!(
            "{:?}",
            Manifest {
                revision: 1,
                entries: vec![listed],
                previous_key_files: None,
            }
        );

        assert!(
            !debug.contains("Bank details") && !debug.contains("Finance"),
            "{debug}"
        );
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
