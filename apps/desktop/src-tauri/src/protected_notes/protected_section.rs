use std::fs;
use std::path::{Path, PathBuf};

use zeroize::Zeroizing;

use super::encrypted_file::{
    FileHeader, FileKind, FileMetadata, NOTE_ID_BYTES, open_file, seal_file,
};
use super::hex_text::{bytes_of_hex, hex_of};
use super::key_derivation::{KdfParameters, derive_password_key};
use super::key_slots::{DataKey, SlotKind, wrap_data_key};
use super::manifest::{MANIFEST_FILE_NAME, Manifest, ManifestEntry, NoteState};
use super::random::{random_bytes, random_key};
use super::vault_file::{SetUpRefusal, VAULT_FILE_NAME, Vault, set_up_refusal};
use super::{KEY_BYTES, ProtectedError};
use crate::documents::write_bytes_atomically;
use crate::secrets::{DeviceSecretStore, SecretName};

const NOTES_FOLDER: &str = "notes";
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
    manifest: Manifest,
    states: Vec<(String, NoteState)>,
}

/// A note as the section's tree shows it; the title is shown only while the section is unlocked.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteSummary {
    pub note_id: String,
    pub title: String,
    pub folder: String,
    pub kind: FileKind,
    pub modified_ms: u64,
    pub state: NoteState,
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
        match fs::read(self.vault_path()) {
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
            manifest,
            states: Vec::new(),
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
        let data_key = vault.unlock_with_password(password)?;
        Self::opened(folder, vault, data_key)
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
        let notes = Self::read_note_files(folder, &vault, &data_key)?;
        let manifest = match fs::read(folder.manifest_path()) {
            Ok(bytes) => Manifest::open(&bytes, &data_key, &vault.vault_id)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Manifest::rebuilt_from(&notes)
            }
            Err(_) => return Err(ProtectedError::Storage),
        };
        let headers: Vec<FileHeader> = notes.iter().map(|(header, _)| *header).collect();
        let states = manifest.reconcile(&headers);
        let mut section = Self {
            folder: folder.clone(),
            vault,
            data_key,
            manifest,
            states: Vec::new(),
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

    /// The header and metadata of every note file that opens with the data key; a damaged file is
    /// left out here and refused when it is opened.
    fn read_note_files(
        folder: &SectionFolder,
        vault: &Vault,
        data_key: &DataKey,
    ) -> Result<Vec<(FileHeader, FileMetadata)>, ProtectedError> {
        Ok(folder
            .note_file_names()?
            .iter()
            .filter_map(|name| fs::read(folder.notes_folder().join(name)).ok())
            .filter_map(|bytes| open_file(&bytes, data_key, &vault.vault_id).ok())
            .map(|opened| (opened.header, opened.metadata))
            .collect())
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

    pub fn open(&self, note_id: &str) -> Result<OpenedNote, ProtectedError> {
        let entry = self.entry(note_id)?;
        let bytes =
            fs::read(self.folder.note_path(note_id)).map_err(|error| match error.kind() {
                std::io::ErrorKind::NotFound => ProtectedError::NoteNotFound,
                _ => ProtectedError::Storage,
            })?;
        let opened = open_file(&bytes, &self.data_key, &self.vault.vault_id)?;
        if opened.header.note_id != entry.note_id {
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
        let entry = self.entry(note_id)?.clone();
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
        let opened = open_file(&bytes, &self.data_key, &self.vault.vault_id).ok()?;
        Some(opened.metadata.created_ms)
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

    fn entry(&self, note_id: &str) -> Result<&ManifestEntry, ProtectedError> {
        let note_id: [u8; NOTE_ID_BYTES] =
            bytes_of_hex(note_id).map_err(|_| ProtectedError::NoteNotFound)?;
        self.manifest
            .entries
            .iter()
            .find(|entry| entry.note_id == note_id)
            .ok_or(ProtectedError::NoteNotFound)
    }

    /// Replaces every password slot with one for the new password, with a new salt; other slots stay.
    pub fn replace_password(
        &mut self,
        password: &str,
        parameters: KdfParameters,
    ) -> Result<(), ProtectedError> {
        let parameters = parameters.checked_for_writing()?;
        let salt = random_bytes()?;
        let key = derive_password_key(password, &salt, parameters)?;
        let slot = wrap_data_key(
            &self.data_key,
            &key,
            &self.vault.vault_id,
            SlotKind::Password { parameters, salt },
        )?;
        let mut vault = self.vault.clone();
        vault
            .slots
            .retain(|slot| !matches!(slot.kind, SlotKind::Password { .. }));
        vault.slots.push(slot);
        self.write_vault(vault)
    }

    /// Remembers the section on this PC: a new device key in the store, and a device slot for it. A
    /// key already remembered is replaced.
    pub fn remember_on_this_pc(
        &mut self,
        store: &dyn DeviceSecretStore,
    ) -> Result<(), ProtectedError> {
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
        vault.slots.retain(|slot| slot.kind != SlotKind::Device);
        vault.slots.push(slot);
        if let Err(error) = self.write_vault(vault) {
            let _ = store.delete(&name);
            return Err(error);
        }
        Ok(())
    }

    /// Forgets this PC: the device slot goes from the vault and the device key from the store.
    pub fn forget_this_pc(&mut self, store: &dyn DeviceSecretStore) -> Result<(), ProtectedError> {
        let mut vault = self.vault.clone();
        vault.slots.retain(|slot| slot.kind != SlotKind::Device);
        self.write_vault(vault)?;
        store
            .delete(&SecretName::for_vault(&self.vault.vault_id))
            .map_err(|_| ProtectedError::SecretStoreUnavailable)
    }

    pub fn is_remembered(&self) -> bool {
        self.vault
            .slots
            .iter()
            .any(|slot| slot.kind == SlotKind::Device)
    }

    fn write_vault(&mut self, vault: Vault) -> Result<(), ProtectedError> {
        write_bytes_atomically(&self.folder.vault_path(), &vault.to_json()?)
            .map_err(|_| ProtectedError::Storage)?;
        self.vault = vault;
        Ok(())
    }
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

/// Whether the folder holds a vault that this PC remembers, without reading any secret.
pub fn has_device_slot(folder: &SectionFolder) -> bool {
    folder
        .read_vault()
        .is_ok_and(|vault| vault.slots.iter().any(|slot| slot.kind == SlotKind::Device))
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
            .replace_password("a brand new passphrase", QUICK)
            .unwrap();

        assert!(UnlockedSection::unlock_with_password(&folder, "a brand new passphrase").is_ok());
        assert!(matches!(
            UnlockedSection::unlock_with_password(&folder, PASSWORD),
            Err(ProtectedError::WrongKey)
        ));
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
        assert!(has_device_slot(&folder));
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

        assert!(!has_device_slot(&folder));
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
