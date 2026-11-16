mod move_cancel;
mod move_copy;
mod move_error;
mod move_file_system;
mod move_journal;
mod move_plan;
mod old_copy_removal;
mod source_changes;
#[cfg(test)]
mod tests;

pub use move_cancel::{KeptFiles, cancel_move};
pub use move_copy::{MoveProgress, MoveRun, run_move};
pub use move_error::{ListedProblem, MAX_LISTED_PATHS, MoveError};
pub use move_file_system::{DiskFileSystem, MoveFileSystem};
pub use move_journal::{MoveIdentity, MoveJournal, MoveJournals, MoveState, is_same_or_inside};
pub use move_plan::{MAX_TARGET_PATH_UNITS, MovePlan, MovePlanSummary, MoveTarget, plan_move};
pub use old_copy_removal::{OldCopyRemoval, remove_old_copy};

/// The workspace may use the new folder only once every copy is verified.
pub fn check_switchable(journal: &MoveJournal) -> Result<(), MoveError> {
    if journal.state == MoveState::Verified {
        Ok(())
    } else {
        Err(MoveError::WrongState)
    }
}
