use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use zeroize::Zeroizing;

use super::encrypted_file::{
    ExpectedFile, FileHeader, FileKind, FileMetadata, NOTE_ID_BYTES, open_file, seal_file,
};
use super::hex_text::{bytes_of_hex, hex_of};
use super::key_derivation::KdfParameters;
use super::key_slots::{
    DataKey, SLOT_ID_BYTES, SlotKind, is_same_in_constant_time, is_slot_for_key,
    previous_key_wrapping_key, unwrap_data_key, wrap_data_key,
};
use super::manifest::{MANIFEST_FILE_NAME, Manifest, ManifestEntry, NoteState};
use super::random::{random_bytes, random_key};
use super::section_records::SectionRecord;
use super::vault_file::{
    MAX_VAULT_FILE_BYTES, SetUpRefusal, VAULT_FILE_NAME, Vault, set_up_refusal,
};
use super::{KEY_BYTES, ProtectedError};
use crate::documents::write_bytes_atomically;
use crate::secrets::{DeviceSecretStore, SecretName};

mod attachments;
mod key_changes;
mod note_moves;
mod section_backup;

pub use attachments::{ATTACHMENT_FOLDER, AddedAttachment, NewAttachment};
pub use key_changes::{Reencryption, ReencryptionFinish};
pub use note_moves::{NoteMovedIn, NoteTakenOut};

const NOTES_FOLDER: &str = "notes";
const STAGED_MANIFEST_FILE_NAME: &str = "manifest.mdxp.staged";
const NOTE_EXTENSION: &str = "mdxp";
/// A section holds at most this many note files; more is not a section MDX wrote.
const MAX_NOTE_FILES: usize = 100_000;

/// The folder of a protected section, which holds its vault file, manifest and note files.
#[derive(Debug, Clone)]
pub struct SectionFolder {
    folder: PathBuf,
}

/// A protected section opened with one of its keys. The data key is wiped when this is dropped, which
/// is what locking does.
pub struct UnlockedSection {
    folder: SectionFolder,
    vault: Vault,
    data_key: DataKey,
    /// The data key a re-encryption is replacing, while some files are still sealed with it.
    previous_key: Option<DataKey>,
    /// Files a re-encryption found damaged in this session, so it does not try them again.
    damaged_during_reencryption: HashSet<String>,
    /// Notes a re-encryption sealed again in this session, known to open with the current key.
    sealed_during_reencryption: HashSet<String>,
    manifest: Manifest,
    states: Vec<(String, NoteState)>,
    /// The password slot the typed password opened, when the section was unlocked with one.
    opened_with_password_slot: Option<[u8; SLOT_ID_BYTES]>,
}

/// The data key a file's header names: the current one, or the one a re-encryption is replacing.
fn key_named_by<'key>(
    bytes: &[u8],
    data_key: &'key DataKey,
    previous_key: Option<&'key DataKey>,
) -> Result<&'key DataKey, ProtectedError> {
    let header = FileHeader::parse(bytes)?;
    if header.data_key_id == data_key.id {
        return Ok(data_key);
    }
    previous_key
        .filter(|previous| previous.id == header.data_key_id)
        .ok_or(ProtectedError::WrongKey)
}

/// A file sealed with the previous key is one of the section's notes only when it is, byte for byte,
/// a file the re-encryption recorded when it started. Its id and revision are not secret, so whoever
/// knows that key could forge any other; the record is in the manifest, sealed with the new key.
fn is_recorded_previous_key_file(
    manifest: &Manifest,
    note_id: &[u8; NOTE_ID_BYTES],
    bytes: &[u8],
) -> bool {
    let Some(files) = &manifest.previous_key_files else {
        return false;
    };
    let hash: [u8; 32] = Sha256::digest(bytes).into();
    files
        .iter()
        .any(|file| file.note_id == *note_id && is_same_in_constant_time(&file.sha256, &hash))
}

/// The data key a re-encryption replaces, from the vault's previous-key slot; none when the vault has
/// no such slot or it does not open, in which case the re-encryption cannot go on or end.
fn previous_key_of(vault: &Vault, data_key: &DataKey) -> Option<DataKey> {
    let slot = vault
        .slots
        .iter()
        .find(|slot| slot.kind == SlotKind::PreviousKey)?;
    let wrapping_key = previous_key_wrapping_key(data_key).ok()?;
    unwrap_data_key(slot, &wrapping_key, &vault.vault_id)
        .ok()
        .filter(|previous| previous.id != data_key.id)
}

fn has_previous_key_slot(vault: &Vault) -> bool {
    vault
        .slots
        .iter()
        .any(|slot| slot.kind == SlotKind::PreviousKey)
}

/// A note as the section's tree shows it; the title is shown only while the section is unlocked.
#[derive(Clone, PartialEq, Eq)]
pub struct NoteSummary {
    pub note_id: String,
    pub title: String,
    pub folder: String,
    pub kind: FileKind,
    pub modified_ms: u64,
    pub state: NoteState,
}

impl std::fmt::Debug for NoteSummary {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("NoteSummary")
            .field("note_id", &self.note_id)
            .field("kind", &self.kind)
            .field("state", &self.state)
            .finish_non_exhaustive()
    }
}

/// A file's bytes, reading one past `limit` at most, so a huge file is never read whole; the
/// caller refuses what is longer than the limit.
fn read_at_most(path: &Path, limit: usize) -> std::io::Result<Vec<u8>> {
    use std::io::Read;
    let mut bytes = Vec::new();
    fs::File::open(path)?
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// The note id a file's name gives, such as `<32 hex>.mdxp`; `None` for any other name.
fn note_id_of_file_name(name: &str) -> Option<[u8; NOTE_ID_BYTES]> {
    let stem = name.strip_suffix(&format!(".{NOTE_EXTENSION}"))?;
    bytes_of_hex(stem).ok()
}

/// A protected note's exact bytes, and whether an older copy replaced the file the manifest names.
pub struct OpenedNote {
    pub bytes: Zeroizing<Vec<u8>>,
    pub revision: u64,
    pub is_older_copy: bool,
}

impl SectionFolder {
    pub fn new(folder: PathBuf) -> Self {
        Self { folder }
    }

    fn vault_path(&self) -> PathBuf {
        self.folder.join(VAULT_FILE_NAME)
    }

    fn manifest_path(&self) -> PathBuf {
        self.folder.join(MANIFEST_FILE_NAME)
    }

    /// Where a re-encryption writes the manifest sealed with the new key before it changes the
    /// vault, so the vault never names a key no manifest is sealed with.
    fn staged_manifest_path(&self) -> PathBuf {
        self.folder.join(STAGED_MANIFEST_FILE_NAME)
    }

    fn notes_folder(&self) -> PathBuf {
        self.folder.join(NOTES_FOLDER)
    }

    fn note_path(&self, note_id: &str) -> PathBuf {
        self.notes_folder()
            .join(format!("{note_id}.{NOTE_EXTENSION}"))
    }

    pub fn is_set_up(&self) -> bool {
        self.vault_path().is_file()
    }

    pub fn read_vault(&self) -> Result<Vault, ProtectedError> {
        match read_at_most(&self.vault_path(), MAX_VAULT_FILE_BYTES) {
            Ok(bytes) => Vault::from_json(&bytes),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Err(if self.note_file_names()?.is_empty() {
                    ProtectedError::NotSetUp
                } else {
                    ProtectedError::VaultFileMissing
                })
            }
            Err(_) => Err(ProtectedError::Storage),
        }
    }

    /// Sets up a section here with a password and these settings; returns it unlocked and the recovery
    /// key to show once. Refused where a vault, or protected files without one, are already there.
    pub fn set_up(
        &self,
        password: &str,
        parameters: KdfParameters,
    ) -> Result<(UnlockedSection, Zeroizing<[u8; KEY_BYTES]>), ProtectedError> {
        let mut names = self.note_file_names()?;
        if self.vault_path().exists() {
            names.push(VAULT_FILE_NAME.to_owned());
        }
        if self.manifest_path().exists() {
            names.push(MANIFEST_FILE_NAME.to_owned());
        }
        match set_up_refusal(names.iter().map(String::as_str)) {
            Some(SetUpRefusal::AlreadySetUp) => return Err(ProtectedError::AlreadySetUp),
            Some(SetUpRefusal::VaultFileMissing) => return Err(ProtectedError::VaultFileMissing),
            None => {}
        }
        let created = Vault::create(password, parameters)?;
        fs::create_dir_all(self.notes_folder())?;
        let manifest = Manifest {
            revision: 1,
            entries: Vec::new(),
            previous_key_files: None,
        };
        write_bytes_atomically(
            &self.manifest_path(),
            &manifest.seal(&created.vault.vault_id, &created.data_key)?,
        )
        .map_err(|_| ProtectedError::Storage)?;
        write_bytes_atomically(&self.vault_path(), &created.vault.to_json()?)
            .map_err(|_| ProtectedError::Storage)?;
        let section = UnlockedSection {
            folder: self.clone(),
            vault: created.vault,
            data_key: created.data_key,
            previous_key: None,
            damaged_during_reencryption: HashSet::new(),
            sealed_during_reencryption: HashSet::new(),
            manifest,
            states: Vec::new(),
            opened_with_password_slot: None,
        };
        Ok((section, created.recovery_key))
    }

    fn note_file_names(&self) -> Result<Vec<String>, ProtectedError> {
        let entries = match fs::read_dir(self.notes_folder()) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(_) => return Err(ProtectedError::Storage),
        };
        let names: Vec<String> = entries
            .filter_map(Result::ok)
            .filter_map(|entry| entry.file_name().into_string().ok())
            .filter(|name| name.to_ascii_lowercase().ends_with(".mdxp"))
            .take(MAX_NOTE_FILES + 1)
            .collect();
        if names.len() > MAX_NOTE_FILES {
            return Err(ProtectedError::TooLarge);
        }
        Ok(names)
    }
}

impl UnlockedSection {
    pub fn unlock_with_password(
        folder: &SectionFolder,
        password: &str,
    ) -> Result<Self, ProtectedError> {
        let vault = folder.read_vault()?;
        let (data_key, slot_id) = vault.unlock_with_password_naming_slot(password)?;
        let mut section = Self::opened(folder, vault, data_key)?;
        section.opened_with_password_slot = Some(slot_id);
        Ok(section)
    }

    pub fn unlock_with_key(
        folder: &SectionFolder,
        kind: SlotKind,
        key: &[u8; KEY_BYTES],
    ) -> Result<Self, ProtectedError> {
        let vault = folder.read_vault()?;
        let data_key = vault.unlock_with_key(kind, key)?;
        Self::opened(folder, vault, data_key)
    }

    /// Opens the manifest, or makes it again from the note files when it is lost, and compares it with
    /// the files on disk: unlisted and newer files are read and listed, older copies and missing notes
    /// are marked.
    fn opened(
        folder: &SectionFolder,
        vault: Vault,
        data_key: DataKey,
    ) -> Result<Self, ProtectedError> {
        let previous_key = previous_key_of(&vault, &data_key);
        let read = Self::read_manifest(folder, &vault, &data_key)?;
        let keys = (&data_key, previous_key.as_ref());
        let mut notes = Self::read_note_files(folder, &vault, keys, read.as_ref())?;
        let manifest = match read {
            Some(manifest) => manifest,
            None => {
                notes.retain(|(header, _)| header.data_key_id == data_key.id);
                Manifest::rebuilt_from(&notes)
            }
        };
        let headers: Vec<FileHeader> = notes.iter().map(|(header, _)| *header).collect();
        let states = manifest.reconcile(&headers)?;
        let mut section = Self {
            folder: folder.clone(),
            vault,
            data_key,
            previous_key,
            damaged_during_reencryption: HashSet::new(),
            sealed_during_reencryption: HashSet::new(),
            manifest,
            states: Vec::new(),
            opened_with_password_slot: None,
        };
        for (note_id, state) in &states {
            if matches!(state, NoteState::Unlisted | NoteState::NewerThanManifest)
                && let Some((header, metadata)) =
                    notes.iter().find(|(header, _)| header.note_id == *note_id)
            {
                section.list_entry(header, metadata);
            }
        }
        section.states = states
            .into_iter()
            .map(|(note_id, state)| (hex_of(&note_id), state))
            .collect();
        Ok(section)
    }

    /// The manifest, when it is there and sealed with the current key. During a re-encryption a
    /// manifest sealed with any other key is refused, and the manifest staged before the vault
    /// changed takes its place; with neither, the section shows a manifest made again from the files
    /// sealed with the current key, which cannot end the re-encryption.
    fn read_manifest(
        folder: &SectionFolder,
        vault: &Vault,
        data_key: &DataKey,
    ) -> Result<Option<Manifest>, ProtectedError> {
        match fs::read(folder.manifest_path()) {
            Ok(bytes) => {
                if FileHeader::parse(&bytes)?.data_key_id == data_key.id {
                    return Manifest::open(&bytes, data_key, &vault.vault_id).map(Some);
                }
                if !has_previous_key_slot(vault) {
                    return Err(ProtectedError::WrongKey);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(ProtectedError::Storage),
        }
        if !has_previous_key_slot(vault) {
            return Ok(None);
        }
        Self::promoted_staged_manifest(folder, vault, data_key)
    }

    /// The manifest a re-encryption staged with the new key, put in place of the manifest.
    fn promoted_staged_manifest(
        folder: &SectionFolder,
        vault: &Vault,
        data_key: &DataKey,
    ) -> Result<Option<Manifest>, ProtectedError> {
        let bytes = match fs::read(folder.staged_manifest_path()) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(ProtectedError::Storage),
        };
        let Ok(manifest) = Manifest::open(&bytes, data_key, &vault.vault_id) else {
            return Ok(None);
        };
        let _ = fs::rename(folder.staged_manifest_path(), folder.manifest_path());
        Ok(Some(manifest))
    }

    /// The header and metadata of every note file that opens with the data key its header names; a
    /// damaged file is left out here and refused when it is opened. A file sealed with the previous
    /// key is read only when the manifest recorded it at the start of the re-encryption.
    fn read_note_files(
        folder: &SectionFolder,
        vault: &Vault,
        (data_key, previous_key): (&DataKey, Option<&DataKey>),
        manifest: Option<&Manifest>,
    ) -> Result<Vec<(FileHeader, FileMetadata)>, ProtectedError> {
        Ok(folder
            .note_file_names()?
            .iter()
            .filter_map(|name| {
                let note_id = note_id_of_file_name(name)?;
                let bytes = fs::read(folder.notes_folder().join(name)).ok()?;
                let key = key_named_by(&bytes, data_key, previous_key).ok()?;
                let is_accepted = key.id == data_key.id
                    || manifest.is_some_and(|listed| {
                        is_recorded_previous_key_file(listed, &note_id, &bytes)
                    });
                if !is_accepted {
                    return None;
                }
                open_file(&bytes, key, &vault.vault_id, &ExpectedFile::note(note_id)).ok()
            })
            .map(|opened| (opened.header, opened.metadata))
            .collect())
    }

    /// What this PC sees of the section now, to compare with what it saw before.
    pub fn record(&self) -> Result<SectionRecord, ProtectedError> {
        SectionRecord::of(&self.vault, self.manifest.revision)
    }

    pub fn vault_id(&self) -> [u8; 16] {
        self.vault.vault_id
    }

    pub fn notes(&self) -> Vec<NoteSummary> {
        self.manifest
            .entries
            .iter()
            .map(|entry| {
                let note_id = hex_of(&entry.note_id);
                let state = self
                    .states
                    .iter()
                    .find(|(id, _)| *id == note_id)
                    .map_or(NoteState::Current, |(_, state)| *state);
                NoteSummary {
                    note_id,
                    title: entry.title.clone(),
                    folder: entry.folder.clone(),
                    kind: entry.kind,
                    modified_ms: entry.modified_ms,
                    state,
                }
            })
            .collect()
    }

    /// A new empty note; returns its id.
    pub fn create(
        &mut self,
        title: &str,
        folder: &str,
        now_ms: u64,
    ) -> Result<String, ProtectedError> {
        let note_id: [u8; NOTE_ID_BYTES] = random_bytes()?;
        let metadata = FileMetadata {
            kind: FileKind::Note,
            title: title.to_owned(),
            folder: folder.to_owned(),
            created_ms: now_ms,
            modified_ms: now_ms,
            content_length: 0,
            file_name: None,
            media_type: None,
        };
        self.write_note(&self.header_of(note_id, 1), &metadata, b"")?;
        Ok(hex_of(&note_id))
    }

    /// A note's exact bytes; an attachment's id is refused, as its bytes are a picture.
    pub fn open(&self, note_id: &str) -> Result<OpenedNote, ProtectedError> {
        self.open_entry(note_id, self.note_entry(note_id)?)
    }

    fn open_entry(
        &self,
        note_id: &str,
        entry: &ManifestEntry,
    ) -> Result<OpenedNote, ProtectedError> {
        let bytes =
            fs::read(self.folder.note_path(note_id)).map_err(|error| match error.kind() {
                std::io::ErrorKind::NotFound => ProtectedError::NoteNotFound,
                _ => ProtectedError::Storage,
            })?;
        let expected = ExpectedFile::note_of_kind(entry.note_id, entry.kind);
        let opened = open_file(
            &bytes,
            self.key_for(&bytes)?,
            &self.vault.vault_id,
            &expected,
        )?;
        if !self.is_accepted(&opened.header, &bytes) {
            return Err(ProtectedError::Tampered);
        }
        Ok(OpenedNote {
            is_older_copy: opened.header.revision < entry.revision,
            revision: opened.header.revision,
            bytes: opened.content,
        })
    }

    /// Saves a note's exact bytes, encrypted, then the manifest; returns the note's new revision.
    pub fn save(
        &mut self,
        note_id: &str,
        bytes: &[u8],
        now_ms: u64,
    ) -> Result<u64, ProtectedError> {
        let entry = self.note_entry(note_id)?.clone();
        let revision = entry.revision + 1;
        let metadata = FileMetadata {
            kind: entry.kind,
            title: entry.title.clone(),
            folder: entry.folder.clone(),
            created_ms: self.created_ms_of(note_id).unwrap_or(now_ms),
            modified_ms: now_ms,
            content_length: 0,
            file_name: None,
            media_type: None,
        };
        self.write_note(&self.header_of(entry.note_id, revision), &metadata, bytes)?;
        Ok(revision)
    }

    /// The header of a note at a revision of this section.
    fn header_of(&self, note_id: [u8; NOTE_ID_BYTES], revision: u64) -> FileHeader {
        FileHeader {
            vault_id: self.vault.vault_id,
            data_key_id: self.data_key.id,
            note_id,
            revision,
        }
    }

    fn write_note(
        &mut self,
        header: &FileHeader,
        metadata: &FileMetadata,
        bytes: &[u8],
    ) -> Result<(), ProtectedError> {
        let note_id = header.note_id;
        let sealed = seal_file(header, metadata, bytes, &self.data_key)?;
        fs::create_dir_all(self.folder.notes_folder())?;
        write_bytes_atomically(&self.folder.note_path(&hex_of(&note_id)), &sealed)
            .map_err(|_| ProtectedError::Storage)?;
        self.list_entry(header, metadata);
        let note_key = hex_of(&note_id);
        self.states.retain(|(id, _)| *id != note_key);
        self.manifest.revision += 1;
        write_bytes_atomically(
            &self.folder.manifest_path(),
            &self.manifest.seal(&self.vault.vault_id, &self.data_key)?,
        )
        .map_err(|_| ProtectedError::Storage)
    }

    /// When the note was made, from its own file; the manifest keeps only its last change.
    fn created_ms_of(&self, note_id: &str) -> Option<u64> {
        let bytes = fs::read(self.folder.note_path(note_id)).ok()?;
        let expected = ExpectedFile::note(bytes_of_hex(note_id).ok()?);
        let key = self.key_for(&bytes).ok()?;
        let opened = open_file(&bytes, key, &self.vault.vault_id, &expected).ok()?;
        if !self.is_accepted(&opened.header, &bytes) {
            return None;
        }
        Some(opened.metadata.created_ms)
    }

    /// Whether an opened file is one of the section's notes: sealed with the current key, or a file
    /// sealed with the previous key that the re-encryption recorded when it started.
    fn is_accepted(&self, header: &FileHeader, bytes: &[u8]) -> bool {
        header.data_key_id == self.data_key.id
            || is_recorded_previous_key_file(&self.manifest, &header.note_id, bytes)
    }

    /// Writes the manifest as it is now, sealed with the current key.
    fn write_manifest_now(&self) -> Result<(), ProtectedError> {
        write_bytes_atomically(
            &self.folder.manifest_path(),
            &self.manifest.seal(&self.vault.vault_id, &self.data_key)?,
        )
        .map_err(|_| ProtectedError::Storage)
    }

    /// The key a file of this section is sealed with, by its header.
    fn key_for(&self, bytes: &[u8]) -> Result<&DataKey, ProtectedError> {
        key_named_by(bytes, &self.data_key, self.previous_key.as_ref())
    }

    fn list_entry(&mut self, header: &FileHeader, metadata: &FileMetadata) {
        let entry = ManifestEntry {
            note_id: header.note_id,
            revision: header.revision,
            title: metadata.title.clone(),
            folder: metadata.folder.clone(),
            kind: metadata.kind,
            modified_ms: metadata.modified_ms,
        };
        match self
            .manifest
            .entries
            .iter_mut()
            .find(|listed| listed.note_id == header.note_id)
        {
            Some(listed) => *listed = entry,
            None => self.manifest.entries.push(entry),
        }
    }

    /// A listed note that is not an attachment.
    fn note_entry(&self, note_id: &str) -> Result<&ManifestEntry, ProtectedError> {
        let entry = self.entry(note_id)?;
        if entry.kind == FileKind::Attachment {
            return Err(ProtectedError::NoteNotFound);
        }
        Ok(entry)
    }

    fn entry(&self, note_id: &str) -> Result<&ManifestEntry, ProtectedError> {
        let note_id: [u8; NOTE_ID_BYTES] =
            bytes_of_hex(note_id).map_err(|_| ProtectedError::NoteNotFound)?;
        self.manifest
            .entries
            .iter()
            .find(|entry| entry.note_id == note_id)
            .ok_or(ProtectedError::NoteNotFound)
    }

    /// Remembers the section on this PC: a new device key in the store, and a device slot for it. A
    /// key this PC remembered before is replaced with its slot; other PCs' slots stay.
    pub fn remember_on_this_pc(
        &mut self,
        store: &dyn DeviceSecretStore,
    ) -> Result<(), ProtectedError> {
        let earlier_key = stored_device_key(store, &self.vault.vault_id);
        let device_key = random_key()?;
        let slot = wrap_data_key(
            &self.data_key,
            &device_key,
            &self.vault.vault_id,
            SlotKind::Device,
        )?;
        let name = SecretName::for_vault(&self.vault.vault_id);
        store
            .save(&name, device_key.as_slice())
            .map_err(|_| ProtectedError::SecretStoreUnavailable)?;
        let mut vault = self.vault.clone();
        vault
            .slots
            .retain(|kept| !is_device_slot_of(kept, earlier_key.as_deref()));
        vault.slots.push(slot);
        if let Err(error) = self.write_vault(vault) {
            let _ = store.delete(&name);
            return Err(error);
        }
        Ok(())
    }

    /// Forgets this PC: its device slot goes from the vault and its device key from the store; other
    /// PCs stay remembered.
    pub fn forget_this_pc(&mut self, store: &dyn DeviceSecretStore) -> Result<(), ProtectedError> {
        let this_pc_key = stored_device_key(store, &self.vault.vault_id);
        let mut vault = self.vault.clone();
        vault
            .slots
            .retain(|kept| !is_device_slot_of(kept, this_pc_key.as_deref()));
        self.write_vault(vault)?;
        store
            .delete(&SecretName::for_vault(&self.vault.vault_id))
            .map_err(|_| ProtectedError::SecretStoreUnavailable)
    }

    /// The id of the device slot made for this device key, if the vault has one.
    pub fn device_slot_id_for(&self, device_key: &[u8; KEY_BYTES]) -> Option<[u8; 16]> {
        self.vault
            .slots
            .iter()
            .find(|slot| is_device_slot_of(slot, Some(device_key)))
            .map(|slot| slot.slot_id)
    }

    fn write_vault(&mut self, vault: Vault) -> Result<(), ProtectedError> {
        write_bytes_atomically(&self.folder.vault_path(), &vault.to_json()?)
            .map_err(|_| ProtectedError::Storage)?;
        self.vault = vault;
        Ok(())
    }
}

/// The device key this PC keeps for a vault; none when it keeps none or the store cannot be read.
pub fn stored_device_key(
    store: &dyn DeviceSecretStore,
    vault_id: &[u8; 16],
) -> Option<Zeroizing<[u8; KEY_BYTES]>> {
    let secret = store.load(&SecretName::for_vault(vault_id)).ok()??;
    let key: [u8; KEY_BYTES] = secret.as_slice().try_into().ok()?;
    Some(Zeroizing::new(key))
}

/// Whether a slot is the device slot made for this key.
fn is_device_slot_of(slot: &super::KeySlot, device_key: Option<&[u8; KEY_BYTES]>) -> bool {
    slot.kind == SlotKind::Device && device_key.is_some_and(|key| is_slot_for_key(slot, key))
}

/// Opens a section with this PC's remembered key.
pub fn unlock_on_this_pc(
    folder: &SectionFolder,
    store: &dyn DeviceSecretStore,
) -> Result<UnlockedSection, ProtectedError> {
    let vault = folder.read_vault()?;
    let secret = store
        .load(&SecretName::for_vault(&vault.vault_id))
        .map_err(|_| ProtectedError::SecretStoreUnavailable)?
        .ok_or(ProtectedError::NotRemembered)?;
    let key: Zeroizing<[u8; KEY_BYTES]> = Zeroizing::new(
        secret
            .as_slice()
            .try_into()
            .map_err(|_| ProtectedError::NotRemembered)?,
    );
    let data_key = vault.unlock_with_key(SlotKind::Device, &key)?;
    UnlockedSection::opened(folder, vault, data_key)
}

/// Whether the folder's vault has a re-encryption that is not finished, without any key.
pub fn has_unfinished_reencryption(folder: &SectionFolder) -> bool {
    folder.read_vault().is_ok_and(|vault| {
        vault
            .slots
            .iter()
            .any(|slot| slot.kind == SlotKind::PreviousKey)
    })
}

/// Whether the folder's vault still has the device slot this PC noted it remembers the section
/// with; no secret is read.
pub fn has_this_pc_device_slot(
    folder: &SectionFolder,
    noted_slot: impl FnOnce(&[u8; 16]) -> Option<String>,
) -> bool {
    folder.read_vault().is_ok_and(|vault| {
        noted_slot(&vault.vault_id).is_some_and(|noted| {
            vault
                .slots
                .iter()
                .any(|slot| slot.kind == SlotKind::Device && hex_of(&slot.slot_id) == noted)
        })
    })
}

impl AsRef<Path> for SectionFolder {
    fn as_ref(&self) -> &Path {
        &self.folder
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::secrets::InMemoryDeviceSecrets;

    const PASSWORD: &str = "correct horse battery";
    const QUICK: KdfParameters = KdfParameters::FLOOR;

    fn new_section() -> (tempfile::TempDir, SectionFolder) {
        let root = tempfile::tempdir().unwrap();
        let folder = SectionFolder::new(root.path().join("protected"));
        (root, folder)
    }

    #[test]
    fn a_saved_note_reopens_after_unlocking_with_the_password() {
        let (_root, folder) = new_section();
        let (mut section, _recovery) = folder.set_up(PASSWORD, QUICK).unwrap();
        let note = section.create("Bank details", "Finance", 1).unwrap();
        section.save(&note, b"\xEF\xBB\xBFPIN 4821\r\n", 2).unwrap();
        drop(section);

        let reopened = UnlockedSection::unlock_with_password(&folder, PASSWORD).unwrap();

        assert_eq!(
            reopened.open(&note).unwrap().bytes.as_slice(),
            b"\xEF\xBB\xBFPIN 4821\r\n"
        );
        assert_eq!(reopened.notes()[0].title, "Bank details");
        assert!(matches!(
            UnlockedSection::unlock_with_password(&folder, "wrong password"),
            Err(ProtectedError::WrongKey)
        ));
    }

    #[test]
    fn nothing_written_holds_a_title_or_text() {
        let (root, folder) = new_section();
        let (mut section, _recovery) = folder.set_up(PASSWORD, QUICK).unwrap();
        let note = section.create("Bank details", "Finance", 1).unwrap();
        section.save(&note, b"PIN 4821", 2).unwrap();

        for entry in walk(root.path()) {
            let bytes = fs::read(&entry).unwrap();
            for secret in [
                &b"Bank details"[..],
                b"4821",
                b"Finance",
                PASSWORD.as_bytes(),
            ] {
                assert!(
                    !bytes.windows(secret.len()).any(|window| window == secret),
                    "{entry:?}"
                );
            }
        }
    }

    fn walk(folder: &Path) -> Vec<PathBuf> {
        fs::read_dir(folder)
            .unwrap()
            .filter_map(Result::ok)
            .flat_map(|entry| {
                let path = entry.path();
                if path.is_dir() {
                    walk(&path)
                } else {
                    vec![path]
                }
            })
            .collect()
    }

    #[test]
    fn the_recovery_key_unlocks_and_a_new_password_replaces_the_old_one() {
        let (_root, folder) = new_section();
        let (_section, recovery) = folder.set_up(PASSWORD, QUICK).unwrap();

        let mut recovered =
            UnlockedSection::unlock_with_key(&folder, SlotKind::Recovery, &recovery).unwrap();
        recovered
            .add_password_slot("a brand new passphrase", QUICK)
            .unwrap();
        recovered.finish_password_change(None).unwrap();

        assert!(UnlockedSection::unlock_with_password(&folder, "a brand new passphrase").is_ok());
        assert!(matches!(
            UnlockedSection::unlock_with_password(&folder, PASSWORD),
            Err(ProtectedError::WrongKey)
        ));
    }

    fn has_any_device_slot(folder: &SectionFolder) -> bool {
        folder
            .read_vault()
            .unwrap()
            .slots
            .iter()
            .any(|slot| slot.kind == SlotKind::Device)
    }

    #[test]
    fn a_remembered_pc_unlocks_without_the_password_until_it_is_forgotten() {
        let (_root, folder) = new_section();
        let store = InMemoryDeviceSecrets::default();
        let (mut section, _recovery) = folder.set_up(PASSWORD, QUICK).unwrap();

        assert!(matches!(
            unlock_on_this_pc(&folder, &store),
            Err(ProtectedError::NotRemembered)
        ));
        section.remember_on_this_pc(&store).unwrap();
        assert!(has_any_device_slot(&folder));
        let mut remembered = unlock_on_this_pc(&folder, &store).unwrap();
        let stored = store
            .load(&SecretName::for_vault(&remembered.vault_id()))
            .unwrap()
            .unwrap();
        assert!(
            !stored
                .windows(PASSWORD.len())
                .any(|window| window == PASSWORD.as_bytes())
        );

        remembered.forget_this_pc(&store).unwrap();

        assert!(!has_any_device_slot(&folder));
        assert!(matches!(
            unlock_on_this_pc(&folder, &store),
            Err(ProtectedError::NotRemembered)
        ));
    }

    #[test]
    fn an_older_copy_and_a_missing_note_are_reported_and_an_unlisted_file_is_listed() {
        let (_root, folder) = new_section();
        let (mut section, _recovery) = folder.set_up(PASSWORD, QUICK).unwrap();
        let older = section.create("Older", "", 1).unwrap();
        let first_copy = fs::read(folder.note_path(&older)).unwrap();
        section.save(&older, b"second", 2).unwrap();
        let gone = section.create("Gone", "", 3).unwrap();
        let manifest_before_new_note = fs::read(folder.manifest_path()).unwrap();
        let unlisted = section.create("Unlisted", "", 4).unwrap();
        drop(section);
        fs::write(folder.note_path(&older), first_copy).unwrap();
        fs::remove_file(folder.note_path(&gone)).unwrap();
        fs::write(folder.manifest_path(), manifest_before_new_note).unwrap();

        let reopened = UnlockedSection::unlock_with_password(&folder, PASSWORD).unwrap();
        let state_of = |id: &str| {
            reopened
                .notes()
                .into_iter()
                .find(|note| note.note_id == id)
                .map(|note| note.state)
        };

        assert_eq!(state_of(&older), Some(NoteState::OlderCopy));
        assert!(reopened.open(&older).unwrap().is_older_copy);
        assert_eq!(state_of(&gone), Some(NoteState::Missing));
        assert_eq!(state_of(&unlisted), Some(NoteState::Unlisted));
    }

    #[test]
    fn set_up_is_refused_over_a_section_or_over_files_without_their_vault() {
        let (_root, folder) = new_section();
        let (mut section, _recovery) = folder.set_up(PASSWORD, QUICK).unwrap();
        section.create("Note", "", 1).unwrap();

        assert!(matches!(
            folder.set_up(PASSWORD, QUICK),
            Err(ProtectedError::AlreadySetUp)
        ));
        fs::remove_file(folder.vault_path()).unwrap();
        assert!(matches!(
            folder.set_up(PASSWORD, QUICK),
            Err(ProtectedError::VaultFileMissing)
        ));
        assert!(matches!(
            folder.read_vault(),
            Err(ProtectedError::VaultFileMissing)
        ));
    }

    #[test]
    fn a_lost_manifest_is_rebuilt_from_the_note_files() {
        let (_root, folder) = new_section();
        let (mut section, _recovery) = folder.set_up(PASSWORD, QUICK).unwrap();
        let note = section.create("Kept", "", 1).unwrap();
        drop(section);
        fs::remove_file(folder.manifest_path()).unwrap();

        let reopened = UnlockedSection::unlock_with_password(&folder, PASSWORD).unwrap();

        assert_eq!(
            reopened
                .notes()
                .into_iter()
                .map(|note| note.note_id)
                .collect::<Vec<_>>(),
            [note]
        );
    }
}
