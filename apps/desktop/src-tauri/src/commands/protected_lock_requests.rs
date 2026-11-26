use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, WebviewWindow};

use crate::app_windows::OpenWindows;
use crate::commands::documents::run_blocking;
use crate::commands::protected_notes::{Answer, location_key_of_shown_section};

/// Sent to every window before sections lock, so each saves its unsaved edits of their notes first.
pub const PROTECTED_NOTES_LOCK_REQUESTED_EVENT: &str = "protected-notes-lock-requested";
/// How long a lock waits for the windows to save; a window that has not answered by then counts as not saved.
const SAVE_BEFORE_LOCK_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockRequest {
    request_id: u64,
    location_keys: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockReadiness {
    is_everything_saved: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LockRequestAnswer {
    request_id: u64,
    is_everything_saved: bool,
}

struct PendingRequest {
    waiting_for: HashSet<String>,
    is_everything_saved: bool,
    answered: Sender<()>,
}

/// The locks waiting for every window to save its protected edits, by request id.
#[derive(Default)]
pub struct LockRequests {
    next_id: AtomicU64,
    pending: Mutex<HashMap<u64, PendingRequest>>,
}

impl LockRequests {
    /// Starts waiting for these windows; the receiver hears once they have all answered.
    pub fn begin(&self, window_labels: Vec<String>) -> (u64, Receiver<()>) {
        let request_id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (answered, all_answered) = mpsc::channel();
        if window_labels.is_empty() {
            let _ = answered.send(());
        }
        self.pending().insert(
            request_id,
            PendingRequest {
                waiting_for: window_labels.into_iter().collect(),
                is_everything_saved: true,
                answered,
            },
        );
        (request_id, all_answered)
    }

    /// One window saved, or could not save, its edits; only a window still waited for counts.
    pub fn answer(&self, request_id: u64, window_label: &str, is_everything_saved: bool) {
        let mut pending = self.pending();
        let Some(request) = pending.get_mut(&request_id) else {
            return;
        };
        if !request.waiting_for.remove(window_label) {
            return;
        }
        request.is_everything_saved &= is_everything_saved;
        if request.waiting_for.is_empty() {
            let _ = request.answered.send(());
        }
    }

    /// Waits for every window, or until the timeout; true only when all of them saved everything.
    pub fn finish(&self, request_id: u64, all_answered: &Receiver<()>, timeout: Duration) -> bool {
        let has_every_answer = all_answered.recv_timeout(timeout).is_ok();
        let request = self.pending().remove(&request_id);
        has_every_answer && request.is_some_and(|request| request.is_everything_saved)
    }

    fn pending(&self) -> MutexGuard<'_, HashMap<u64, PendingRequest>> {
        self.pending.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Asks every window to save its unsaved edits of these sections' notes and waits for the answers.
pub async fn save_everywhere_before_lock(
    window: &WebviewWindow,
    location_keys: Vec<String>,
) -> bool {
    if location_keys.is_empty() {
        return true;
    }
    let labels = window.state::<Arc<OpenWindows>>().labels();
    let requests = Arc::clone(&window.state::<Arc<LockRequests>>());
    let (request_id, all_answered) = requests.begin(labels.clone());
    let request = LockRequest {
        request_id,
        location_keys,
    };
    for label in &labels {
        let _ = window.emit_to(
            label.as_str(),
            PROTECTED_NOTES_LOCK_REQUESTED_EVENT,
            request.clone(),
        );
    }
    run_blocking(move || requests.finish(request_id, &all_answered, SAVE_BEFORE_LOCK_TIMEOUT))
        .await
        .unwrap_or(false)
}

/// Before the user locks the shown section: every window saves its edits of the section's notes.
/// The answer says whether all of them were saved, so the user can be asked before anything is lost.
#[tauri::command]
pub async fn protected_save_before_lock(
    location: String,
    window: WebviewWindow,
) -> Answer<LockReadiness> {
    let location_key = location_key_of_shown_section(&window, &location)?;
    let is_everything_saved = save_everywhere_before_lock(&window, vec![location_key]).await;
    Ok(LockReadiness {
        is_everything_saved,
    })
}

/// A window has saved, or could not save, its edits for a lock that waits.
#[tauri::command]
pub fn protected_answer_lock_request(answer: LockRequestAnswer, window: WebviewWindow) {
    window.state::<Arc<LockRequests>>().answer(
        answer.request_id,
        window.label(),
        answer.is_everything_saved,
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    const NO_WAIT: Duration = Duration::from_millis(50);

    fn labels(names: &[&str]) -> Vec<String> {
        names.iter().map(|name| (*name).to_owned()).collect()
    }

    #[test]
    fn every_window_saving_lets_the_lock_go_ahead() {
        let requests = LockRequests::default();
        let (request_id, all_answered) = requests.begin(labels(&["main", "window-2"]));

        requests.answer(request_id, "main", true);
        requests.answer(request_id, "window-2", true);

        assert!(requests.finish(request_id, &all_answered, NO_WAIT));
    }

    #[test]
    fn one_window_failing_to_save_is_reported() {
        let requests = LockRequests::default();
        let (request_id, all_answered) = requests.begin(labels(&["main", "window-2"]));

        requests.answer(request_id, "main", true);
        requests.answer(request_id, "window-2", false);

        assert!(!requests.finish(request_id, &all_answered, NO_WAIT));
    }

    #[test]
    fn a_window_that_never_answers_counts_as_not_saved() {
        let requests = LockRequests::default();
        let (request_id, all_answered) = requests.begin(labels(&["main", "window-2"]));

        requests.answer(request_id, "main", true);

        assert!(!requests.finish(request_id, &all_answered, NO_WAIT));
    }

    #[test]
    fn answers_from_other_windows_or_for_other_requests_do_not_count() {
        let requests = LockRequests::default();
        let (request_id, all_answered) = requests.begin(labels(&["main"]));

        requests.answer(request_id, "window-9", true);
        requests.answer(request_id + 1, "main", true);

        assert!(!requests.finish(request_id, &all_answered, NO_WAIT));
    }

    #[test]
    fn a_second_answer_from_a_window_cannot_undo_its_failure() {
        let requests = LockRequests::default();
        let (request_id, all_answered) = requests.begin(labels(&["main", "window-2"]));

        requests.answer(request_id, "main", false);
        requests.answer(request_id, "main", true);
        requests.answer(request_id, "window-2", true);

        assert!(!requests.finish(request_id, &all_answered, NO_WAIT));
    }

    #[test]
    fn no_open_window_means_nothing_waits() {
        let requests = LockRequests::default();
        let (request_id, all_answered) = requests.begin(Vec::new());

        assert!(requests.finish(request_id, &all_answered, NO_WAIT));
    }

    #[test]
    fn a_finished_request_takes_no_more_answers() {
        let requests = LockRequests::default();
        let (request_id, all_answered) = requests.begin(labels(&["main"]));
        requests.answer(request_id, "main", true);
        requests.finish(request_id, &all_answered, NO_WAIT);

        requests.answer(request_id, "main", false);

        assert!(requests.pending().is_empty());
    }
}
