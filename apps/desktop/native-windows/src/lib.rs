//! The Windows calls MDX - Markdown Explorer makes that need `unsafe` code, each behind a safe
//! function that reports failures as `std::io::Error` and never panics. The app crate itself
//! forbids `unsafe` code.

#[cfg(windows)]
mod clipboard;
#[cfg(windows)]
mod com_error;
#[cfg(windows)]
mod file_links;
#[cfg(windows)]
mod jump_list;
#[cfg(windows)]
mod private_clipboard;
#[cfg(windows)]
mod recycle_bin;
#[cfg(windows)]
mod registry;
#[cfg(windows)]
mod session_events;
#[cfg(windows)]
mod volumes;

#[cfg(windows)]
pub use clipboard::read_clipboard_text;
#[cfg(windows)]
pub use file_links::link_count_of;
#[cfg(windows)]
pub use jump_list::{JumpListEntry, JumpListOutcome, JumpListUpdate, show_jump_list_category};
#[cfg(windows)]
pub use private_clipboard::{ClipboardCopy, clear_clipboard_if_still, copy_text_outside_history};
#[cfg(windows)]
pub use recycle_bin::move_to_recycle_bin;
#[cfg(windows)]
pub use registry::{RegistryRoot, read_registry_number};
#[cfg(windows)]
pub use session_events::{ShellEvent, ShellEventWatcher, watch_shell_events};
#[cfg(windows)]
pub use volumes::volume_name_of;
