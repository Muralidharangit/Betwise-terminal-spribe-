use crate::hardware::config::KioskHwConfig;
use crate::hardware::HardwareState;
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewWindow};

/// Cover exactly the monitor the window is on, whatever its resolution or display scaling.
fn fit_to_monitor(win: &WebviewWindow) {
  let monitor = win
    .current_monitor()
    .ok()
    .flatten()
    .or_else(|| win.primary_monitor().ok().flatten());
  if let Some(m) = monitor {
    let _ = win.set_position(tauri::Position::Physical(*m.position()));
    let _ = win.set_size(tauri::Size::Physical(*m.size()));
    log::info!(
      "kiosk_window_fit monitor={}x{} scale={}",
      m.size().width,
      m.size().height,
      m.scale_factor()
    );
  }
}

fn apply_lockdown(win: &WebviewWindow) {
  // GTK cannot resize a non-resizable window, so fullscreen would keep the 1920×1080 logical size
  // and overflow the screen when display scaling is above 100%.
  let _ = win.set_resizable(true);
  let _ = win.set_decorations(false);
  fit_to_monitor(win);
  let _ = win.set_fullscreen(true);
  let _ = win.set_always_on_top(true);
  let _ = win.set_minimizable(false);
  let _ = win.set_closable(false);
  let _ = win.set_focus();
}

/// Enter fullscreen kiosk mode on launch.
pub fn engage(app: &AppHandle) {
  // Block Windows key / Alt+Tab / Ctrl+Esc — only Ctrl+Shift+K (+ password) leaves.
  crate::kiosk_hotkeys::start_blocking();

  if let Some(win) = app.get_webview_window("main") {
    apply_lockdown(&win);
    log::info!("kiosk_lockdown_engaged");

    // Some window managers ignore the first fullscreen request while the window is being mapped.
    std::thread::spawn(move || {
      std::thread::sleep(Duration::from_millis(700));
      apply_lockdown(&win);
      if let (Ok(size), Ok(Some(m))) = (win.outer_size(), win.current_monitor()) {
        log::info!(
          "kiosk_window_check window={}x{} monitor={}x{}",
          size.width,
          size.height,
          m.size().width,
          m.size().height
        );
      }
    });
  }
}

#[tauri::command]
pub fn enter_kiosk_mode(app: AppHandle) -> Result<bool, String> {
  engage(&app);
  // Re-open NV10 / printer after a staff exit (or a cold start that raced the COM port).
  let _ = crate::hardware::start_hardware(&app);
  Ok(true)
}

/// Staff exit: Ctrl+Shift+K then AdminPassword from config.json
#[tauri::command]
pub fn exit_kiosk_mode(app: AppHandle, password: String) -> Result<bool, String> {
  let state = app.state::<HardwareState>();
  {
    let mut guard = state.config.lock().map_err(|e| e.to_string())?;
    *guard = KioskHwConfig::load();
  }
  let expected = state
    .config
    .lock()
    .map_err(|e| e.to_string())?
    .admin_password
    .clone();

  if password != expected {
    return Err("Incorrect password.".into());
  }

  // Release the bill acceptor COM/USB port so the next app start can open the NV10.
  // Staff exit is for leaving the terminal — keep the port free, not locked by a windowed session.
  {
    let state = app.state::<HardwareState>();
    let locked = state.bill.lock();
    if let Ok(mut bill) = locked {
      bill.disconnect();
      log::info!("kiosk_exit_bill_released");
    }
  }

  // Unlock OS keys (Windows key, Alt+Tab, …) after staff password is accepted.
  crate::kiosk_hotkeys::stop_blocking();

  if let Some(win) = app.get_webview_window("main") {
    let _ = win.set_always_on_top(false);
    let _ = win.set_fullscreen(false);
    let _ = win.set_decorations(true);
    let _ = win.set_resizable(true);
    let _ = win.set_minimizable(true);
    let _ = win.set_closable(true);
    let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize {
      width: 1280.0,
      height: 800.0,
    }));
    let _ = win.center();
    log::info!("kiosk_lockdown_exited");
  }
  Ok(true)
}
