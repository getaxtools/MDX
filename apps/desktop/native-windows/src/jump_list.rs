use std::ffi::OsStr;
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use std::thread;

use windows::Win32::Foundation::E_ACCESSDENIED;
use windows::Win32::Storage::EnhancedStorage::PKEY_Title;
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE, CoCreateInstance,
    CoInitializeEx, CoTaskMemAlloc, CoUninitialize,
};
use windows::Win32::System::Variant::VT_LPWSTR;
use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{
    DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW, ShellLink,
};
use windows::core::{Interface, PCWSTR, PWSTR};

use crate::com_error::{io_error_of, io_error_of_hresult};

/// The longest arguments a shell link keeps (`INFOTIPSIZE`), and room for a title or tooltip.
const MAX_LINK_TEXT_UNITS: usize = 1_024;
/// The longest program path a shell link takes (`MAX_PATH`), its ending zero included.
const MAX_PROGRAM_PATH_UNITS: usize = 260;

/// One entry of a Jump List category: a link that starts this program with the given arguments.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JumpListEntry {
    /// What the Jump List shows.
    pub title: String,
    /// What the program is started with, such as `--workspace=reading-1`.
    pub arguments: String,
}

/// The category to write and the program its links start.
struct CategoryUpdate<'update> {
    program: &'update Path,
    category: &'update str,
    entries: &'update [JumpListEntry],
}

/// What became of a Jump List update.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JumpListOutcome {
    /// The category now lists the entries the user did not remove.
    Written,
    /// The user's or the policy's privacy setting blocks custom categories: the list was written
    /// with its tasks only, so no entry of an earlier list stays.
    RefusedByPrivacySetting,
}

/// What an update did, and the arguments of the links the user removed from the Jump List, which
/// Windows asks a program not to add again.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JumpListUpdate {
    /// Whether the category was written or a privacy setting refused it.
    pub outcome: JumpListOutcome,
    /// The arguments of each removed link, such as `--workspace=reading-1`.
    pub removed_arguments: Vec<String>,
}

/// Replaces the program's custom Jump List category with these entries, on a thread of its own
/// that sets up COM and takes it down again. Entries the user removed from the Jump List are left
/// out, as Windows asks; an empty list removes the category.
pub fn show_jump_list_category(
    category: &str,
    entries: &[JumpListEntry],
) -> io::Result<JumpListUpdate> {
    let program = std::env::current_exe()?;
    let category = category.to_owned();
    let entries = entries.to_vec();
    thread::Builder::new()
        .name("jump-list".to_owned())
        .spawn(move || {
            write_on_this_thread(&CategoryUpdate {
                program: &program,
                category: &category,
                entries: &entries,
            })
        })?
        .join()
        .map_err(|_| io::Error::other("the Jump List thread stopped"))?
}

fn write_on_this_thread(update: &CategoryUpdate<'_>) -> io::Result<JumpListUpdate> {
    let _com = ApartmentComGuard::start()?;
    // SAFETY: COM is set up on this thread; `DestinationList` is the class id of the
    // `ICustomDestinationList` interface asked for.
    let list: ICustomDestinationList =
        unsafe { CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER) }
            .map_err(|error| io_error_of(&error))?;
    let mut minimum_slots = 0_u32;
    // SAFETY: `list` is a live object of this thread and `minimum_slots` outlives the call.
    let removed: IObjectArray =
        unsafe { list.BeginList(&raw mut minimum_slots) }.map_err(|error| io_error_of(&error))?;
    let removed_arguments = arguments_of_links(&removed);
    match append_category(&list, &removed_arguments, update) {
        Ok(outcome) => {
            // SAFETY: `list` began a list above that was not committed or aborted yet.
            unsafe { list.CommitList() }.map_err(|error| io_error_of(&error))?;
            Ok(JumpListUpdate {
                outcome,
                removed_arguments,
            })
        }
        Err(error) => {
            // SAFETY: as above; aborting leaves the Jump List as it was.
            let _ = unsafe { list.AbortList() };
            Err(error)
        }
    }
}

fn append_category(
    list: &ICustomDestinationList,
    removed_arguments: &[String],
    update: &CategoryUpdate<'_>,
) -> io::Result<JumpListOutcome> {
    let CategoryUpdate {
        program,
        category,
        entries,
    } = *update;
    let kept: Vec<&JumpListEntry> = entries
        .iter()
        .filter(|entry| !removed_arguments.contains(&entry.arguments))
        .collect();
    if kept.is_empty() {
        return Ok(JumpListOutcome::Written);
    }
    let collection = object_collection()?;
    for entry in kept {
        let link = shell_link(program, entry)?;
        // SAFETY: `collection` and `link` are live objects of this thread; the collection keeps
        // its own reference to the link.
        unsafe { collection.AddObject(&link) }.map_err(|error| io_error_of(&error))?;
    }
    let items: IObjectArray = collection.cast().map_err(|error| io_error_of(&error))?;
    let wide_category = wide_with_zero(category);
    // SAFETY: `wide_category` ends with a zero and outlives the call; `items` is a live object of
    // this thread that the list keeps a reference to.
    match unsafe { list.AppendCategory(PCWSTR(wide_category.as_ptr()), &items) } {
        Ok(()) => Ok(JumpListOutcome::Written),
        Err(error) if error.code() == E_ACCESSDENIED => {
            Ok(JumpListOutcome::RefusedByPrivacySetting)
        }
        Err(error) => Err(io_error_of(&error)),
    }
}

/// The arguments of each link in a list; an item that is not a link, or cannot be read, is skipped.
fn arguments_of_links(links: &IObjectArray) -> Vec<String> {
    // SAFETY: `links` is a live object of this thread.
    let count = unsafe { links.GetCount() }.unwrap_or(0);
    (0..count)
        .filter_map(|index| {
            // SAFETY: `index` is below the count the array reported.
            let link: IShellLinkW = unsafe { links.GetAt(index) }.ok()?;
            let mut arguments = [0_u16; MAX_LINK_TEXT_UNITS];
            // SAFETY: `link` is live; the call writes at most the buffer's length, which it is
            // given through the slice, and ends the text with a zero.
            unsafe { link.GetArguments(&mut arguments) }.ok()?;
            Some(text_until_zero(&arguments))
        })
        .collect()
}

fn object_collection() -> io::Result<IObjectCollection> {
    // SAFETY: COM is set up on this thread; the class id names the interface asked for.
    unsafe { CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER) }
        .map_err(|error| io_error_of(&error))
}

/// A link that starts the program with the entry's arguments, titled with the entry's title.
fn shell_link(program: &Path, entry: &JumpListEntry) -> io::Result<IShellLinkW> {
    // SAFETY: COM is set up on this thread; the class id names the interface asked for.
    let link: IShellLinkW = unsafe { CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER) }
        .map_err(|error| io_error_of(&error))?;
    let wide_program = whole_text_with_zero(program.as_os_str(), MAX_PROGRAM_PATH_UNITS)?;
    let wide_arguments = whole_text_with_zero(&entry.arguments, MAX_LINK_TEXT_UNITS)?;
    let wide_title = wide_with_zero(&entry.title);
    // SAFETY: `link` is live, and each text ends with a zero and outlives its call, which copies it.
    unsafe {
        link.SetPath(PCWSTR(wide_program.as_ptr()))
            .and_then(|()| link.SetArguments(PCWSTR(wide_arguments.as_ptr())))
            .and_then(|()| link.SetDescription(PCWSTR(wide_title.as_ptr())))
    }
    .map_err(|error| io_error_of(&error))?;
    let properties: IPropertyStore = link.cast().map_err(|error| io_error_of(&error))?;
    let title = string_property(&wide_title)?;
    // SAFETY: `properties` is live; `title` is a valid string value that outlives the calls, and
    // the store copies it.
    unsafe {
        properties
            .SetValue(&PKEY_Title, &title)
            .and_then(|()| properties.Commit())
    }
    .map_err(|error| io_error_of(&error))?;
    Ok(link)
}

/// A `VT_LPWSTR` value holding a copy of the text in memory COM owns, freed when the value drops.
fn string_property(wide_text: &[u16]) -> io::Result<PROPVARIANT> {
    let bytes = std::mem::size_of_val(wide_text);
    // SAFETY: asks COM for `bytes` bytes; a null answer is handled below.
    let memory = unsafe { CoTaskMemAlloc(bytes) }.cast::<u16>();
    if memory.is_null() {
        return Err(io_error_of_hresult(
            windows::Win32::Foundation::E_OUTOFMEMORY,
        ));
    }
    // SAFETY: `memory` holds `wide_text.len()` units, the two buffers do not overlap, and the
    // copy includes the text's ending zero.
    unsafe { std::ptr::copy_nonoverlapping(wide_text.as_ptr(), memory, wide_text.len()) };
    let mut value = PROPVARIANT::default();
    // SAFETY: a default value is empty, so writing its type and string field leaves a valid
    // `VT_LPWSTR` value whose string, allocated with `CoTaskMemAlloc`, `PropVariantClear` frees
    // when the value drops.
    unsafe {
        let fields = &mut *value.Anonymous.Anonymous;
        fields.vt = VT_LPWSTR;
        fields.Anonymous.pwszVal = PWSTR(memory);
    }
    Ok(value)
}

/// A text that must not be cut, such as a path or arguments, refused when it does not fit.
fn whole_text_with_zero(text: impl AsRef<OsStr>, max_units: usize) -> io::Result<Vec<u16>> {
    let wide: Vec<u16> = text
        .as_ref()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    if wide.len() > max_units {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "the text is too long for a Jump List link",
        ));
    }
    Ok(wide)
}

/// A title or category, cut to what a link keeps.
fn wide_with_zero(text: impl AsRef<OsStr>) -> Vec<u16> {
    text.as_ref()
        .encode_wide()
        .take(MAX_LINK_TEXT_UNITS - 1)
        .chain(std::iter::once(0))
        .collect()
}

fn text_until_zero(units: &[u16]) -> String {
    let end = units
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(units.len());
    String::from_utf16_lossy(units.get(..end).unwrap_or_default())
}

/// COM in a single-threaded apartment for as long as the guard lives. It cannot be sent to another
/// thread, so it always takes COM down on the thread that set it up.
struct ApartmentComGuard(std::marker::PhantomData<*const ()>);

impl ApartmentComGuard {
    fn start() -> io::Result<Self> {
        // SAFETY: `CoInitializeEx` may be called on any thread with no reserved argument. A thread
        // already in another COM mode gets an error, returned below; each success is paired with
        // one `CoUninitialize` when the guard drops, on the same thread, as the guard is not `Send`.
        let result =
            unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };
        if result.is_err() {
            return Err(io_error_of_hresult(result));
        }
        Ok(Self(std::marker::PhantomData))
    }
}

impl Drop for ApartmentComGuard {
    fn drop(&mut self) {
        // SAFETY: pairs the successful `CoInitializeEx` above, on the same thread; every COM
        // object of the update was released before the guard, which was made first.
        unsafe { CoUninitialize() };
    }
}

/// Where the program the links start lives, for tests that only read it.
#[cfg(test)]
fn program_for_tests() -> std::path::PathBuf {
    std::env::current_exe().unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn link_texts_end_with_one_zero_and_stay_within_the_link_limit() {
        let long = "x".repeat(MAX_LINK_TEXT_UNITS * 2);

        let wide = wide_with_zero(&long);

        assert_eq!(wide.len(), MAX_LINK_TEXT_UNITS);
        assert_eq!(wide.last(), Some(&0));
        assert_eq!(wide_with_zero("ab"), [97, 98, 0]);
    }

    #[test]
    fn refuses_a_path_or_arguments_that_do_not_fit_instead_of_cutting_them() {
        let long_path = format!(r"C:\{}", "a".repeat(MAX_PROGRAM_PATH_UNITS));

        assert!(whole_text_with_zero(&long_path, MAX_PROGRAM_PATH_UNITS).is_err());
        assert_eq!(
            whole_text_with_zero("ab", MAX_PROGRAM_PATH_UNITS).unwrap(),
            [97, 98, 0]
        );
    }

    #[test]
    fn reads_text_up_to_its_zero() {
        assert_eq!(text_until_zero(&[97, 98, 0, 99]), "ab");
        assert_eq!(text_until_zero(&[97, 98]), "ab");
    }

    #[test]
    fn a_link_keeps_its_arguments_and_title() {
        let _com = ApartmentComGuard::start().unwrap();
        let entry = JumpListEntry {
            title: "Reading".to_owned(),
            arguments: "--workspace=reading-1".to_owned(),
        };

        let link = shell_link(&program_for_tests(), &entry).unwrap();
        let collection = object_collection().unwrap();
        // SAFETY: both objects are live objects of this test's thread.
        unsafe { collection.AddObject(&link) }.unwrap();
        let items: IObjectArray = collection.cast().unwrap();

        assert_eq!(arguments_of_links(&items), ["--workspace=reading-1"]);
        let properties: IPropertyStore = link.cast().unwrap();
        // SAFETY: `properties` is a live object of this test's thread.
        let title = unsafe { properties.GetValue(&PKEY_Title) }.unwrap();
        assert_eq!(title.to_string(), "Reading");
    }
}
