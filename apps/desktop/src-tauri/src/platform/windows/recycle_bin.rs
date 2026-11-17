use std::io;
use std::path::{Component, Path, PathBuf, Prefix};

use mdx_native_windows::{RegistryRoot, read_registry_number, volume_name_of};

const BIT_BUCKET_VOLUMES: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\BitBucket\Volume";
const EXPLORER_POLICIES: &str = r"Software\Microsoft\Windows\CurrentVersion\Policies\Explorer";
const BYTES_PER_MEGABYTE: u64 = 1024 * 1024;

/// Windows keeps a volume's Recycle Bin settings once they were first used or changed; until then
/// its default bin takes up to this share of the volume.
const DEFAULT_CAPACITY_PERCENT: u64 = 5;

/// A volume's own Recycle Bin settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct BinSettings {
    deletes_at_once: bool,
    capacity_megabytes: Option<u32>,
}

/// How many bytes the Recycle Bin of the folder's drive holds; `None` when files there would be
/// deleted outright: a network share, recycling turned off by policy, or a drive set to delete at
/// once. The removal keeps any file beyond this, so the shell never deletes one for good.
pub fn recycle_bin_capacity(folder: &Path) -> Option<u64> {
    let drive = std::fs::canonicalize(folder)
        .ok()
        .and_then(|resolved| drive_letter_of(&resolved))?;
    let has_bin_folder = Path::new(&format!(r"{drive}:\$Recycle.Bin")).is_dir();
    if !has_bin_folder {
        return None;
    }
    let volume_id = volume_name_of(&format!(r"{drive}:\"))
        .ok()
        .and_then(|volume_name| volume_id_in(&volume_name))?;
    capacity_from(
        is_recycling_turned_off_by_policy(),
        bin_settings_of(&volume_id)?,
        fs4::total_space(folder).ok(),
    )
}

fn capacity_from(
    is_turned_off: bool,
    settings: Option<BinSettings>,
    volume_bytes: Option<u64>,
) -> Option<u64> {
    if is_turned_off || settings.is_some_and(|settings| settings.deletes_at_once) {
        return None;
    }
    match settings.and_then(|settings| settings.capacity_megabytes) {
        Some(megabytes) => Some(u64::from(megabytes) * BYTES_PER_MEGABYTE),
        None => volume_bytes.map(|bytes| bytes / 100 * DEFAULT_CAPACITY_PERCENT),
    }
}

/// The volume's own settings, which are absent until they were first used or changed; `None` when
/// they cannot be read, so nothing is recycled on a guess.
fn bin_settings_of(volume_id: &str) -> Option<Option<BinSettings>> {
    let key = format!(r"{BIT_BUCKET_VOLUMES}\{volume_id}");
    let read = |value| read_registry_number(RegistryRoot::CurrentUser, &key, value).ok();
    let nuke_on_delete = read("NukeOnDelete")?;
    let max_capacity = read("MaxCapacity")?;
    if nuke_on_delete.is_none() && max_capacity.is_none() {
        return Some(None);
    }
    Some(Some(BinSettings {
        deletes_at_once: nuke_on_delete.unwrap_or(0) != 0,
        capacity_megabytes: max_capacity,
    }))
}

/// A policy value that cannot be read counts as turning recycling off.
fn is_recycling_turned_off_by_policy() -> bool {
    [RegistryRoot::CurrentUser, RegistryRoot::LocalMachine]
        .into_iter()
        .any(|root| {
            read_registry_number(root, EXPLORER_POLICIES, "NoRecycleFiles")
                .map_or(true, |value| value.is_some_and(|value| value != 0))
        })
}

/// The `{…}` part of a volume name such as `\\?\Volume{…}\`, which its Recycle Bin settings are kept under.
fn volume_id_in(volume_name: &str) -> Option<String> {
    let start = volume_name.find('{')?;
    let end = start + volume_name.get(start..)?.find('}')?;
    volume_name.get(start..=end).map(str::to_owned)
}

/// Mapped network drives resolve to their share, so only a path on a lettered local drive has a letter.
fn drive_letter_of(resolved: &Path) -> Option<char> {
    let Some(Component::Prefix(prefix)) = resolved.components().next() else {
        return None;
    };
    match prefix.kind() {
        Prefix::VerbatimDisk(letter) | Prefix::Disk(letter) => Some(char::from(letter)),
        _ => None,
    }
}

/// Sends the files to the Recycle Bin and returns those still there afterwards.
pub fn move_to_recycle_bin(paths: &[PathBuf]) -> io::Result<Vec<PathBuf>> {
    mdx_native_windows::move_to_recycle_bin(paths)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_network_share_has_no_drive_letter() {
        assert_eq!(
            drive_letter_of(Path::new(r"\\?\UNC\server\share\Notes")),
            None
        );
        assert_eq!(drive_letter_of(Path::new(r"\\server\share\Notes")), None);
    }

    #[test]
    fn a_local_drive_has_its_letter() {
        assert_eq!(drive_letter_of(Path::new(r"\\?\D:\Notes")), Some('D'));
        assert_eq!(drive_letter_of(Path::new(r"C:\Notes")), Some('C'));
    }

    #[test]
    fn a_missing_folder_has_no_recycle_bin() {
        let folder = tempfile::tempdir().unwrap();

        assert_eq!(recycle_bin_capacity(&folder.path().join("missing")), None);
    }

    const GIGABYTE: u64 = 1024 * 1024 * 1024;

    #[test]
    fn a_volume_without_its_own_settings_gets_the_default_bin() {
        assert_eq!(
            capacity_from(false, None, Some(100 * GIGABYTE)),
            Some(5 * GIGABYTE)
        );
        assert_eq!(capacity_from(false, None, None), None);
    }

    #[test]
    fn the_volume_settings_set_the_capacity() {
        let settings = BinSettings {
            deletes_at_once: false,
            capacity_megabytes: Some(2048),
        };

        assert_eq!(
            capacity_from(false, Some(settings), Some(100 * GIGABYTE)),
            Some(2 * GIGABYTE)
        );
    }

    #[test]
    fn deleting_at_once_or_a_policy_keeps_everything() {
        let deletes_at_once = BinSettings {
            deletes_at_once: true,
            capacity_megabytes: Some(2048),
        };

        assert_eq!(
            capacity_from(false, Some(deletes_at_once), Some(GIGABYTE)),
            None
        );
        assert_eq!(capacity_from(true, None, Some(GIGABYTE)), None);
    }

    #[test]
    fn reads_the_id_from_a_volume_name() {
        let volume_name = r"\\?\Volume{a91c156e-2914-4ab6-b32d-c052e7151ca0}\";

        assert_eq!(
            volume_id_in(volume_name).as_deref(),
            Some("{a91c156e-2914-4ab6-b32d-c052e7151ca0}")
        );
        assert_eq!(volume_id_in("not a volume"), None);
    }

    #[test]
    fn the_system_drive_reports_a_capacity_or_none_without_failing() {
        let folder = tempfile::tempdir().unwrap();

        let capacity = recycle_bin_capacity(folder.path());

        assert!(capacity.is_none_or(|bytes| bytes > 0));
    }
}
