//! Block OS escape keys while the terminal is in kiosk lockdown.
//! Staff leave remains: Ctrl+Shift+K (UI). Also allow Ctrl+Shift+D / R.
//!
//! Windows: low-level keyboard hook (the web UI cannot block the Windows key).
//! Linux: no hook in this build — shop Linux images should use OS lockdown if required.

use std::sync::atomic::{AtomicBool, Ordering};

static BLOCKING: AtomicBool = AtomicBool::new(false);

/// Start blocking Windows / Alt+Tab / Ctrl+Esc (and similar) while kiosk is locked.
pub fn start_blocking() {
  if BLOCKING.swap(true, Ordering::SeqCst) {
    return;
  }
  #[cfg(windows)]
  windows_hook::install();
  #[cfg(not(windows))]
  log::info!("kiosk_hotkeys_block_requested (OS key block is Windows-only in this build)");
}

/// Stop blocking after a successful staff exit (Ctrl+Shift+K + password).
pub fn stop_blocking() {
  if !BLOCKING.swap(false, Ordering::SeqCst) {
    return;
  }
  #[cfg(windows)]
  windows_hook::uninstall();
  log::info!("kiosk_hotkeys_unblocked");
}

#[cfg(windows)]
mod windows_hook {
  use super::BLOCKING;
  use std::ptr;
  use std::sync::atomic::{AtomicPtr, AtomicU32, Ordering};
  use std::sync::Mutex;
  use std::thread;
  use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
  use windows_sys::Win32::System::Threading::GetCurrentThreadId;
  use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_ESCAPE, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT, VK_TAB,
  };
  use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, PostThreadMessageW, SetWindowsHookExW, UnhookWindowsHookEx, HHOOK,
    KBDLLHOOKSTRUCT, WH_KEYBOARD_LL, WM_KEYDOWN, WM_QUIT, WM_SYSKEYDOWN,
  };

  const VK_F4: i32 = 0x73;
  const VK_K: i32 = 0x4B;
  const VK_D: i32 = 0x44;
  const VK_R: i32 = 0x52;

  static HOOK: AtomicPtr<core::ffi::c_void> = AtomicPtr::new(ptr::null_mut());
  static HOOK_THREAD_ID: AtomicU32 = AtomicU32::new(0);
  static THREAD: Mutex<Option<thread::JoinHandle<()>>> = Mutex::new(None);

  fn key_down(vk: i32) -> bool {
    unsafe { GetAsyncKeyState(vk) as u16 & 0x8000 != 0 }
  }

  fn should_block(vk: u32) -> bool {
    let vk = vk as i32;

    // Windows key (Start menu)
    if vk == VK_LWIN as i32 || vk == VK_RWIN as i32 {
      return true;
    }

    let ctrl = key_down(VK_CONTROL as i32);
    let alt = key_down(VK_MENU as i32);
    let shift = key_down(VK_SHIFT as i32);

    // Staff / product shortcuts that must still work
    if ctrl && shift && (vk == VK_K || vk == VK_D || vk == VK_R) {
      return false;
    }

    if alt && (vk == VK_TAB as i32 || vk == VK_ESCAPE as i32 || vk == VK_F4) {
      return true;
    }
    if ctrl && vk == VK_ESCAPE as i32 {
      return true; // Start menu
    }
    if ctrl && shift && vk == VK_ESCAPE as i32 {
      return true; // Task Manager
    }

    false
  }

  unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && BLOCKING.load(Ordering::SeqCst) {
      let msg = wparam as u32;
      if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
        let info = &*(lparam as *const KBDLLHOOKSTRUCT);
        if should_block(info.vkCode) {
          return 1;
        }
      }
    }
    let hook = HOOK.load(Ordering::SeqCst);
    CallNextHookEx(hook as HHOOK, code, wparam, lparam)
  }

  pub fn install() {
    let mut guard = match THREAD.lock() {
      Ok(g) => g,
      Err(_) => return,
    };
    if guard.is_some() {
      return;
    }

    let handle = thread::Builder::new()
      .name("kiosk-hotkeys".into())
      .spawn(|| unsafe {
        HOOK_THREAD_ID.store(GetCurrentThreadId(), Ordering::SeqCst);
        let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), ptr::null_mut(), 0);
        if hook.is_null() {
          log::error!("kiosk_hotkeys_hook_failed");
          BLOCKING.store(false, Ordering::SeqCst);
          HOOK_THREAD_ID.store(0, Ordering::SeqCst);
          return;
        }
        HOOK.store(hook as *mut _, Ordering::SeqCst);
        log::info!("kiosk_hotkeys_hook_installed (Win key / Alt+Tab / Ctrl+Esc blocked)");

        let mut msg = std::mem::zeroed();
        while GetMessageW(&mut msg, ptr::null_mut(), 0, 0) > 0 {
          if !BLOCKING.load(Ordering::SeqCst) {
            break;
          }
        }

        let h = HOOK.swap(ptr::null_mut(), Ordering::SeqCst);
        if !h.is_null() {
          UnhookWindowsHookEx(h as HHOOK);
        }
        HOOK_THREAD_ID.store(0, Ordering::SeqCst);
        log::info!("kiosk_hotkeys_hook_removed");
      })
      .ok();

    *guard = handle;
  }

  pub fn uninstall() {
    let tid = HOOK_THREAD_ID.load(Ordering::SeqCst);
    if tid != 0 {
      unsafe {
        let _ = PostThreadMessageW(tid, WM_QUIT, 0, 0);
      }
    }
    if let Ok(mut guard) = THREAD.lock() {
      if let Some(handle) = guard.take() {
        let _ = handle.join();
      }
    }
  }
}
