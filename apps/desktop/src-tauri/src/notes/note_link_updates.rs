use std::fs;
use std::path::PathBuf;

use serde::Serialize;

use super::note_files::{NotesRoot, require_note};
use crate::documents::write_bytes_atomically;
use crate::notes_index::{
    NotUpdatedNote, NotUpdatedReason, NoteLinkEdits, content_hash_of, with_edits_made,
};

/// What applying link edits did, with the edits that put every changed note back.
#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedLinkUpdates {
    pub updated_notes: usize,
    pub updated_links: usize,
    pub not_updated: Vec<NotUpdatedNote>,
    /// For each changed note, at the path it has once the rename is undone.
    pub undo: Vec<NoteLinkEdits>,
}

/// Changes only the planned link targets of each note, writing each note whole or not at all.
/// A note whose bytes changed since the plan is left as it is and reported.
pub fn apply_link_updates(root: &NotesRoot, notes: &[NoteLinkEdits]) -> AppliedLinkUpdates {
    let mut applied = AppliedLinkUpdates::default();
    for note in notes {
        match apply_to_note(root, note) {
            Ok(undo) => {
                applied.updated_notes += 1;
                applied.updated_links += note.edits.len();
                applied.undo.push(undo);
            }
            Err(reason) => applied.not_updated.push(NotUpdatedNote {
                path: note.path.clone(),
                reason,
            }),
        }
    }
    applied
}

fn apply_to_note(
    root: &NotesRoot,
    note: &NoteLinkEdits,
) -> Result<NoteLinkEdits, NotUpdatedReason> {
    let path = note_inside(root, &note.path).ok_or(NotUpdatedReason::Unavailable)?;
    let bytes = fs::read(&path).map_err(|_| NotUpdatedReason::Unavailable)?;
    if content_hash_of(&bytes) != note.content_hash {
        return Err(NotUpdatedReason::ChangedSincePlanned);
    }
    let (edited, undo_edits) =
        with_edits_made(&bytes, &note.edits).ok_or(NotUpdatedReason::ChangedSincePlanned)?;
    write_bytes_atomically(&path, &edited).map_err(|_| NotUpdatedReason::Unavailable)?;
    Ok(NoteLinkEdits {
        path: note.path_once_undone.clone(),
        path_once_undone: note.path.clone(),
        content_hash: content_hash_of(&edited),
        edits: undo_edits,
    })
}

/// A note named by its path inside the location, with `/` between its parts.
fn note_inside(root: &NotesRoot, relative: &str) -> Option<PathBuf> {
    let mut path = root.folder().to_path_buf();
    path.extend(relative.split('/'));
    let resolved = root.resolve_inside(&path).ok()?;
    require_note(&resolved).ok()?;
    Some(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes_index::LinkEdit;

    struct Location {
        _folder: tempfile::TempDir,
        root: NotesRoot,
    }

    impl Location {
        fn with(notes: &[(&str, &[u8])]) -> Self {
            let folder = tempfile::tempdir().unwrap();
            for (path, bytes) in notes {
                let file = folder.path().join(path);
                fs::create_dir_all(file.parent().unwrap()).unwrap();
                fs::write(file, bytes).unwrap();
            }
            let root = NotesRoot::new(folder.path()).unwrap();
            Self {
                _folder: folder,
                root,
            }
        }

        fn bytes_of(&self, path: &str) -> Vec<u8> {
            fs::read(self.root.folder().join(path)).unwrap()
        }
    }

    fn rename_edits(path: &str, bytes: &[u8], start: usize) -> NoteLinkEdits {
        NoteLinkEdits {
            path: path.to_owned(),
            path_once_undone: path.to_owned(),
            content_hash: content_hash_of(bytes),
            edits: vec![LinkEdit {
                start,
                end: start + "Draft".len(),
                before: "Draft".to_owned(),
                after: "Plan".to_owned(),
            }],
        }
    }

    #[test]
    fn applying_and_undoing_restores_every_byte() {
        let original = b"\xEF\xBB\xBF# Inbox\r\n\r\nSee [[Draft]] today.\r\n";
        let location = Location::with(&[("Projects/Inbox.md", original)]);

        let applied = apply_link_updates(
            &location.root,
            &[rename_edits("Projects/Inbox.md", original, 20)],
        );

        assert_eq!(
            location.bytes_of("Projects/Inbox.md"),
            b"\xEF\xBB\xBF# Inbox\r\n\r\nSee [[Plan]] today.\r\n"
        );
        assert_eq!((applied.updated_notes, applied.updated_links), (1, 1));
        let undone = apply_link_updates(&location.root, &applied.undo);
        assert_eq!(location.bytes_of("Projects/Inbox.md"), original);
        assert_eq!(undone.updated_links, 1);
    }

    #[test]
    fn a_note_changed_since_the_plan_is_left_as_it_is() {
        let planned_on = b"See [[Draft]].\n";
        let location = Location::with(&[("Inbox.md", b"See [[Draft]]. And more.\n")]);

        let applied =
            apply_link_updates(&location.root, &[rename_edits("Inbox.md", planned_on, 6)]);

        assert_eq!(location.bytes_of("Inbox.md"), b"See [[Draft]]. And more.\n");
        assert_eq!(
            applied.not_updated,
            vec![NotUpdatedNote {
                path: "Inbox.md".to_owned(),
                reason: NotUpdatedReason::ChangedSincePlanned
            }]
        );
        assert!(applied.undo.is_empty());
    }

    #[test]
    fn an_edit_whose_bytes_are_not_the_planned_target_is_refused() {
        let bytes = b"See [[Draft]].\n";
        let location = Location::with(&[("Inbox.md", bytes)]);

        let applied = apply_link_updates(&location.root, &[rename_edits("Inbox.md", bytes, 2)]);

        assert_eq!(location.bytes_of("Inbox.md"), bytes);
        assert_eq!(applied.not_updated.len(), 1);
    }

    #[test]
    fn notes_outside_the_location_or_in_its_app_folder_are_never_written() {
        let bytes = b"[[Draft]]\n";
        let location =
            Location::with(&[(".mdx-notes/trash/Inbox.md", bytes), ("Inbox.txt", bytes)]);

        let applied = apply_link_updates(
            &location.root,
            &[
                rename_edits(".mdx-notes/trash/Inbox.md", bytes, 2),
                rename_edits("../Inbox.md", bytes, 2),
                rename_edits("Inbox.txt", bytes, 2),
            ],
        );

        assert_eq!(applied.updated_notes, 0);
        assert!(
            applied
                .not_updated
                .iter()
                .all(|note| note.reason == NotUpdatedReason::Unavailable)
        );
        assert_eq!(location.bytes_of(".mdx-notes/trash/Inbox.md"), bytes);
    }
}
