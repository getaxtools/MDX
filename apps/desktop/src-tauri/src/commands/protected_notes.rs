use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, WebviewWindow};
use zeroize::Zeroizing;

use crate::app_windows::OpenWindows;
use crate::commands::documents::run_blocking;
use crate::commands::notes::allowed_root;
use crate::commands::notes_location::now_ms;
use crate::commands::protected_lock_requests::save_everywhere_before_lock;
use crate::documents::{
    DocumentAccessList, DocumentError, LineEnding, canonical_key_of, decode_document_bytes,
    detect_line_ending, encode_document_text, encoding_for_label, locate_document,
};
use crate::notes_location::{NOTES_APP_FOLDER, read_marker};
use crate::protected_notes::{
    FileKind, FolderWarning, KdfParameters, NoteState, ProtectedError, SectionFolder,
    SectionRecords, SlotKind, UnlockedSection, calibrate, derive_password_key, has_device_slot,
    recovery_key_from_text, recovery_key_text, unlock_on_this_pc,
};
use crate::secrets::DeviceSecretStore;
use crate::storage::WorkspaceDatabase;

/// The protected section's folder inside the notes location's app folder, which plain-note features
/// never list, index or watch.
const SECTION_FOLDER_NAME: &str = "protected";
const NOTES_KIND_ID: &str = "notes";
const MIN_PASSWORD_CHARACTERS: usize = 10;
const MAX_PASSWORD_BYTES: usize = 1_024;
const MAX_RECOVERY_KEY_BYTES: usize = 256;
const NOTE_ID_HEX_CHARACTERS: usize = 32;
const MAX_TITLE_CHARACTERS: usize = 255;
const MAX_FOLDER_BYTES: usize = 4_096;
const MAX_NOTE_TEXT_BYTES: usize = 64 * 1_024 * 1_024;
/// Set-up and a new password stay within this time on this PC.
const UNLOCK_BUDGET: Duration = Duration::from_millis(1_500);

/// The unlocked sections, by their notes location, and the store that remembers them on this PC.
/// Locking a section drops it, which wipes its keys.
pub struct ProtectedNotes {
    sections: Mutex<HashMap<String, UnlockedSection>>,
    secrets: Box<dyn DeviceSecretStore>,
    /// What this PC last saw of each section, to tell when an older copy of a folder came back.
    records: SectionRecords,
    /// Sections unlocked with a folder warning the user has not accepted yet; their records wait.
    awaiting_acceptance: Mutex<HashSet<String>>,
}

impl ProtectedNotes {
    pub fn new(secrets: Box<dyn DeviceSecretStore>, records_file: PathBuf) -> Self {
        Self {
            sections: Mutex::new(HashMap::new()),
            secrets,
            records: SectionRecords::new(records_file),
            awaiting_acceptance: Mutex::new(HashSet::new()),
        }
    }

    fn awaiting(&self) -> MutexGuard<'_, HashSet<String>> {
        self.awaiting_acceptance
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    /// Keeps an unlocked section, and says when its folder is older than this PC last saw.
    fn keep_unlocked(
        &self,
        place: &SectionPlace,
        section: UnlockedSection,
    ) -> Answer<UnlockAnswer> {
        let seen = section.record()?;
        let folder_warning = self.records.warning_for(&section.vault_id(), &seen);
        if folder_warning.is_some() {
            self.awaiting().insert(place.location_key.clone());
        } else {
            self.records.remember(&section.vault_id(), &seen);
        }
        self.sections().insert(place.location_key.clone(), section);
        Ok(UnlockAnswer { folder_warning })
    }

    /// The user accepts the folder as it is: what this PC saw of it is updated.
    /// Refused unless a folder warning waits for this location, so nothing else can update the record.
    fn accept_folder(&self, place: &SectionPlace) -> Answer<()> {
        if !self.awaiting().remove(&place.location_key) {
            return Err(ProtectedCommandError::InvalidRequest);
        }
        self.with_section(place, |_| Ok(()))
    }

    fn sections(&self) -> MutexGuard<'_, HashMap<String, UnlockedSection>> {
        self.sections.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// The notes locations whose sections are unlocked now.
    pub fn unlocked_location_keys(&self) -> Vec<String> {
        self.sections().keys().cloned().collect()
    }

    /// Locks every section, as on sleep, session lock or quit; returns the locations that were open.
    pub fn lock_all(&self) -> Vec<String> {
        self.awaiting().clear();
        self.sections()
            .drain()
            .map(|(location, _)| location)
            .collect()
    }
}

/// Sent to every window when sections lock, so each closes their notes; it names the notes
/// locations by their canonical keys and holds nothing of the notes.
pub const PROTECTED_NOTES_LOCKED_EVENT: &str = "protected-notes-locked";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockedSections {
    location_keys: Vec<String>,
}

/// Sends an event to one window by its label.
pub trait WindowEmitter {
    fn emit_to_window(&self, label: &str, locked: &LockedSections);
}

impl WindowEmitter for WebviewWindow {
    fn emit_to_window(&self, label: &str, locked: &LockedSections) {
        let _ = self.emit_to(label, PROTECTED_NOTES_LOCKED_EVENT, locked.clone());
    }
}

/// Tells every open window which sections locked; nothing is sent when none did.
pub fn broadcast_locked(
    emitter: &impl WindowEmitter,
    window_labels: &[String],
    location_keys: Vec<String>,
) {
    if location_keys.is_empty() {
        return;
    }
    let locked = LockedSections { location_keys };
    for label in window_labels {
        emitter.emit_to_window(label, &locked);
    }
}

fn broadcast_from(window: &WebviewWindow, location_keys: Vec<String>) {
    let labels = window.state::<Arc<OpenWindows>>().labels();
    broadcast_locked(window, &labels, location_keys);
}

/// Why a protected section command failed, as a code only: never a key, a title or any note text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, thiserror::Error)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum ProtectedCommandError {
    #[error("wrong password or key")]
    WrongPassword,
    #[error("the key derivation could not run")]
    UnlockFailed,
    #[error("not enough memory")]
    NotEnoughMemory,
    #[error("damaged or changed outside MDX")]
    Tampered,
    #[error("vault file missing")]
    VaultMissing,
    #[error("locked")]
    Locked,
    #[error("not set up")]
    NotSetUp,
    #[error("set up already")]
    AlreadySetUp,
    #[error("not remembered on this PC")]
    NotRemembered,
    #[error("password too short")]
    PasswordTooShort,
    #[error("written by a newer version")]
    UnsupportedVersion,
    #[error("too large")]
    TooLarge,
    #[error("unavailable")]
    Unavailable,
    #[error("not found")]
    NotFound,
    #[error("invalid request")]
    InvalidRequest,
    #[error("access denied")]
    AccessDenied,
}

impl From<ProtectedError> for ProtectedCommandError {
    fn from(error: ProtectedError) -> Self {
        match error {
            ProtectedError::WrongKey => Self::WrongPassword,
            ProtectedError::KeyDerivationFailed => Self::UnlockFailed,
            ProtectedError::NotEnoughMemory => Self::NotEnoughMemory,
            ProtectedError::Tampered => Self::Tampered,
            ProtectedError::UnsupportedVersion => Self::UnsupportedVersion,
            ProtectedError::TooLarge
            | ProtectedError::ExcessiveKeyDerivation
            | ProtectedError::WeakKeyDerivation => Self::TooLarge,
            ProtectedError::NotSetUp => Self::NotSetUp,
            ProtectedError::AlreadySetUp => Self::AlreadySetUp,
            ProtectedError::VaultFileMissing => Self::VaultMissing,
            ProtectedError::NoteNotFound => Self::NotFound,
            ProtectedError::NotRemembered => Self::NotRemembered,
            ProtectedError::RandomUnavailable
            | ProtectedError::SecretStoreUnavailable
            | ProtectedError::Storage => Self::Unavailable,
        }
    }
}

impl From<DocumentError> for ProtectedCommandError {
    fn from(error: DocumentError) -> Self {
        match error {
            DocumentError::NotFound => Self::NotFound,
            DocumentError::AccessDenied => Self::AccessDenied,
            DocumentError::TooLarge => Self::TooLarge,
            _ => Self::InvalidRequest,
        }
    }
}

pub type Answer<T> = Result<T, ProtectedCommandError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectedStatus {
    is_set_up: bool,
    is_unlocked: bool,
    /// The vault has a slot for this PC; whether its key is still stored is known only on unlock.
    can_unlock_on_this_pc: bool,
}

/// An unlocked section, and a warning when its folder is older than this PC last saw it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockAnswer {
    #[serde(skip_serializing_if = "Option::is_none")]
    folder_warning: Option<FolderWarning>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetUpAnswer {
    /// Shown once, then never again.
    recovery_key: String,
}

#[derive(Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectedNoteSummary {
    note_id: String,
    title: String,
    folder: String,
    kind: FileKind,
    modified_ms: u64,
    state: NoteState,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectedNoteText {
    text: String,
    encoding: &'static str,
    has_byte_order_mark: bool,
    has_decoding_errors: bool,
    line_ending: LineEnding,
    revision: u64,
    /// An older copy replaced this note's file, as a sync tool restoring an old version would.
    is_older_copy: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProtectedNoteEdit {
    note_id: String,
    text: String,
    encoding: String,
    has_byte_order_mark: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewProtectedNote {
    title: String,
    folder: String,
}

/// A protected section command's place: the notes location's key and its section folder.
struct SectionPlace {
    location_key: String,
    folder: SectionFolder,
}

/// The section of a granted notes location shown by this window's Notes workspace; any other window
/// or folder is refused.
fn section_place(window: &WebviewWindow, location: &str) -> Answer<SectionPlace> {
    let access = window.state::<Arc<DocumentAccessList>>();
    let root = allowed_root(location, &access)?;
    if read_marker(root.folder())?.is_none() || !is_shown_notes_location(window, root.folder()) {
        return Err(ProtectedCommandError::AccessDenied);
    }
    Ok(section_place_of(root.folder()))
}

/// The canonical key of the section the window's Notes workspace shows, checked as every command checks it.
pub fn location_key_of_shown_section(window: &WebviewWindow, location: &str) -> Answer<String> {
    section_place(window, location).map(|place| place.location_key)
}

fn section_place_of(notes_folder: &Path) -> SectionPlace {
    SectionPlace {
        location_key: canonical_key_of(&notes_folder.to_string_lossy()),
        folder: SectionFolder::new(
            notes_folder
                .join(NOTES_APP_FOLDER)
                .join(SECTION_FOLDER_NAME),
        ),
    }
}

/// The window reports a Notes workspace whose location is this folder.
fn is_shown_notes_location(window: &WebviewWindow, notes_folder: &Path) -> bool {
    let Some(workspace_id) = window
        .state::<Arc<OpenWindows>>()
        .workspace_of(window.label())
    else {
        return false;
    };
    let Ok(registry) = window.state::<WorkspaceDatabase>().load_registry() else {
        return false;
    };
    registry
        .iter()
        .find(|record| record.id.as_str() == workspace_id)
        .filter(|record| record.kind_id.as_str() == NOTES_KIND_ID)
        .and_then(|record| notes_folder_of(record.kind_data.as_deref()?))
        .and_then(|folder| locate_document(&folder).ok())
        .is_some_and(|folder| folder.path() == notes_folder)
}

fn notes_folder_of(kind_data: &str) -> Option<PathBuf> {
    let data: serde_json::Value = serde_json::from_str(kind_data).ok()?;
    data.get("location")?
        .get("path")?
        .as_str()
        .map(PathBuf::from)
}

fn state_of(window: &WebviewWindow) -> Arc<ProtectedNotes> {
    Arc::clone(&window.state::<Arc<ProtectedNotes>>())
}

/// A password, read straight into memory that is wiped when dropped, refused when too long.
fn password_of(password: Zeroizing<String>) -> Answer<Zeroizing<String>> {
    if password.len() > MAX_PASSWORD_BYTES {
        return Err(ProtectedCommandError::InvalidRequest);
    }
    Ok(password)
}

fn new_password_of(password: Zeroizing<String>) -> Answer<Zeroizing<String>> {
    let password = password_of(password)?;
    if password.chars().count() < MIN_PASSWORD_CHARACTERS {
        return Err(ProtectedCommandError::PasswordTooShort);
    }
    Ok(password)
}

fn validated_note_id(note_id: &str) -> Answer<&str> {
    let is_note_id = note_id.len() == NOTE_ID_HEX_CHARACTERS
        && note_id
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte));
    if is_note_id {
        Ok(note_id)
    } else {
        Err(ProtectedCommandError::InvalidRequest)
    }
}

/// The settings that unlock within the budget on this PC, measured once.
fn calibrated_parameters() -> KdfParameters {
    calibrate(UNLOCK_BUDGET, |parameters| {
        let started = Instant::now();
        let _ = derive_password_key("calibration", &[0; 32], parameters);
        started.elapsed()
    })
}

impl ProtectedNotes {
    fn status(&self, place: &SectionPlace) -> ProtectedStatus {
        ProtectedStatus {
            is_set_up: place.folder.is_set_up(),
            is_unlocked: self.sections().contains_key(&place.location_key),
            can_unlock_on_this_pc: has_device_slot(&place.folder),
        }
    }

    fn set_up(
        &self,
        place: &SectionPlace,
        password: &str,
        parameters: KdfParameters,
    ) -> Answer<SetUpAnswer> {
        let (section, recovery_key) = place.folder.set_up(password, parameters)?;
        self.keep_unlocked(place, section)?;
        Ok(SetUpAnswer {
            recovery_key: recovery_key_text(&recovery_key).to_string(),
        })
    }

    fn unlock(
        &self,
        place: &SectionPlace,
        password: &str,
        should_remember: bool,
    ) -> Answer<UnlockAnswer> {
        let section = UnlockedSection::unlock_with_password(&place.folder, password)?;
        let answer = self.keep_unlocked(place, section)?;
        if should_remember {
            self.with_section(place, |section| {
                Ok(section.remember_on_this_pc(self.secrets.as_ref())?)
            })?;
        }
        Ok(answer)
    }

    fn unlock_with_recovery(
        &self,
        place: &SectionPlace,
        recovery: &RecoveryUnlock,
        parameters: KdfParameters,
    ) -> Answer<UnlockAnswer> {
        let key = recovery_key_from_text(&recovery.recovery_key)?;
        let section = UnlockedSection::unlock_with_key(&place.folder, SlotKind::Recovery, &key)?;
        let answer = self.keep_unlocked(place, section)?;
        self.with_section(place, |section| {
            Ok(section.replace_password(&recovery.new_password, parameters)?)
        })?;
        Ok(answer)
    }

    fn unlock_on_this_pc(&self, place: &SectionPlace) -> Answer<UnlockAnswer> {
        let section = unlock_on_this_pc(&place.folder, self.secrets.as_ref())?;
        self.keep_unlocked(place, section)
    }

    fn forget_this_pc(&self, place: &SectionPlace) -> Answer<()> {
        self.with_section(place, |section| {
            Ok(section.forget_this_pc(self.secrets.as_ref())?)
        })
    }

    /// Returns whether the section was unlocked.
    fn lock(&self, place: &SectionPlace) -> bool {
        self.awaiting().remove(&place.location_key);
        self.sections().remove(&place.location_key).is_some()
    }

    /// Runs work on an unlocked section; what this PC saw of it is updated afterwards, unless a folder
    /// warning waits for the user.
    fn with_section<T>(
        &self,
        place: &SectionPlace,
        work: impl FnOnce(&mut UnlockedSection) -> Answer<T>,
    ) -> Answer<T> {
        let mut sections = self.sections();
        let section = sections
            .get_mut(&place.location_key)
            .ok_or(ProtectedCommandError::Locked)?;
        let result = work(section)?;
        if !self.awaiting().contains(&place.location_key)
            && let Ok(seen) = section.record()
        {
            self.records.remember(&section.vault_id(), &seen);
        }
        Ok(result)
    }

    fn list(&self, place: &SectionPlace) -> Answer<Vec<ProtectedNoteSummary>> {
        self.with_section(place, |section| {
            Ok(section
                .notes()
                .into_iter()
                .map(|note| ProtectedNoteSummary {
                    note_id: note.note_id,
                    title: note.title,
                    folder: note.folder,
                    kind: note.kind,
                    modified_ms: note.modified_ms,
                    state: note.state,
                })
                .collect())
        })
    }

    fn create(&self, place: &SectionPlace, note: &NewProtectedNote, now_ms: u64) -> Answer<String> {
        let is_valid = !note.title.trim().is_empty()
            && note.title.chars().count() <= MAX_TITLE_CHARACTERS
            && note.folder.len() <= MAX_FOLDER_BYTES;
        if !is_valid {
            return Err(ProtectedCommandError::InvalidRequest);
        }
        self.with_section(place, |section| {
            Ok(section.create(&note.title, &note.folder, now_ms)?)
        })
    }

    fn open(&self, place: &SectionPlace, note_id: &str) -> Answer<ProtectedNoteText> {
        let note_id = validated_note_id(note_id)?;
        self.with_section(place, |section| {
            let opened = section.open(note_id)?;
            let decoded = decode_document_bytes(&opened.bytes);
            let mut text = Zeroizing::new(decoded.text);
            Ok(ProtectedNoteText {
                line_ending: detect_line_ending(&text),
                text: std::mem::take(&mut *text),
                encoding: decoded.encoding,
                has_byte_order_mark: decoded.has_byte_order_mark,
                has_decoding_errors: decoded.has_decoding_errors,
                revision: opened.revision,
                is_older_copy: opened.is_older_copy,
            })
        })
    }

    fn save(&self, place: &SectionPlace, edit: &ProtectedNoteEdit, now_ms: u64) -> Answer<u64> {
        let note_id = validated_note_id(&edit.note_id)?;
        if edit.text.len() > MAX_NOTE_TEXT_BYTES {
            return Err(ProtectedCommandError::TooLarge);
        }
        let encoding =
            encoding_for_label(&edit.encoding).ok_or(ProtectedCommandError::InvalidRequest)?;
        let bytes = Zeroizing::new(encode_document_text(
            &edit.text,
            encoding,
            edit.has_byte_order_mark,
        )?);
        self.with_section(place, |section| Ok(section.save(note_id, &bytes, now_ms)?))
    }
}

/// Whether this notes location has a protected section, and whether it is unlocked.
#[tauri::command]
pub async fn protected_status(location: String, window: WebviewWindow) -> Answer<ProtectedStatus> {
    let place = section_place(&window, &location)?;
    let state = state_of(&window);
    run_blocking(move || state.status(&place))
        .await
        .map_err(ProtectedCommandError::from)
}

/// Sets up a protected section with a password of at least 10 characters; returns the recovery key to
/// show once. The section is unlocked afterwards.
#[tauri::command]
pub async fn protected_set_up(
    location: String,
    password: Zeroizing<String>,
    window: WebviewWindow,
) -> Answer<SetUpAnswer> {
    let password = new_password_of(password)?;
    let place = section_place(&window, &location)?;
    let state = state_of(&window);
    run_blocking(move || state.set_up(&place, &password, calibrated_parameters())).await?
}

/// Unlocks with the password; with `remember`, this PC opens the section without it from then on.
#[tauri::command]
pub async fn protected_unlock(
    location: String,
    password: Zeroizing<String>,
    remember: bool,
    window: WebviewWindow,
) -> Answer<UnlockAnswer> {
    let password = password_of(password)?;
    let place = section_place(&window, &location)?;
    let state = state_of(&window);
    run_blocking(move || state.unlock(&place, &password, remember)).await?
}

/// The recovery key, typed by the user, and the new password it requires.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveryUnlock {
    recovery_key: Zeroizing<String>,
    new_password: Zeroizing<String>,
}

/// Unlocks with the recovery key and replaces the password, so the old one no longer opens the section.
#[tauri::command]
pub async fn protected_unlock_with_recovery(
    location: String,
    recovery: RecoveryUnlock,
    window: WebviewWindow,
) -> Answer<UnlockAnswer> {
    let recovery = RecoveryUnlock {
        new_password: new_password_of(recovery.new_password)?,
        recovery_key: recovery.recovery_key,
    };
    if recovery.recovery_key.len() > MAX_RECOVERY_KEY_BYTES {
        return Err(ProtectedCommandError::InvalidRequest);
    }
    let place = section_place(&window, &location)?;
    let state = state_of(&window);
    run_blocking(move || state.unlock_with_recovery(&place, &recovery, calibrated_parameters()))
        .await?
}

/// Locks every section, as on sleep, a Windows session lock or quit, once every window has saved
/// what it could of their notes; edits a window could not save are lost and that window says so.
#[tauri::command]
pub async fn protected_lock_all(window: WebviewWindow) -> Answer<()> {
    let unlocked = state_of(&window).unlocked_location_keys();
    save_everywhere_before_lock(&window, unlocked).await;
    let locked = state_of(&window).lock_all();
    broadcast_from(&window, locked);
    Ok(())
}

/// Unlocks with the key this PC remembers.
#[tauri::command]
pub async fn protected_unlock_on_this_pc(
    location: String,
    window: WebviewWindow,
) -> Answer<UnlockAnswer> {
    let place = section_place(&window, &location)?;
    let state = state_of(&window);
    run_blocking(move || state.unlock_on_this_pc(&place)).await?
}

/// The user keeps the folder as it is after a folder warning; this PC remembers it as seen.
#[tauri::command]
pub async fn protected_accept_folder(location: String, window: WebviewWindow) -> Answer<()> {
    let place = section_place(&window, &location)?;
    let state = state_of(&window);
    run_blocking(move || state.accept_folder(&place)).await?
}

/// Forgets this PC: the password or the recovery key is needed again.
#[tauri::command]
pub async fn protected_forget_this_pc(location: String, window: WebviewWindow) -> Answer<()> {
    let place = section_place(&window, &location)?;
    let state = state_of(&window);
    run_blocking(move || state.forget_this_pc(&place)).await?
}

/// Locks the section, which wipes its keys.
#[tauri::command]
pub async fn protected_lock(location: String, window: WebviewWindow) -> Answer<()> {
    let place = section_place(&window, &location)?;
    if state_of(&window).lock(&place) {
        broadcast_from(&window, vec![place.location_key]);
    }
    Ok(())
}

#[tauri::command]
pub async fn protected_list(
    location: String,
    window: WebviewWindow,
) -> Answer<Vec<ProtectedNoteSummary>> {
    let place = section_place(&window, &location)?;
    let state = state_of(&window);
    run_blocking(move || state.list(&place)).await?
}

#[tauri::command]
pub async fn protected_create(
    location: String,
    note: NewProtectedNote,
    window: WebviewWindow,
) -> Answer<String> {
    let place = section_place(&window, &location)?;
    let state = state_of(&window);
    run_blocking(move || state.create(&place, &note, now_ms())).await?
}

#[tauri::command]
pub async fn protected_open(
    location: String,
    note_id: String,
    window: WebviewWindow,
) -> Answer<ProtectedNoteText> {
    let place = section_place(&window, &location)?;
    let state = state_of(&window);
    run_blocking(move || state.open(&place, &note_id)).await?
}

/// Saves a note's text in its own encoding, encrypted; returns its new revision.
#[tauri::command]
pub async fn protected_save(
    location: String,
    note: ProtectedNoteEdit,
    window: WebviewWindow,
) -> Answer<u64> {
    let place = section_place(&window, &location)?;
    let state = state_of(&window);
    run_blocking(move || state.save(&place, &note, now_ms())).await?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::secrets::InMemoryDeviceSecrets;

    const PASSWORD: &str = "correct horse battery";
    const QUICK: KdfParameters = KdfParameters::FLOOR;

    fn start() -> (tempfile::TempDir, ProtectedNotes, SectionPlace) {
        let notes_folder = tempfile::tempdir().unwrap();
        let place = section_place_of(notes_folder.path());
        // In the app the records sit in its own data folder; a test keeps them in its temporary folder.
        let records = notes_folder.path().join("app-data-protected-sections.json");
        (
            notes_folder,
            ProtectedNotes::new(Box::new(InMemoryDeviceSecrets::default()), records),
            place,
        )
    }

    fn edit(note_id: &str, text: &str) -> ProtectedNoteEdit {
        ProtectedNoteEdit {
            note_id: note_id.to_owned(),
            text: text.to_owned(),
            encoding: "utf-8".to_owned(),
            has_byte_order_mark: true,
        }
    }

    fn new_note(title: &str) -> NewProtectedNote {
        NewProtectedNote {
            title: title.to_owned(),
            folder: String::new(),
        }
    }

    #[test]
    fn set_up_unlocks_and_a_saved_note_opens_with_its_exact_text() {
        let (_folder, notes, place) = start();

        let answer = notes.set_up(&place, PASSWORD, QUICK).unwrap();
        let note_id = notes.create(&place, &new_note("Bank details"), 1).unwrap();
        notes
            .save(&place, &edit(&note_id, "PIN 4821\r\n"), 2)
            .unwrap();
        let opened = notes.open(&place, &note_id).unwrap();

        assert_eq!(answer.recovery_key.split('-').count(), 14);
        assert!(notes.status(&place).is_unlocked);
        assert_eq!(opened.text, "PIN 4821\r\n");
        assert!(opened.has_byte_order_mark);
        assert_eq!(notes.list(&place).unwrap()[0].title, "Bank details");
    }

    #[test]
    fn lock_wipes_the_keys_and_the_password_opens_again_but_a_wrong_one_does_not() {
        let (_folder, notes, place) = start();
        notes.set_up(&place, PASSWORD, QUICK).unwrap();
        let note_id = notes.create(&place, &new_note("Note"), 1).unwrap();

        let _ = notes.lock(&place);

        assert_eq!(
            notes.open(&place, &note_id).map(|_| ()),
            Err(ProtectedCommandError::Locked)
        );
        assert_eq!(
            notes.unlock(&place, "wrong password", false),
            Err(ProtectedCommandError::WrongPassword)
        );
        assert!(!notes.status(&place).is_unlocked);
        notes.unlock(&place, PASSWORD, false).unwrap();
        assert!(notes.open(&place, &note_id).is_ok());
    }

    #[test]
    fn the_recovery_key_unlocks_with_a_new_password() {
        let (_folder, notes, place) = start();
        let recovery_key = notes.set_up(&place, PASSWORD, QUICK).unwrap().recovery_key;
        let _ = notes.lock(&place);

        let recovery = RecoveryUnlock {
            recovery_key: Zeroizing::new(recovery_key.to_lowercase()),
            new_password: Zeroizing::new("another long passphrase".to_owned()),
        };
        notes
            .unlock_with_recovery(&place, &recovery, QUICK)
            .unwrap();
        let _ = notes.lock(&place);

        assert_eq!(
            notes.unlock(&place, PASSWORD, false),
            Err(ProtectedCommandError::WrongPassword)
        );
        assert!(
            notes
                .unlock(&place, "another long passphrase", false)
                .is_ok()
        );
    }

    fn section_file(folder: &tempfile::TempDir, name: &str) -> PathBuf {
        folder.path().join(".mdx-notes/protected").join(name)
    }

    #[test]
    fn an_older_copy_of_the_whole_folder_is_named_on_unlock_until_accepted() {
        let (folder, notes, place) = start();
        notes.set_up(&place, PASSWORD, QUICK).unwrap();
        let note_id = notes.create(&place, &new_note("Note"), 1).unwrap();
        let older_manifest = std::fs::read(section_file(&folder, "manifest.mdxp")).unwrap();
        notes.save(&place, &edit(&note_id, "second"), 2).unwrap();
        let _ = notes.lock(&place);
        std::fs::write(section_file(&folder, "manifest.mdxp"), older_manifest).unwrap();

        let answer = notes.unlock(&place, PASSWORD, false).unwrap();
        let _ = notes.lock(&place);
        let again = notes.unlock(&place, PASSWORD, false).unwrap();
        notes.accept_folder(&place).unwrap();
        let _ = notes.lock(&place);
        let accepted = notes.unlock(&place, PASSWORD, false).unwrap();
        assert_eq!(
            notes.accept_folder(&place),
            Err(ProtectedCommandError::InvalidRequest)
        );

        assert_eq!(answer.folder_warning, Some(FolderWarning::OlderNotes));
        assert_eq!(again.folder_warning, Some(FolderWarning::OlderNotes));
        assert_eq!(accepted.folder_warning, None);
    }

    #[test]
    fn an_older_vault_file_is_named_on_unlock_and_a_new_pc_sees_no_warning() {
        let (folder, notes, place) = start();
        let recovery_key = notes.set_up(&place, PASSWORD, QUICK).unwrap().recovery_key;
        let older_vault = std::fs::read(section_file(&folder, "vault.json")).unwrap();
        let recovery = RecoveryUnlock {
            recovery_key: Zeroizing::new(recovery_key),
            new_password: Zeroizing::new("a new long passphrase".to_owned()),
        };
        notes
            .unlock_with_recovery(&place, &recovery, QUICK)
            .unwrap();
        let _ = notes.lock(&place);
        std::fs::write(section_file(&folder, "vault.json"), older_vault).unwrap();

        let answer = notes.unlock(&place, PASSWORD, false).unwrap();
        let other_pc = ProtectedNotes::new(
            Box::new(InMemoryDeviceSecrets::default()),
            folder.path().join("another-pc-records.json"),
        );

        assert_eq!(answer.folder_warning, Some(FolderWarning::ChangedVault));
        assert_eq!(
            other_pc
                .unlock(&place, PASSWORD, false)
                .unwrap()
                .folder_warning,
            None
        );
    }

    #[test]
    fn forgetting_this_pc_in_an_older_copy_of_the_vault_is_not_a_warning() {
        let (folder, notes, place) = start();
        notes.set_up(&place, PASSWORD, QUICK).unwrap();
        let without_device_slot = std::fs::read(section_file(&folder, "vault.json")).unwrap();
        notes.unlock(&place, PASSWORD, true).unwrap();
        let _ = notes.lock(&place);
        std::fs::write(section_file(&folder, "vault.json"), without_device_slot).unwrap();

        assert_eq!(
            notes
                .unlock(&place, PASSWORD, false)
                .unwrap()
                .folder_warning,
            None
        );
    }

    #[test]
    fn remembering_this_pc_unlocks_without_a_password_until_forgotten() {
        let (_folder, notes, place) = start();
        notes.set_up(&place, PASSWORD, QUICK).unwrap();
        let _ = notes.lock(&place);
        assert_eq!(
            notes.unlock_on_this_pc(&place),
            Err(ProtectedCommandError::NotRemembered)
        );

        notes.unlock(&place, PASSWORD, true).unwrap();
        let _ = notes.lock(&place);
        assert!(notes.status(&place).can_unlock_on_this_pc);
        notes.unlock_on_this_pc(&place).unwrap();
        notes.forget_this_pc(&place).unwrap();
        let _ = notes.lock(&place);

        assert!(!notes.status(&place).can_unlock_on_this_pc);
        assert_eq!(
            notes.unlock_on_this_pc(&place),
            Err(ProtectedCommandError::NotRemembered)
        );
    }

    #[test]
    fn invalid_ids_short_and_oversized_passwords_and_bad_notes_are_refused() {
        let (_folder, notes, place) = start();
        notes.set_up(&place, PASSWORD, QUICK).unwrap();

        for note_id in ["", "../vault", &"A".repeat(32), &"0".repeat(33)] {
            assert_eq!(
                notes.open(&place, note_id).map(|_| ()),
                Err(ProtectedCommandError::InvalidRequest)
            );
        }
        assert_eq!(
            notes.open(&place, &"0".repeat(32)).map(|_| ()),
            Err(ProtectedCommandError::NotFound)
        );
        assert_eq!(
            password_of(Zeroizing::new("x".repeat(MAX_PASSWORD_BYTES + 1))).map(|_| ()),
            Err(ProtectedCommandError::InvalidRequest)
        );
        assert_eq!(
            new_password_of(Zeroizing::new("short pass".chars().take(9).collect())).map(|_| ()),
            Err(ProtectedCommandError::PasswordTooShort)
        );
        assert!(new_password_of(Zeroizing::new("ten chars!".to_owned())).is_ok());
        assert_eq!(
            notes.create(&place, &new_note("  "), 1),
            Err(ProtectedCommandError::InvalidRequest)
        );
        assert_eq!(
            notes.set_up(&place, PASSWORD, QUICK).map(|_| ()),
            Err(ProtectedCommandError::AlreadySetUp)
        );
    }

    #[test]
    fn no_error_carries_text_titles_or_keys() {
        for error in [
            ProtectedCommandError::WrongPassword,
            ProtectedCommandError::Tampered,
            ProtectedCommandError::NotFound,
            ProtectedCommandError::Unavailable,
        ] {
            let json = serde_json::to_value(error).unwrap();
            assert_eq!(
                json.as_object().map(serde_json::Map::len),
                Some(1),
                "{json}"
            );
        }
        let (folder, notes, place) = start();
        notes.set_up(&place, PASSWORD, QUICK).unwrap();
        let note_id = notes.create(&place, &new_note("Bank details"), 1).unwrap();
        let note_file = folder
            .path()
            .join(".mdx-notes/protected/notes")
            .join(format!("{note_id}.mdxp"));
        let mut bytes = std::fs::read(&note_file).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        std::fs::write(&note_file, bytes).unwrap();

        let error = notes.open(&place, &note_id).map(|_| ()).unwrap_err();

        assert_eq!(
            serde_json::to_string(&error).unwrap(),
            r#"{"code":"tampered"}"#
        );
    }

    #[derive(Default)]
    struct RecordingEmitter(std::sync::Mutex<Vec<(String, LockedSections)>>);

    impl WindowEmitter for RecordingEmitter {
        fn emit_to_window(&self, label: &str, locked: &LockedSections) {
            self.0
                .lock()
                .unwrap()
                .push((label.to_owned(), locked.clone()));
        }
    }

    #[test]
    fn a_lock_event_reaches_every_open_window_and_names_only_locations() {
        let emitter = RecordingEmitter::default();
        let windows = [
            "main".to_owned(),
            "window-2".to_owned(),
            "window-3".to_owned(),
        ];

        broadcast_locked(&emitter, &windows, vec!["c:\\notes".to_owned()]);
        broadcast_locked(&emitter, &windows, Vec::new());

        let sent = emitter.0.lock().unwrap();
        assert_eq!(
            sent.iter()
                .map(|(label, _)| label.as_str())
                .collect::<Vec<_>>(),
            ["main", "window-2", "window-3"]
        );
        assert_eq!(
            serde_json::to_string(&sent[0].1).unwrap(),
            r#"{"locationKeys":["c:\\notes"]}"#
        );
    }

    #[test]
    fn locking_every_section_names_the_locations_that_were_open() {
        let (_folder, notes, place) = start();
        notes.set_up(&place, PASSWORD, QUICK).unwrap();

        assert_eq!(notes.lock_all(), std::slice::from_ref(&place.location_key));
        assert!(!notes.status(&place).is_unlocked);
    }
}
