use std::cell::RefCell;
use std::fs::{self, File, Metadata};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::{Duration, SystemTime};

use super::move_copy::MovePhase;
use super::*;

/// Counts the copies it creates and can stand in for a drive that fills up.
#[derive(Default)]
struct TestDisk {
    created_copies: AtomicUsize,
    full_after_copies: Option<usize>,
    /// Keeps file times to two seconds, as FAT, exFAT and some network drives do.
    rounds_times: bool,
}

const ROUNDING_SECONDS: u64 = 2;

impl MoveFileSystem for TestDisk {
    fn available_bytes(&self, _folder: &Path) -> io::Result<u64> {
        Ok(u64::MAX)
    }

    fn is_online_only(&self, _path: &Path, _metadata: &Metadata) -> bool {
        false
    }

    fn create_copy(&self, pending: &Path) -> io::Result<File> {
        let created = self.created_copies.fetch_add(1, Ordering::SeqCst);
        if self.full_after_copies.is_some_and(|limit| created >= limit) {
            return Err(io::Error::from(io::ErrorKind::StorageFull));
        }
        File::create(pending)
    }

    fn set_copy_time(&self, copy: &File, modified: SystemTime) -> io::Result<()> {
        if !self.rounds_times {
            return copy.set_modified(modified);
        }
        let seconds = modified
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let rounded = seconds - seconds % ROUNDING_SECONDS;
        copy.set_modified(SystemTime::UNIX_EPOCH + Duration::from_secs(rounded))
    }
}

/// A notes folder, a place for the new folder and the app data that holds the journal.
struct MoveSetup {
    source: tempfile::TempDir,
    place: tempfile::TempDir,
    data: tempfile::TempDir,
}

impl MoveSetup {
    fn with_notes(count: usize) -> Self {
        let source = tempfile::tempdir().unwrap();
        fs::create_dir_all(source.path().join("Projects")).unwrap();
        fs::create_dir_all(source.path().join("Empty")).unwrap();
        for number in 0..count {
            let folder = if number % 2 == 0 { "" } else { "Projects" };
            let path = source
                .path()
                .join(folder)
                .join(format!("Note {number:04}.md"));
            fs::write(&path, format!("# Note {number}\r\n")).unwrap();
            set_modified(
                &path,
                SystemTime::UNIX_EPOCH + Duration::from_secs(1_000 + number as u64),
            );
        }
        Self {
            source,
            place: tempfile::tempdir().unwrap(),
            data: tempfile::tempdir().unwrap(),
        }
    }

    fn target(&self) -> PathBuf {
        self.place.path().join("New Notes")
    }

    fn journals(&self) -> MoveJournals {
        MoveJournals::new(self.data.path().join("notes-moves"))
    }

    fn planned_journal(&self) -> MoveJournal {
        let target = self.target();
        let place = MoveTarget {
            target: &target,
            user_folder: None,
            max_path_units: MAX_TARGET_PATH_UNITS,
        };
        let plan = plan_move(self.source.path(), &place, &TestDisk::default()).unwrap();
        let identity = MoveIdentity {
            location_id: "location-1".to_owned(),
            workspace_id: "workspace-1".to_owned(),
            source: self.source.path().to_path_buf(),
            target,
        };
        let journal = MoveJournal::new(identity, plan);
        self.journals().write(&journal).unwrap();
        journal
    }

    fn run(&self, journal: &mut MoveJournal, disk: &TestDisk) -> Result<(), MoveError> {
        self.run_with(journal, disk, &|_| {})
    }

    fn run_with(
        &self,
        journal: &mut MoveJournal,
        disk: &TestDisk,
        report: &dyn Fn(MoveProgress),
    ) -> Result<(), MoveError> {
        let journals = self.journals();
        let stop = AtomicBool::new(false);
        let run = MoveRun {
            file_system: disk,
            stop: &stop,
            save: &|journal| journals.write(journal),
            report,
        };
        run_move(journal, &run)
    }

    fn saved_journal(&self) -> MoveJournal {
        self.journals().read("location-1").unwrap().unwrap()
    }
}

fn set_modified(path: &Path, time: SystemTime) {
    File::options()
        .write(true)
        .open(path)
        .unwrap()
        .set_modified(time)
        .unwrap();
}

/// Every file below a folder with its bytes and modified time.
fn snapshot(root: &Path) -> Vec<(PathBuf, Vec<u8>, SystemTime)> {
    let mut files = Vec::new();
    let mut folders = vec![root.to_path_buf()];
    while let Some(folder) = folders.pop() {
        for entry in fs::read_dir(&folder).unwrap().map(Result::unwrap) {
            let path = entry.path();
            if path.is_dir() {
                folders.push(path);
            } else {
                let modified = entry.metadata().unwrap().modified().unwrap();
                let relative = path.strip_prefix(root).unwrap().to_path_buf();
                files.push((relative, fs::read(&path).unwrap(), modified));
            }
        }
    }
    files.sort();
    files
}

fn folders_below(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut folders = vec![root.to_path_buf()];
    while let Some(folder) = folders.pop() {
        for entry in fs::read_dir(&folder).unwrap().map(Result::unwrap) {
            if entry.path().is_dir() {
                found.push(entry.path().strip_prefix(root).unwrap().to_path_buf());
                folders.push(entry.path());
            }
        }
    }
    found.sort();
    found
}

#[test]
fn copied_bytes_and_times_equal_the_source() {
    let setup = MoveSetup::with_notes(5);
    let mut journal = setup.planned_journal();

    setup.run(&mut journal, &TestDisk::default()).unwrap();

    assert_eq!(snapshot(&setup.target()), snapshot(setup.source.path()));
    assert_eq!(
        folders_below(&setup.target()),
        folders_below(setup.source.path())
    );
    assert_eq!(journal.state, MoveState::Verified);
    assert_eq!(setup.saved_journal(), journal);
}

#[test]
fn a_hash_mismatch_stops_before_switching() {
    let setup = MoveSetup::with_notes(3);
    let mut journal = setup.planned_journal();
    let disk = TestDisk::default();
    let corrupted = setup.target().join("Note 0000.md");
    let corrupting = |progress: MoveProgress| {
        if progress.phase == MovePhase::Verifying && progress.done_files == 0 {
            let modified = fs::metadata(&corrupted).unwrap().modified().unwrap();
            fs::write(&corrupted, "# Note X\r\n").unwrap();
            set_modified(&corrupted, modified);
        }
    };

    let failure = setup.run_with(&mut journal, &disk, &corrupting);

    assert_eq!(
        failure,
        Err(MoveError::HashMismatch {
            path: "Note 0000.md".to_owned()
        })
    );
    assert_eq!(setup.saved_journal().state, MoveState::Copying);
    assert_eq!(
        check_switchable(&setup.saved_journal()),
        Err(MoveError::WrongState)
    );
}

#[test]
fn a_source_changed_during_the_move_is_recopied() {
    let setup = MoveSetup::with_notes(3);
    let mut journal = setup.planned_journal();
    let edited = setup.source.path().join("Note 0000.md");
    let has_edited = AtomicBool::new(false);
    let editing = |progress: MoveProgress| {
        if progress.phase == MovePhase::Verifying && !has_edited.swap(true, Ordering::SeqCst) {
            fs::write(&edited, "# Note 0, edited elsewhere\r\n").unwrap();
        }
    };

    setup
        .run_with(&mut journal, &TestDisk::default(), &editing)
        .unwrap();

    assert_eq!(
        fs::read_to_string(setup.target().join("Note 0000.md")).unwrap(),
        "# Note 0, edited elsewhere\r\n"
    );
    assert_eq!(snapshot(&setup.target()), snapshot(setup.source.path()));
    assert_eq!(journal.state, MoveState::Verified);
}

#[test]
fn notes_added_and_removed_elsewhere_during_the_move_are_followed() {
    let setup = MoveSetup::with_notes(3);
    let mut journal = setup.planned_journal();
    let source = setup.source.path().to_path_buf();
    let has_changed = AtomicBool::new(false);
    let changing = |progress: MoveProgress| {
        if progress.phase == MovePhase::Verifying && !has_changed.swap(true, Ordering::SeqCst) {
            fs::write(source.join("Projects").join("Added.md"), "# Added").unwrap();
            fs::remove_file(source.join("Note 0002.md")).unwrap();
        }
    };

    setup
        .run_with(&mut journal, &TestDisk::default(), &changing)
        .unwrap();

    assert_eq!(snapshot(&setup.target()), snapshot(setup.source.path()));
    assert_eq!(journal.files.len(), 3);
}

#[test]
fn the_journal_is_written_atomically_at_each_state() {
    let setup = MoveSetup::with_notes(250);
    let mut journal = setup.planned_journal();
    let journals = setup.journals();
    let saved_states = RefCell::new(vec![setup.saved_journal().state]);
    let stop = AtomicBool::new(false);
    let save = |journal: &MoveJournal| {
        journals.write(journal)?;
        let on_disk = journals.read("location-1")?.unwrap();
        let mut states = saved_states.borrow_mut();
        if states.last() != Some(&on_disk.state) {
            states.push(on_disk.state);
        }
        Ok(())
    };
    let disk = TestDisk::default();
    let run = MoveRun {
        file_system: &disk,
        stop: &stop,
        save: &save,
        report: &|_| {},
    };

    run_move(&mut journal, &run).unwrap();

    assert_eq!(
        *saved_states.borrow(),
        [MoveState::Planned, MoveState::Copying, MoveState::Verified]
    );
    let leftovers: Vec<_> = fs::read_dir(setup.data.path().join("notes-moves"))
        .unwrap()
        .map(|entry| entry.unwrap().file_name())
        .collect();
    assert_eq!(leftovers, ["location-1.json"]);
}

#[test]
fn switch_happens_only_in_the_verified_state() {
    let setup = MoveSetup::with_notes(2);
    let mut journal = setup.planned_journal();

    assert_eq!(check_switchable(&journal), Err(MoveError::WrongState));
    setup.run(&mut journal, &TestDisk::default()).unwrap();
    assert_eq!(check_switchable(&journal), Ok(()));
    journal.state = MoveState::Switched;
    assert_eq!(check_switchable(&journal), Err(MoveError::WrongState));
}

#[test]
fn a_failure_leaves_every_old_file_unchanged() {
    let setup = MoveSetup::with_notes(6);
    let before = snapshot(setup.source.path());
    let mut journal = setup.planned_journal();
    let full_halfway = TestDisk {
        full_after_copies: Some(3),
        ..TestDisk::default()
    };

    let failure = setup.run(&mut journal, &full_halfway);

    assert!(
        matches!(failure, Err(MoveError::DiskFull { .. })),
        "{failure:?}"
    );
    assert_eq!(snapshot(setup.source.path()), before);
    let saved = setup.saved_journal();
    assert_eq!(saved.state, MoveState::Copying);
    assert_eq!(saved.failure, failure.err());
    assert!(
        !snapshot(&setup.target())
            .iter()
            .any(|(path, _, _)| { path.to_string_lossy().ends_with(".mdx-saving") })
    );
}

#[test]
fn a_full_disk_can_be_resumed_once_there_is_room() {
    let setup = MoveSetup::with_notes(6);
    let mut journal = setup.planned_journal();
    let full_halfway = TestDisk {
        full_after_copies: Some(3),
        ..TestDisk::default()
    };
    let _ = setup.run(&mut journal, &full_halfway);
    let mut resumed = setup.saved_journal();
    let roomy = TestDisk::default();

    setup.run(&mut resumed, &roomy).unwrap();

    assert_eq!(roomy.created_copies.load(Ordering::SeqCst), 3);
    assert_eq!(snapshot(&setup.target()), snapshot(setup.source.path()));
    assert_eq!(resumed.failure, None);
}

#[test]
fn resume_copies_only_the_remaining_files() {
    let setup = MoveSetup::with_notes(250);
    let mut journal = setup.planned_journal();
    let journals = setup.journals();
    let has_crashed = AtomicBool::new(false);
    let crashing_disk = TestDisk {
        full_after_copies: Some(150),
        ..TestDisk::default()
    };
    let save_until_crash = |journal: &MoveJournal| {
        if crashing_disk.created_copies.load(Ordering::SeqCst) > 150 {
            has_crashed.store(true, Ordering::SeqCst);
            return Ok(());
        }
        journals.write(journal)
    };
    let stop = AtomicBool::new(false);
    let crashing_run = MoveRun {
        file_system: &crashing_disk,
        stop: &stop,
        save: &save_until_crash,
        report: &|_| {},
    };
    let _ = run_move(&mut journal, &crashing_run);
    let mut after_restart = setup.saved_journal();
    let resumed_disk = TestDisk::default();

    setup.run(&mut after_restart, &resumed_disk).unwrap();

    assert!(has_crashed.load(Ordering::SeqCst));
    assert_eq!(resumed_disk.created_copies.load(Ordering::SeqCst), 150);
    assert_eq!(snapshot(&setup.target()), snapshot(setup.source.path()));
}

#[test]
fn resume_after_verifying_checks_size_and_time_without_copying_again() {
    let setup = MoveSetup::with_notes(4);
    let mut journal = setup.planned_journal();
    setup.run(&mut journal, &TestDisk::default()).unwrap();
    let again = TestDisk::default();

    setup.run(&mut journal, &again).unwrap();

    assert_eq!(again.created_copies.load(Ordering::SeqCst), 0);
    assert_eq!(journal.state, MoveState::Verified);
}

#[test]
fn a_stopped_move_keeps_its_journal_for_resume_or_cancel() {
    let setup = MoveSetup::with_notes(4);
    let mut journal = setup.planned_journal();
    let journals = setup.journals();
    let stop = AtomicBool::new(true);
    let disk = TestDisk::default();
    let run = MoveRun {
        file_system: &disk,
        stop: &stop,
        save: &|journal| journals.write(journal),
        report: &|_| {},
    };

    let stopped = run_move(&mut journal, &run);

    assert_eq!(stopped, Err(MoveError::Stopped));
    assert_eq!(setup.saved_journal().failure, Some(MoveError::Stopped));
}

#[test]
fn a_file_put_in_the_new_folder_by_another_program_stops_the_move() {
    let setup = MoveSetup::with_notes(2);
    let mut journal = setup.planned_journal();
    let stranger = setup.target().join("Stranger.md");
    let adding = |progress: MoveProgress| {
        if progress.phase == MovePhase::Verifying && !stranger.exists() {
            fs::write(&stranger, "not the move's").unwrap();
        }
    };

    let failure = setup.run_with(&mut journal, &TestDisk::default(), &adding);

    assert_eq!(
        failure,
        Err(MoveError::CountMismatch {
            expected: 2,
            found: 3
        })
    );
    assert!(stranger.exists());
}

#[test]
fn a_target_that_filled_up_after_planning_is_refused() {
    let setup = MoveSetup::with_notes(2);
    let mut journal = setup.planned_journal();
    fs::create_dir_all(setup.target()).unwrap();
    fs::write(setup.target().join("Other.md"), "other").unwrap();

    let failure = setup.run(&mut journal, &TestDisk::default());

    assert_eq!(failure, Err(MoveError::TargetNotEmpty));
    assert_eq!(
        fs::read_to_string(setup.target().join("Other.md")).unwrap(),
        "other"
    );
}

#[cfg(windows)]
#[test]
fn a_locked_file_stops_the_move_and_names_it() {
    use std::os::windows::fs::OpenOptionsExt;
    let setup = MoveSetup::with_notes(3);
    let mut journal = setup.planned_journal();
    let _locked = File::options()
        .read(true)
        .share_mode(0)
        .open(setup.source.path().join("Note 0002.md"))
        .unwrap();

    let failure = setup.run(&mut journal, &TestDisk::default());

    assert_eq!(
        failure,
        Err(MoveError::FileLocked {
            path: "Note 0002.md".to_owned()
        })
    );
}

#[test]
fn cancel_removes_only_journal_created_files_and_folders() {
    let setup = MoveSetup::with_notes(4);
    let mut journal = setup.planned_journal();
    let _ = setup.run(
        &mut journal,
        &TestDisk {
            full_after_copies: Some(3),
            ..TestDisk::default()
        },
    );
    fs::write(setup.target().join("Projects").join("Mine.md"), "mine").unwrap();
    let journal = setup.saved_journal();

    let kept = cancel_move(&journal).unwrap();

    assert_eq!(kept, KeptFiles::default());
    assert_eq!(folders_below(&setup.target()), [PathBuf::from("Projects")]);
    assert_eq!(
        snapshot(&setup.target())
            .into_iter()
            .map(|(path, _, _)| path)
            .collect::<Vec<_>>(),
        [Path::new("Projects").join("Mine.md")]
    );
}

#[test]
fn cancel_keeps_and_lists_a_copy_changed_since_the_move_made_it() {
    let setup = MoveSetup::with_notes(2);
    let mut journal = setup.planned_journal();
    let _ = setup.run(&mut journal, &TestDisk::default());
    fs::write(
        setup.target().join("Note 0000.md"),
        "edited in the new folder",
    )
    .unwrap();

    let kept = cancel_move(&journal).unwrap();

    assert_eq!(kept.paths, ["Note 0000.md"]);
    assert!(setup.target().join("Note 0000.md").exists());
    assert!(!setup.target().join("Projects").exists());
}

#[test]
fn cancel_removes_a_new_folder_it_made() {
    let setup = MoveSetup::with_notes(2);
    let mut journal = setup.planned_journal();
    setup.run(&mut journal, &TestDisk::default()).unwrap();

    cancel_move(&journal).unwrap();

    assert!(!setup.target().exists());
}

#[test]
fn cancel_never_touches_the_source() {
    let setup = MoveSetup::with_notes(5);
    let before = snapshot(setup.source.path());
    let source_folders = folders_below(setup.source.path());
    let mut journal = setup.planned_journal();
    setup.run(&mut journal, &TestDisk::default()).unwrap();

    cancel_move(&journal).unwrap();

    assert_eq!(snapshot(setup.source.path()), before);
    assert_eq!(folders_below(setup.source.path()), source_folders);
}

#[test]
fn cancel_after_the_switch_is_refused() {
    let setup = MoveSetup::with_notes(2);
    let mut journal = setup.planned_journal();
    setup.run(&mut journal, &TestDisk::default()).unwrap();
    journal.state = MoveState::Switched;

    assert_eq!(cancel_move(&journal), Err(MoveError::WrongState));
    assert_eq!(snapshot(&setup.target()), snapshot(setup.source.path()));
}

/// Records what it was asked to recycle and deletes it, as the Recycle Bin takes it away.
#[derive(Default)]
struct FakeRecycleBin {
    is_missing: bool,
    /// Stands in for a shell that cannot be started.
    is_broken: bool,
    /// Fails from this call on, counting from zero, as a shell that stops part way.
    fails_from_call: Option<usize>,
    calls: AtomicUsize,
    /// Files the Recycle Bin leaves where they are, as one in use by another program.
    refused_names: Vec<&'static str>,
    capacity_bytes: Option<u64>,
    recycled: Mutex<Vec<PathBuf>>,
}

impl crate::platform::RecycleBin for FakeRecycleBin {
    fn capacity_for(&self, _folder: &Path) -> Option<u64> {
        (!self.is_missing).then_some(self.capacity_bytes.unwrap_or(u64::MAX))
    }

    fn recycle(&self, paths: &[PathBuf]) -> io::Result<Vec<PathBuf>> {
        let call = self.calls.fetch_add(1, Ordering::SeqCst);
        if self.is_broken || self.fails_from_call.is_some_and(|first| call >= first) {
            return Err(io::Error::other("the shell is not registered"));
        }
        let (refused, taken): (Vec<PathBuf>, Vec<PathBuf>) =
            paths.iter().cloned().partition(|path| {
                path.file_name()
                    .is_some_and(|name| self.refused_names.iter().any(|refused| name == *refused))
            });
        for path in &taken {
            fs::remove_file(path)?;
        }
        self.recycled.lock().unwrap().extend(taken);
        Ok(refused)
    }
}

fn switched_move(setup: &MoveSetup) -> MoveJournal {
    let mut journal = setup.planned_journal();
    setup.run(&mut journal, &TestDisk::default()).unwrap();
    journal.state = MoveState::Switched;
    journal
}

#[test]
fn only_matching_files_are_recycled() {
    let setup = MoveSetup::with_notes(4);
    let journal = switched_move(&setup);
    let recycle_bin = FakeRecycleBin::default();

    let removal = remove_old_copy(&journal, &recycle_bin, &TestDisk::default()).unwrap();

    assert_eq!(removal.recycled_count, 4);
    assert_eq!(recycle_bin.recycled.lock().unwrap().len(), 4);
    assert!(!setup.source.path().exists());
    assert_eq!(snapshot(&setup.target()).len(), 4);
}

#[test]
fn a_changed_file_is_kept_and_listed() {
    let setup = MoveSetup::with_notes(4);
    let journal = switched_move(&setup);
    fs::write(
        setup.source.path().join("Note 0000.md"),
        "# Note 0, edited after the move",
    )
    .unwrap();
    fs::write(setup.source.path().join("Projects").join("New.md"), "# New").unwrap();

    let removal =
        remove_old_copy(&journal, &FakeRecycleBin::default(), &TestDisk::default()).unwrap();

    assert_eq!(removal.recycled_count, 3);
    assert_eq!(removal.kept.paths, ["Note 0000.md", "Projects/New.md"]);
    assert!(setup.source.path().join("Note 0000.md").exists());
    assert!(setup.source.path().join("Projects").join("New.md").exists());
    assert!(!setup.source.path().join("Empty").exists());
}

#[test]
fn no_recycle_bin_keeps_everything() {
    let setup = MoveSetup::with_notes(3);
    let journal = switched_move(&setup);
    let before = snapshot(setup.source.path());
    let no_recycle_bin = FakeRecycleBin {
        is_missing: true,
        ..FakeRecycleBin::default()
    };

    let removal = remove_old_copy(&journal, &no_recycle_bin, &TestDisk::default()).unwrap();

    assert!(removal.has_no_recycle_bin);
    assert_eq!(removal.recycled_count, 0);
    assert_eq!(snapshot(setup.source.path()), before);
}

#[test]
fn the_old_copy_is_removed_only_after_the_switch() {
    let setup = MoveSetup::with_notes(2);
    let mut journal = setup.planned_journal();
    setup.run(&mut journal, &TestDisk::default()).unwrap();

    let refusal = remove_old_copy(&journal, &FakeRecycleBin::default(), &TestDisk::default());

    assert_eq!(refusal, Err(MoveError::WrongState));
    assert_eq!(snapshot(setup.source.path()).len(), 2);
}

/// Gives the file other bytes of the same length and puts its modified time back.
fn change_bytes_keeping_size_and_time(path: &Path) {
    let modified = fs::metadata(path).unwrap().modified().unwrap();
    let mut bytes = fs::read(path).unwrap();
    bytes.reverse();
    fs::write(path, bytes).unwrap();
    set_modified(path, modified);
}

#[test]
fn a_drive_that_rounds_times_still_verifies_resumes_and_cancels() {
    let setup = MoveSetup::with_notes(4);
    let mut journal = setup.planned_journal();
    let rounding = TestDisk {
        rounds_times: true,
        ..TestDisk::default()
    };

    setup.run(&mut journal, &rounding).unwrap();
    let again = TestDisk {
        rounds_times: true,
        ..TestDisk::default()
    };
    setup.run(&mut journal, &again).unwrap();
    let kept = cancel_move(&journal).unwrap();

    assert_eq!(again.created_copies.load(Ordering::SeqCst), 0);
    assert_eq!(kept, KeptFiles::default());
    assert!(!setup.target().exists());
}

#[test]
fn a_copy_with_other_bytes_of_the_same_size_and_time_is_kept_by_cancel() {
    let setup = MoveSetup::with_notes(2);
    let mut journal = setup.planned_journal();
    setup.run(&mut journal, &TestDisk::default()).unwrap();
    change_bytes_keeping_size_and_time(&setup.target().join("Note 0000.md"));

    let kept = cancel_move(&journal).unwrap();

    assert_eq!(kept.paths, ["Note 0000.md"]);
    assert!(setup.target().join("Note 0000.md").exists());
}

#[test]
fn an_old_file_with_other_bytes_of_the_same_size_and_time_is_kept() {
    let setup = MoveSetup::with_notes(2);
    let journal = switched_move(&setup);
    change_bytes_keeping_size_and_time(&setup.source.path().join("Note 0000.md"));

    let removal =
        remove_old_copy(&journal, &FakeRecycleBin::default(), &TestDisk::default()).unwrap();

    assert_eq!(removal.recycled_count, 1);
    assert_eq!(removal.kept.paths, ["Note 0000.md"]);
}

#[test]
fn an_old_file_whose_new_copy_changed_or_went_is_kept() {
    let setup = MoveSetup::with_notes(3);
    let journal = switched_move(&setup);
    fs::remove_file(setup.target().join("Note 0000.md")).unwrap();
    change_bytes_keeping_size_and_time(&setup.target().join("Note 0002.md"));

    let removal =
        remove_old_copy(&journal, &FakeRecycleBin::default(), &TestDisk::default()).unwrap();

    assert_eq!(removal.kept.paths, ["Note 0000.md", "Note 0002.md"]);
    assert!(setup.source.path().join("Note 0000.md").exists());
}

#[test]
fn old_files_beyond_what_the_recycle_bin_holds_are_kept() {
    let setup = MoveSetup::with_notes(3);
    let journal = switched_move(&setup);
    let first_size = journal.files.first().unwrap().size;
    let small_bin = FakeRecycleBin {
        capacity_bytes: Some(first_size),
        ..FakeRecycleBin::default()
    };

    let removal = remove_old_copy(&journal, &small_bin, &TestDisk::default()).unwrap();

    assert_eq!(removal.recycled_count, 1);
    assert_eq!(removal.kept.count, 2);
}

#[test]
fn an_old_file_with_a_path_the_shell_cannot_take_is_kept() {
    let setup = MoveSetup::with_notes(1);
    let long_name = format!("{}.md", "n".repeat(240));
    fs::write(setup.source.path().join(&long_name), "# Long").unwrap();
    let journal = switched_move(&setup);

    let removal =
        remove_old_copy(&journal, &FakeRecycleBin::default(), &TestDisk::default()).unwrap();

    assert_eq!(removal.kept.paths, [long_name]);
    assert_eq!(removal.recycled_count, 1);
}

#[test]
fn resume_succeeds_after_a_crash_in_a_file_that_was_then_deleted() {
    let setup = MoveSetup::with_notes(4);
    let mut journal = setup.planned_journal();
    let full = TestDisk {
        full_after_copies: Some(2),
        ..TestDisk::default()
    };
    let _ = setup.run(&mut journal, &full);
    let crashed_in = setup
        .target()
        .join("Projects")
        .join("Note 0001.md.mdx-moving");
    fs::write(&crashed_in, "# Note 1, half").unwrap();
    fs::remove_file(setup.source.path().join("Projects").join("Note 0001.md")).unwrap();
    let mut resumed = setup.saved_journal();

    setup.run(&mut resumed, &TestDisk::default()).unwrap();

    assert!(!crashed_in.exists());
    assert_eq!(snapshot(&setup.target()), snapshot(setup.source.path()));
    assert_eq!(resumed.files.len(), 3);
}

#[test]
fn a_pending_copy_left_in_the_notes_folder_is_never_copied() {
    let setup = MoveSetup::with_notes(2);
    fs::write(setup.source.path().join("Plan.md.mdx-moving"), "left over").unwrap();

    let journal = setup.planned_journal();

    assert!(
        journal
            .files
            .iter()
            .all(|file| !file.path.ends_with(".mdx-moving"))
    );
    assert_eq!(journal.files.len(), 2);
}

#[test]
fn a_file_still_there_after_recycling_is_kept_and_listed() {
    let setup = MoveSetup::with_notes(3);
    let journal = switched_move(&setup);
    let holding_one = FakeRecycleBin {
        refused_names: vec!["Note 0002.md"],
        ..FakeRecycleBin::default()
    };

    let removal = remove_old_copy(&journal, &holding_one, &TestDisk::default()).unwrap();

    assert_eq!(removal.recycled_count, 2);
    assert_eq!(removal.kept.paths, ["Note 0002.md"]);
    assert!(setup.source.path().join("Note 0002.md").exists());
}

#[test]
fn a_broken_shell_is_reported_and_keeps_everything() {
    let setup = MoveSetup::with_notes(3);
    let journal = switched_move(&setup);
    let before = snapshot(setup.source.path());
    let broken = FakeRecycleBin {
        is_broken: true,
        ..FakeRecycleBin::default()
    };

    let failure = remove_old_copy(&journal, &broken, &TestDisk::default());

    assert_eq!(failure, Err(MoveError::RecycleFailed));
    assert_eq!(snapshot(setup.source.path()), before);
}

#[test]
fn a_later_batch_failing_keeps_it_and_reports_the_earlier_ones() {
    let setup = MoveSetup::with_notes(250);
    let journal = switched_move(&setup);
    let failing_later = FakeRecycleBin {
        fails_from_call: Some(1),
        ..FakeRecycleBin::default()
    };

    let removal = remove_old_copy(&journal, &failing_later, &TestDisk::default()).unwrap();

    assert_eq!(removal.recycled_count, 200);
    assert_eq!(removal.kept.count, 50);
    assert_eq!(snapshot(setup.source.path()).len(), 50);
}
