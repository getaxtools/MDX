use std::io;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::mpsc::{self, Sender};
use std::thread::{self, JoinHandle};

use windows::Win32::Foundation::{HANDLE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Power::{
    HPOWERNOTIFY, RegisterSuspendResumeNotification, UnregisterSuspendResumeNotification,
};
use windows::Win32::System::RemoteDesktop::{
    NOTIFY_FOR_THIS_SESSION, WTSRegisterSessionNotification, WTSUnRegisterSessionNotification,
};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DEVICE_NOTIFY_WINDOW_HANDLE, DefWindowProcW, DestroyWindow, DispatchMessageW,
    GWLP_USERDATA, GetMessageW, GetWindowLongPtrW, MSG, PBT_APMRESUMEAUTOMATIC,
    PBT_APMRESUMESUSPEND, PBT_APMSUSPEND, PostThreadMessageW, RegisterClassW, SetWindowLongPtrW,
    WINDOW_EX_STYLE, WINDOW_STYLE, WM_POWERBROADCAST, WM_QUIT, WM_WTSSESSION_CHANGE, WNDCLASSW,
    WTS_SESSION_LOCK, WTS_SESSION_UNLOCK,
};
use windows::core::{PCWSTR, w};

use crate::com_error::io_error_of;

const WINDOW_CLASS: PCWSTR = w!("MdxShellEventsWindow");
/// Windows sends `ERROR_CLASS_ALREADY_EXISTS` when a second watcher registers the class again.
const ERROR_CLASS_ALREADY_EXISTS: i32 = 1410;
/// What a window procedure returns to grant a power broadcast.
const GRANTED: LRESULT = LRESULT(1);

/// A change of the Windows session or of the power state that may call for locking.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellEvent {
    /// The user locked Windows, such as with Windows+L.
    SessionLocked,
    /// The user unlocked Windows again. Any program on the desktop can send this message, so it is
    /// only news: it must never unlock anything by itself.
    SessionUnlocked,
    /// The PC is going to sleep or hibernate.
    Suspending,
    /// The PC woke from sleep or hibernation; Windows may report this twice.
    Resumed,
}

type EventCallback = Box<dyn Fn(ShellEvent) + Send>;

/// The shell event a window message carries, if any.
fn shell_event_of(message: u32, wparam: usize) -> Option<ShellEvent> {
    let code = u32::try_from(wparam).ok()?;
    match (message, code) {
        (WM_WTSSESSION_CHANGE, WTS_SESSION_LOCK) => Some(ShellEvent::SessionLocked),
        (WM_WTSSESSION_CHANGE, WTS_SESSION_UNLOCK) => Some(ShellEvent::SessionUnlocked),
        (WM_POWERBROADCAST, PBT_APMSUSPEND) => Some(ShellEvent::Suspending),
        (WM_POWERBROADCAST, PBT_APMRESUMEAUTOMATIC | PBT_APMRESUMESUSPEND) => {
            Some(ShellEvent::Resumed)
        }
        _ => None,
    }
}

/// Reports session lock and unlock, sleep and wake until it is dropped. A hidden window on a thread
/// of its own receives them; dropping the watcher ends that thread and removes the window.
pub struct ShellEventWatcher {
    thread_id: u32,
    thread: Option<JoinHandle<()>>,
    #[cfg(test)]
    window: isize,
}

/// Starts reporting shell events to `on_event`, which runs on the watcher's own thread. A panic in
/// `on_event` is caught, so the watcher keeps running.
pub fn watch_shell_events(
    on_event: impl Fn(ShellEvent) + Send + 'static,
) -> io::Result<ShellEventWatcher> {
    let (ready, started) = mpsc::channel();
    let callback: EventCallback = Box::new(on_event);
    let thread = thread::Builder::new()
        .name("shell-events".to_owned())
        .spawn(move || run_watcher(callback, &ready))?;
    match started.recv() {
        Ok(Ok((thread_id, window))) => {
            // Only tests send the window messages of their own.
            #[cfg(not(test))]
            let _ = window;
            Ok(ShellEventWatcher {
                thread_id,
                thread: Some(thread),
                #[cfg(test)]
                window,
            })
        }
        Ok(Err(error)) => {
            let _ = thread.join();
            Err(error)
        }
        Err(_) => {
            let _ = thread.join();
            Err(io::Error::other("the shell events thread stopped"))
        }
    }
}

impl Drop for ShellEventWatcher {
    fn drop(&mut self) {
        // SAFETY: posting a message to a thread id needs nothing but the id; if the thread already
        // ended, the call fails and the join below returns at once.
        let _ = unsafe { PostThreadMessageW(self.thread_id, WM_QUIT, WPARAM(0), LPARAM(0)) };
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[cfg(test)]
impl ShellEventWatcher {
    /// Sends the watcher's window a message as Windows would.
    pub fn send_for_test(&self, message: u32, wparam: usize) {
        use windows::Win32::UI::WindowsAndMessaging::SendMessageW;
        // SAFETY: the window lives until this watcher is dropped, and sending waits for its procedure.
        unsafe {
            SendMessageW(
                HWND(self.window as *mut core::ffi::c_void),
                message,
                Some(WPARAM(wparam)),
                Some(LPARAM(0)),
            )
        };
    }
}

fn run_watcher(callback: EventCallback, ready: &Sender<io::Result<(u32, isize)>>) {
    let window = match ListeningWindow::create(callback) {
        Ok(window) => window,
        Err(error) => {
            let _ = ready.send(Err(error));
            return;
        }
    };
    // SAFETY: GetCurrentThreadId has no preconditions.
    let thread_id = unsafe { GetCurrentThreadId() };
    if ready
        .send(Ok((thread_id, window.handle.0 as isize)))
        .is_err()
    {
        return;
    }
    pump_messages();
    drop(window);
}

/// Runs this thread's messages until `WM_QUIT`, or until the queue fails.
fn pump_messages() {
    let mut message = MSG::default();
    loop {
        // SAFETY: `message` is a valid MSG for the call to fill; no window filter is given.
        let result = unsafe { GetMessageW(&raw mut message, None, 0, 0) };
        // 0 is WM_QUIT and -1 an error; both end the loop.
        if result.0 <= 0 {
            return;
        }
        // SAFETY: `message` was just filled by GetMessageW.
        unsafe { DispatchMessageW(&raw const message) };
    }
}

/// The hidden window that hears session and power changes, with its callback and registrations,
/// all undone when it is dropped on the thread that made it.
struct ListeningWindow {
    handle: HWND,
    callback: *mut EventCallback,
    power: Option<HPOWERNOTIFY>,
}

impl ListeningWindow {
    fn create(callback: EventCallback) -> io::Result<Self> {
        let handle = create_hidden_window()?;
        let mut window = Self {
            handle,
            callback: Box::into_raw(Box::new(callback)),
            power: None,
        };
        // SAFETY: the window was made on this thread and its user data is read only by its own
        // procedure, on this thread, while the pointer stays valid until `drop` clears it.
        unsafe { SetWindowLongPtrW(handle, GWLP_USERDATA, window.callback as isize) };
        // SAFETY: a live window of this thread, registered for this session's changes only.
        unsafe { WTSRegisterSessionNotification(handle, NOTIFY_FOR_THIS_SESSION) }
            .map_err(|error| io_error_of(&error))?;
        // SAFETY: the window handle is valid; DEVICE_NOTIFY_WINDOW_HANDLE says it is a window.
        let power = unsafe {
            RegisterSuspendResumeNotification(HANDLE(handle.0), DEVICE_NOTIFY_WINDOW_HANDLE)
        }
        .map_err(|error| io_error_of(&error))?;
        window.power = Some(power);
        Ok(window)
    }
}

impl Drop for ListeningWindow {
    fn drop(&mut self) {
        if let Some(power) = self.power.take() {
            // SAFETY: a registration made in `create`, undone exactly once.
            let _ = unsafe { UnregisterSuspendResumeNotification(power) };
        }
        // SAFETY: undoing this window's session registration; failing for a window never
        // registered is harmless.
        let _ = unsafe { WTSUnRegisterSessionNotification(self.handle) };
        // SAFETY: clearing the user data first means the procedure never sees a freed pointer.
        unsafe { SetWindowLongPtrW(self.handle, GWLP_USERDATA, 0) };
        // SAFETY: the window was made on this thread and is destroyed once, here.
        let _ = unsafe { DestroyWindow(self.handle) };
        // SAFETY: the pointer came from Box::into_raw in `create` and nothing else uses it now.
        drop(unsafe { Box::from_raw(self.callback) });
    }
}

fn create_hidden_window() -> io::Result<HWND> {
    // SAFETY: a null name asks for this program's own module, which lives as long as the process.
    let instance = unsafe { GetModuleHandleW(None) }.map_err(|error| io_error_of(&error))?;
    let class = WNDCLASSW {
        lpfnWndProc: Some(window_procedure),
        hInstance: instance.into(),
        lpszClassName: WINDOW_CLASS,
        ..WNDCLASSW::default()
    };
    // SAFETY: `class` is a complete WNDCLASSW whose name and procedure live for the whole program.
    if unsafe { RegisterClassW(&raw const class) } == 0 {
        let error = io::Error::last_os_error();
        if error.raw_os_error() != Some(ERROR_CLASS_ALREADY_EXISTS) {
            return Err(error);
        }
    }
    // SAFETY: the class is registered; a top-level window is never shown, so it only hears the
    // session and power messages that top-level windows get.
    unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE(0),
            WINDOW_CLASS,
            w!("MDX shell events"),
            WINDOW_STYLE(0),
            0,
            0,
            0,
            0,
            None,
            None,
            Some(instance.into()),
            None,
        )
    }
    .map_err(|error| io_error_of(&error))
}

extern "system" fn window_procedure(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if let Some(event) = shell_event_of(message, wparam.0) {
        report(window, event);
        if message == WM_POWERBROADCAST {
            return GRANTED;
        }
    }
    // SAFETY: every other message goes to the default procedure with its own arguments.
    unsafe { DefWindowProcW(window, message, wparam, lparam) }
}

fn report(window: HWND, event: ShellEvent) {
    // SAFETY: the user data is either 0 or the callback pointer `create` stored, which stays valid
    // until `drop` sets it back to 0 on this same thread.
    let callback = unsafe { GetWindowLongPtrW(window, GWLP_USERDATA) } as *const EventCallback;
    // SAFETY: checked for null; otherwise it points at the live callback, only read here.
    let Some(callback) = (unsafe { callback.as_ref() }) else {
        return;
    };
    // A panic must not unwind into Windows, which would end the program.
    let _ = catch_unwind(AssertUnwindSafe(|| callback(event)));
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use super::*;

    #[test]
    fn reads_session_and_power_messages_and_ignores_the_rest() {
        let lock = usize::try_from(WTS_SESSION_LOCK).unwrap();
        let unlock = usize::try_from(WTS_SESSION_UNLOCK).unwrap();
        let suspend = usize::try_from(PBT_APMSUSPEND).unwrap();
        let resume = usize::try_from(PBT_APMRESUMEAUTOMATIC).unwrap();

        assert_eq!(
            shell_event_of(WM_WTSSESSION_CHANGE, lock),
            Some(ShellEvent::SessionLocked)
        );
        assert_eq!(
            shell_event_of(WM_WTSSESSION_CHANGE, unlock),
            Some(ShellEvent::SessionUnlocked)
        );
        assert_eq!(
            shell_event_of(WM_POWERBROADCAST, suspend),
            Some(ShellEvent::Suspending)
        );
        assert_eq!(
            shell_event_of(WM_POWERBROADCAST, resume),
            Some(ShellEvent::Resumed)
        );
        assert_eq!(
            shell_event_of(WM_POWERBROADCAST, lock),
            Some(ShellEvent::Resumed)
        );
        assert_eq!(shell_event_of(WM_WTSSESSION_CHANGE, 1), None);
        assert_eq!(shell_event_of(WM_QUIT, lock), None);
    }

    #[test]
    fn a_session_lock_reaches_the_callback_and_dropping_the_watcher_ends_it() {
        let heard = Arc::new(Mutex::new(Vec::new()));
        let recorder = Arc::clone(&heard);
        let watcher =
            watch_shell_events(move |event| recorder.lock().unwrap().push(event)).unwrap();

        watcher.send_for_test(
            WM_WTSSESSION_CHANGE,
            usize::try_from(WTS_SESSION_LOCK).unwrap(),
        );
        watcher.send_for_test(WM_POWERBROADCAST, usize::try_from(PBT_APMSUSPEND).unwrap());
        drop(watcher);

        assert_eq!(
            *heard.lock().unwrap(),
            vec![ShellEvent::SessionLocked, ShellEvent::Suspending]
        );
    }

    #[test]
    fn a_callback_that_panics_leaves_the_watcher_running() {
        let heard = Arc::new(Mutex::new(0));
        let counter = Arc::clone(&heard);
        let watcher = watch_shell_events(move |_| {
            *counter.lock().unwrap() += 1;
            panic!("a callback bug");
        })
        .unwrap();
        let lock = usize::try_from(WTS_SESSION_LOCK).unwrap();

        watcher.send_for_test(WM_WTSSESSION_CHANGE, lock);
        watcher.send_for_test(WM_WTSSESSION_CHANGE, lock);

        assert_eq!(*heard.lock().unwrap(), 2);
    }

    #[test]
    fn two_watchers_can_run_at_once() {
        let first = watch_shell_events(|_| {}).unwrap();
        let second = watch_shell_events(|_| {}).unwrap();
        std::thread::sleep(Duration::from_millis(10));

        drop(first);
        drop(second);
    }
}
