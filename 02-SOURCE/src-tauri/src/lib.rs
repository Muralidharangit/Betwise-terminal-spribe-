mod hardware;
mod kiosk_hotkeys;
mod kiosk_lock;

use hardware::{
  get_kiosk_hw_config, hardware_diagnose, hardware_reconnect_missing, hardware_start, hardware_status,
  print_cashout_ticket,
  print_test_ticket, set_shop_available_coins, HardwareState,
};
use kiosk_lock::{enter_kiosk_mode, exit_kiosk_mode};

/** Lets the web UI write scanner / ticket events into the same log as the hardware. */
#[tauri::command]
fn frontend_log(level: String, message: String) {
  let message: String = message.chars().take(300).collect();
  match level.as_str() {
    "error" => log::error!(target: "ui", "{message}"),
    "warn" => log::warn!(target: "ui", "{message}"),
    _ => log::info!(target: "ui", "{message}"),
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(HardwareState::new())
    .invoke_handler(tauri::generate_handler![
      get_device_fingerprint,
      get_operating_system,
      hardware_start,
      hardware_status,
      hardware_reconnect_missing,
      hardware_diagnose,
      get_kiosk_hw_config,
      set_shop_available_coins,
      print_cashout_ticket,
      print_test_ticket,
      enter_kiosk_mode,
      exit_kiosk_mode,
      frontend_log,
    ])
    .setup(|app| {
      // Shop builds log too: a cash-out complaint can only be traced from the cabinet's log.
      // Five files of 2 MB keep days of history without filling the disk.
      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log::LevelFilter::Info)
          .max_file_size(2_000_000)
          .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
          .build(),
      )?;
      // Port scanning can take ~15s with no devices plugged in; never block window start-up on it.
      let hw_handle = app.handle().clone();
      std::thread::spawn(move || match hardware::start_hardware(&hw_handle) {
        Ok(status) => log::info!(
          "hardware_started bill={} printer={}",
          status.bill.connected,
          status.printer.connected
        ),
        Err(err) => log::error!("hardware_start_failed: {err}"),
      });
      // Fullscreen kiosk on start
      kiosk_lock::engage(app.handle());
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
async fn get_device_fingerprint() -> Result<String, String> {
  #[cfg(not(target_os = "android"))]
  {
    machine_uid::get()
      .map(|id| format!("HW-{}", id))
      .map_err(|error| error.to_string())
  }

  #[cfg(target_os = "android")]
  {
    let brand = std::env::var("RO_PRODUCT_BRAND").unwrap_or_else(|_| "android".into());
    let model = std::env::var("RO_PRODUCT_MODEL").unwrap_or_else(|_| "device".into());
    let serial = std::env::var("RO_SERIALNO").unwrap_or_else(|_| "unknown".into());
    Ok(format!(
      "HW-ANDROID-{}-{}-{}",
      brand.replace(' ', "_"),
      model.replace(' ', "_"),
      serial.replace(' ', "_")
    ))
  }
}

#[tauri::command]
fn get_operating_system() -> String {
  if cfg!(target_os = "windows") {
    "Windows".to_string()
  } else if cfg!(target_os = "macos") {
    "macOS".to_string()
  } else if cfg!(target_os = "android") {
    "Android".to_string()
  } else if cfg!(target_os = "linux") {
    "Linux".to_string()
  } else {
    "Unknown".to_string()
  }
}
