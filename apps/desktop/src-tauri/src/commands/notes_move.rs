use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

use crate::commands::documents::{run_blocking, validated_path};
use crate::commands::notes_location::{LocationCheck, claimable_path, location_check, user_folder};
use crate::documents::{
    DocumentAccessList, DocumentError, DocumentLocation, canonical_key_of, locate_document,
};
use crate::notes_location::{
    DiskFileSystem, KeptFiles, MAX_TARGET_PATH_UNITS, MoveError, MoveIdentity, MoveJournal,
    MoveJournals, MovePlanSummary, MoveProgress, MoveRun, MoveState, MoveTarget, OldCopyRemoval,
    cancel_move, canonical_folder, check_switchable, is_same_or_inside, plan_move, remove_old_copy,
    run_move,
};
use crate::platform::SystemRecycleBin;
use crate::storage::{WorkspaceDatabase, WorkspaceId};

pub const NOTES_MOVE_PROGRESS_EVENT: &str = "notes-move-progress";

/// The moves of Notes folders: their journals, the one that runs, and its stop request.
pub struct NotesMoves {
    journals: MoveJournals,
    running_location_id: Mutex<Option<String>>,
    stop: AtomicBool,
    pause_after_each_file: Duration,
}

impl NotesMoves {
    pub fn new(journal_folder: PathBuf, pause_after_each_file: Duration) -> Self {
        Self {
            journals: MoveJournals::new(journal_folder),
            running_location_id: Mutex::new(None),
            stop: AtomicBool::new(false),
            pause_after_each_file,
        }
    }

    /// Folders whose move has not switched yet stay read-only after a restart, until Resume or Cancel.
    pub fn keep_unfinished_moves_read_only(&self, access: &DocumentAccessList) {
        for journal in self.journals.all() {
            if journal.state != MoveState::Switched {
                access.make_folder_read_only(&journal.source);
            }
        }
    }

    fn journal(&self, location_id: &str) -> Result<MoveJournal, MoveError> {
        self.journals.read(location_id)?.ok_or(MoveError::NoMove)
    }

    #[cfg(test)]
    fn is_running(&self) -> bool {
        self.running_location_id
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .is_some()
    }

    fn run(&self, location_id: &str, report: &dyn Fn(MoveProgress)) -> Result<(), MoveError> {
        let mut journal = self.journal(location_id)?;
        let _running = RunningMove::claim(self, location_id)?;
        self.stop.store(false, Ordering::Relaxed);
        let file_system = DiskFileSystem {
            pause_after_each_file: self.pause_after_each_file,
        };
        let run = MoveRun {
            file_system: &file_system,
            stop: &self.stop,
            save: &|journal| self.journals.write(journal),
            report,
        };
        run_move(&mut journal, &run)
    }
}

/// Holds the one place for a running move and frees it however the run ends.
struct RunningMove<'a>(&'a NotesMoves);

impl<'a> RunningMove<'a> {
    fn claim(moves: &'a NotesMoves, location_id: &str) -> Result<Self, MoveError> {
        let mut running = moves
            .running_location_id
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        if running.is_some() {
            return Err(MoveError::MoveUnderway);
        }
        *running = Some(location_id.to_owned());
        Ok(Self(moves))
    }
}

impl Drop for RunningMove<'_> {
    fn drop(&mut self) {
        *self
            .0
            .running_location_id
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = None;
    }
}

impl From<DocumentError> for MoveError {
    fn from(error: DocumentError) -> Self {
        match error {
            DocumentError::InvalidRequest => Self::InvalidRequest,
            _ => Self::AccessDenied,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesMoveRequest {
    workspace_id: String,
    location_id: String,
    source: String,
    target: String,
}

/// Lists the notes folder and checks the new folder, then records the plan; from here until the
/// switch or a cancel the notes folder is read-only.
#[tauri::command]
pub async fn plan_notes_move(
    request: NotesMoveRequest,
    app: AppHandle,
    access: State<'_, Arc<DocumentAccessList>>,
    moves: State<'_, Arc<NotesMoves>>,
) -> Result<MovePlanSummary, MoveError> {
    let workspace_id = validated_id(request.workspace_id)?;
    let location_id = validated_id(request.location_id)?;
    let database = app.state::<WorkspaceDatabase>();
    let other_folders = notes_folders_of_workspaces(&database, Some(&workspace_id))?;
    let (access, moves) = (Arc::clone(&access), Arc::clone(&moves));
    run_blocking(move || {
        let target = claimable_path(&request.target, &app, &access)?;
        let user_folder = user_folder(&app);
        let source = movable_source(&request.source, &location_id, &access)?;
        if other_folders
            .iter()
            .any(|folder| folders_touch(folder, &target))
        {
            return Err(MoveError::TargetClaimed);
        }
        let _running = RunningMove::claim(&moves, &location_id)?;
        if moves.journals.read(&location_id)?.is_some() {
            return Err(MoveError::MoveUnderway);
        }
        let place = MoveTarget {
            target: &target,
            user_folder: user_folder.as_deref(),
            max_path_units: MAX_TARGET_PATH_UNITS,
        };
        let plan = plan_move(&source, &place, &DiskFileSystem::default())?;
        let summary = plan.summary();
        let identity = MoveIdentity {
            location_id,
            workspace_id,
            source,
            target,
        };
        let journal = MoveJournal::new(identity, plan);
        moves.journals.write(&journal)?;
        access.make_folder_read_only(&journal.source);
        Ok(summary)
    })
    .await?
}

/// The shown workspace's own notes folder, granted to the window and still carrying its id.
fn movable_source(
    path: &str,
    location_id: &str,
    access: &DocumentAccessList,
) -> Result<PathBuf, MoveError> {
    let location = locate_document(&validated_path(path)?)?;
    let is_own_location = access.is_folder_allowed(&location)
        && location_check(&location.path(), location_id) == LocationCheck::Available;
    if is_own_location {
        Ok(canonical_folder(&location.path()))
    } else {
        Err(MoveError::AccessDenied)
    }
}

fn validated_id(id: String) -> Result<String, MoveError> {
    WorkspaceId::try_from(id)
        .map(|id| id.as_str().to_owned())
        .map_err(|_| MoveError::InvalidRequest)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MoveProgressEvent {
    location_id: String,
    #[serde(flatten)]
    progress: MoveProgress,
}

/// Copies and verifies, or resumes, a planned move off the window's thread; progress arrives as
/// `notes-move-progress` events. The workspace still uses the old folder when this returns.
#[tauri::command]
pub async fn run_notes_move(
    location_id: String,
    window: WebviewWindow,
    moves: State<'_, Arc<NotesMoves>>,
) -> Result<(), MoveError> {
    let location_id = validated_id(location_id)?;
    let moves = Arc::clone(&moves);
    run_blocking(move || {
        let report = |progress: MoveProgress| {
            let event = MoveProgressEvent {
                location_id: location_id.clone(),
                progress,
            };
            let _ = window.emit_to(window.label(), NOTES_MOVE_PROGRESS_EVENT, event);
        };
        moves.run(&location_id, &report)
    })
    .await?
}

/// Asks the running move to stop after the file it is copying.
#[tauri::command]
pub fn stop_notes_move(moves: State<'_, Arc<NotesMoves>>) {
    moves.stop.store(true, Ordering::Relaxed);
}

/// Removes only what the move made in the new folder; the notes folder becomes writable again.
#[tauri::command]
pub async fn cancel_notes_move(
    location_id: String,
    access: State<'_, Arc<DocumentAccessList>>,
    moves: State<'_, Arc<NotesMoves>>,
    database: State<'_, WorkspaceDatabase>,
) -> Result<KeptFiles, MoveError> {
    let location_id = validated_id(location_id)?;
    let notes_folders = notes_folders_of_workspaces(&database, None)?;
    let (access, moves) = (Arc::clone(&access), Arc::clone(&moves));
    run_blocking(move || {
        let _running = RunningMove::claim(&moves, &location_id)?;
        let journal = moves.journal(&location_id)?;
        check_new_folder_is_unused(&journal, &notes_folders)?;
        let kept = cancel_move(&journal)?;
        moves.journals.remove(&location_id)?;
        access.make_folder_writable(&journal.source);
        Ok(kept)
    })
    .await?
}

/// Lets the window read the new folder once every copy is verified, so it can switch the workspace.
#[tauri::command]
pub fn switch_notes_move(
    location_id: String,
    access: State<'_, Arc<DocumentAccessList>>,
    moves: State<'_, Arc<NotesMoves>>,
) -> Result<DocumentLocation, MoveError> {
    let journal = moves.journal(&validated_id(location_id)?)?;
    check_switchable(&journal)?;
    if location_check(&journal.target, &journal.location_id) != LocationCheck::Available {
        return Err(MoveError::WrongState);
    }
    access.grant_folder(&journal.target)?;
    Ok(locate_document(&journal.target)?)
}

/// What the removal offer shows of the old folder.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OldCopy {
    location_id: String,
    path: String,
    file_count: usize,
    total_bytes: u64,
}

impl From<&MoveJournal> for OldCopy {
    fn from(journal: &MoveJournal) -> Self {
        Self {
            location_id: journal.location_id.clone(),
            path: journal.source.to_string_lossy().into_owned(),
            file_count: journal.files.len(),
            total_bytes: journal.total_bytes(),
        }
    }
}

/// Records that the workspace now uses the new folder; the old one is no longer the window's.
#[tauri::command]
pub fn finish_notes_move_switch(
    location_id: String,
    access: State<'_, Arc<DocumentAccessList>>,
    moves: State<'_, Arc<NotesMoves>>,
) -> Result<OldCopy, MoveError> {
    let mut journal = moves.journal(&validated_id(location_id)?)?;
    if journal.state != MoveState::Switched {
        check_switchable(&journal)?;
        journal.state = MoveState::Switched;
        moves.journals.write(&journal)?;
    }
    access.make_folder_writable(&journal.source);
    access.revoke_folder(&journal.source);
    Ok(OldCopy::from(&journal))
}

/// A move the app was not able to finish, offered again at start.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnfinishedMove {
    workspace_id: String,
    target: String,
    state: MoveState,
    #[serde(skip_serializing_if = "Option::is_none")]
    failure: Option<MoveError>,
    #[serde(flatten)]
    old_copy: OldCopy,
}

#[tauri::command]
pub fn unfinished_notes_moves(moves: State<'_, Arc<NotesMoves>>) -> Vec<UnfinishedMove> {
    moves
        .journals
        .all()
        .iter()
        .map(|journal| UnfinishedMove {
            workspace_id: journal.workspace_id.clone(),
            target: journal.target.to_string_lossy().into_owned(),
            state: journal.state,
            failure: journal.failure.clone(),
            old_copy: OldCopy::from(journal),
        })
        .collect()
}

/// Keeps the old folder as it is and forgets the move.
#[tauri::command]
pub fn keep_old_notes_copy(
    location_id: String,
    moves: State<'_, Arc<NotesMoves>>,
) -> Result<(), MoveError> {
    let location_id = validated_id(location_id)?;
    if moves.journal(&location_id)?.state != MoveState::Switched {
        return Err(MoveError::WrongState);
    }
    moves.journals.remove(&location_id)
}

/// After the user confirmed twice: sends the verified old files to the Recycle Bin and keeps the rest.
#[tauri::command]
pub async fn remove_old_notes_copy(
    location_id: String,
    moves: State<'_, Arc<NotesMoves>>,
    database: State<'_, WorkspaceDatabase>,
) -> Result<OldCopyRemoval, MoveError> {
    let location_id = validated_id(location_id)?;
    let notes_folders = notes_folders_of_workspaces(&database, None)?;
    let moves = Arc::clone(&moves);
    run_blocking(move || {
        let _running = RunningMove::claim(&moves, &location_id)?;
        let journal = moves.journal(&location_id)?;
        check_old_copy_is_unused(&journal, &notes_folders)?;
        let removal = remove_old_copy(&journal, &SystemRecycleBin, &DiskFileSystem::default())?;
        moves.journals.remove(&location_id)?;
        Ok(removal)
    })
    .await?
}

/// The new folder must hold the notes, and no workspace may still use the old one.
fn check_old_copy_is_unused(
    journal: &MoveJournal,
    notes_folders: &[PathBuf],
) -> Result<(), MoveError> {
    if location_check(&journal.target, &journal.location_id) != LocationCheck::Available {
        return Err(MoveError::OldCopyInUse);
    }
    if notes_folders
        .iter()
        .any(|folder| folders_touch(folder, &journal.source))
    {
        Err(MoveError::OldCopyInUse)
    } else {
        Ok(())
    }
}

/// Cancel removes copies from the new folder, so it is refused once a workspace reads its notes there.
fn check_new_folder_is_unused(
    journal: &MoveJournal,
    notes_folders: &[PathBuf],
) -> Result<(), MoveError> {
    if notes_folders
        .iter()
        .any(|folder| folders_touch(folder, &journal.target))
    {
        Err(MoveError::NewFolderInUse)
    } else {
        Ok(())
    }
}

/// The notes folders the workspaces' records name, leaving out one workspace when given.
fn notes_folders_of_workspaces(
    database: &WorkspaceDatabase,
    except_workspace_id: Option<&str>,
) -> Result<Vec<PathBuf>, MoveError> {
    Ok(database
        .load_registry()
        .map_err(|_| MoveError::JournalUnavailable)?
        .into_iter()
        .filter(|workspace| Some(workspace.id.as_str()) != except_workspace_id)
        .filter_map(|workspace| notes_folder_of(workspace.kind_data.as_deref()?))
        .collect())
}

/// Clear All Data forgets every move; the notes folders become writable again and keep their files.
#[tauri::command]
pub async fn clear_notes_moves(
    access: State<'_, Arc<DocumentAccessList>>,
    moves: State<'_, Arc<NotesMoves>>,
) -> Result<usize, MoveError> {
    let (access, moves) = (Arc::clone(&access), Arc::clone(&moves));
    run_blocking(move || {
        let _running = RunningMove::claim(&moves, "")?;
        let journals = moves.journals.all();
        for journal in &journals {
            moves.journals.remove(&journal.location_id)?;
            access.make_folder_writable(&journal.source);
        }
        Ok(journals.len())
    })
    .await?
}

fn notes_folder_of(kind_data: &str) -> Option<PathBuf> {
    let data: serde_json::Value = serde_json::from_str(kind_data).ok()?;
    data.get("location")?
        .get("path")?
        .as_str()
        .map(PathBuf::from)
}

fn folders_touch(first: &Path, second: &Path) -> bool {
    let key = |path: &Path| canonical_key_of(&canonical_folder(path).to_string_lossy());
    key(first) == key(second)
        || is_same_or_inside(first, second)
        || is_same_or_inside(second, first)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notes_workspace(path: &Path) -> PathBuf {
        let kind_data =
            serde_json::json!({ "location": { "path": path, "locationId": "location-1" } });
        notes_folder_of(&kind_data.to_string()).unwrap()
    }

    fn switched_journal(source: &Path, target: &Path) -> MoveJournal {
        crate::notes_location::mark_location(target, "location-1", 1).unwrap();
        let plan = crate::notes_location::MovePlan {
            files: Vec::new(),
            folders: Vec::new(),
            online_only_count: 0,
            online_only_bytes: 0,
            required_bytes: 0,
            available_bytes: 0,
            is_target_new: false,
        };
        let identity = MoveIdentity {
            location_id: "location-1".to_owned(),
            workspace_id: "workspace-1".to_owned(),
            source: source.to_path_buf(),
            target: target.to_path_buf(),
        };
        let mut journal = MoveJournal::new(identity, plan);
        journal.state = MoveState::Switched;
        journal
    }

    #[test]
    fn the_old_copy_is_kept_while_a_workspace_still_uses_it() {
        let (source, target) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let journal = switched_journal(source.path(), target.path());

        let refusal = check_old_copy_is_unused(&journal, &[notes_workspace(source.path())]);

        assert_eq!(refusal, Err(MoveError::OldCopyInUse));
        assert_eq!(
            check_old_copy_is_unused(&journal, &[notes_workspace(target.path())]),
            Ok(())
        );
    }

    #[test]
    fn the_old_copy_is_kept_when_the_new_folder_is_gone() {
        let (source, target) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let journal = switched_journal(source.path(), target.path());
        std::fs::remove_dir_all(target.path()).unwrap();

        assert_eq!(
            check_old_copy_is_unused(&journal, &[]),
            Err(MoveError::OldCopyInUse)
        );
    }

    #[test]
    fn cancel_is_refused_once_a_workspace_reads_its_notes_from_the_new_folder() {
        let (source, target) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let mut journal = switched_journal(source.path(), target.path());
        journal.state = MoveState::Verified;

        let refusal = check_new_folder_is_unused(&journal, &[notes_workspace(target.path())]);

        assert_eq!(refusal, Err(MoveError::NewFolderInUse));
        assert_eq!(
            check_new_folder_is_unused(&journal, &[notes_workspace(source.path())]),
            Ok(())
        );
    }

    #[test]
    fn a_running_move_holds_its_place_until_it_ends() {
        let data = tempfile::tempdir().unwrap();
        let moves = NotesMoves::new(data.path().to_path_buf(), Duration::ZERO);

        let running = RunningMove::claim(&moves, "location-1").unwrap();

        assert!(moves.is_running());
        assert!(matches!(
            RunningMove::claim(&moves, "location-2"),
            Err(MoveError::MoveUnderway)
        ));
        drop(running);
        assert!(!moves.is_running());
    }
}
