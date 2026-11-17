//! The Windows calls MDX - Markdown Explorer makes that need `unsafe` code, each behind a safe
//! function that reports failures as `std::io::Error` and never panics. The app crate itself
//! forbids `unsafe` code.

#[cfg(windows)]
mod com_error;
#[cfg(windows)]
mod recycle_bin;
#[cfg(windows)]
mod registry;
#[cfg(windows)]
mod volumes;

#[cfg(windows)]
pub use recycle_bin::move_to_recycle_bin;
#[cfg(windows)]
pub use registry::{RegistryRoot, read_registry_number};
#[cfg(windows)]
pub use volumes::volume_name_of;
