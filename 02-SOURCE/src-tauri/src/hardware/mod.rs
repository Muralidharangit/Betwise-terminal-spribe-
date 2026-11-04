pub mod bill_acceptor;
pub mod config;
pub mod diagnose;
pub mod nv10;
pub mod printer;
#[cfg(windows)]
pub mod printer_windows;

use bill_acceptor::BillAcceptorHandle;
use config::KioskHwConfig;
use printer::PrinterHandle;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct HardwareState {
  pub config: Mutex<KioskHwConfig>,
  pub bill: Mutex<BillAcceptorHandle>,
  pub printer: Mutex<PrinterHandle>,
}

#[derive(Clone, Serialize)]
pub struct HardwareStatusDto {
  pub bill: DeviceStatusDto,
  pub printer: DeviceStatusDto,
  pub barcode: DeviceStatusDto,
}

#[derive(Clone, Serialize)]
pub struct DeviceStatusDto {
  pub connected: bool,
  pub enabled: bool,
  pub mode: String,
  pub detail: String,
}

impl HardwareState {
  pub fn new() -> Self {
    let cfg = KioskHwConfig::load();
    Self {
      config: Mutex::new(cfg.clone()),
      bill: Mutex::new(BillAcceptorHandle::new()),
      printer: Mutex::new(PrinterHandle::new()),
    }
  }
}

pub fn start_hardware(app: &AppHandle) -> Result<HardwareStatusDto, String> {
  let state = app.state::<HardwareState>();
  let cfg = {
    let mut guard = state.config.lock().map_err(|e| e.to_string())?;
    *guard = KioskHwConfig::load();
    guard.clone()
  };

  {
    let mut printer = state.printer.lock().map_err(|e| e.to_string())?;
    printer.connect(&cfg);
  }

  {
    let mut bill = state.bill.lock().map_err(|e| e.to_string())?;
    bill.connect(app.clone(), &cfg);
  }

  status_from_state(&state)
}

fn status_from_state(state: &HardwareState) -> Result<HardwareStatusDto, String> {
  let bill = state.bill.lock().map_err(|e| e.to_string())?.status();
  let printer = state.printer.lock().map_err(|e| e.to_string())?.status();
  Ok(HardwareStatusDto {
    bill,
    printer,
    barcode: DeviceStatusDto {
      connected: true,
      enabled: true,
      mode: "live".into(),
      detail: "HID keyboard wedge (Zebex / Ultrascan)".into(),
    },
  })
}

#[tauri::command]
pub fn hardware_start(app: AppHandle) -> Result<HardwareStatusDto, String> {
  start_hardware(&app)
}

/// Re-scan printers (always) and reconnect bill only if it dropped (USB replug / hub reset).
#[tauri::command(async)]
pub fn hardware_reconnect_missing(app: AppHandle) -> Result<HardwareStatusDto, String> {
  let state = app.state::<HardwareState>();
  let cfg = {
    let mut guard = state.config.lock().map_err(|e| e.to_string())?;
    *guard = KioskHwConfig::load();
    guard.clone()
  };
  {
    // Always re-detect: a new Generic/Text Only or USB printer may have been installed.
    let mut printer = state.printer.lock().map_err(|e| e.to_string())?;
    printer.connect(&cfg);
  }
  {
    let mut bill = state.bill.lock().map_err(|e| e.to_string())?;
    let st = bill.status();
    // Also reconnect when the port looks open but NV10 never became ready (stale session).
    if !st.connected || !st.enabled {
      bill.connect(app.clone(), &cfg);
    }
  }
  status_from_state(&state)
}

// Async: these wait on the printer lock, which is held for a whole print. On the main
// thread that wait would freeze the window.
#[tauri::command(async)]
pub fn hardware_status(state: State<'_, HardwareState>) -> Result<HardwareStatusDto, String> {
  status_from_state(&state)
}

#[tauri::command]
pub fn hardware_diagnose(app: AppHandle) -> Result<diagnose::DiagnoseReport, String> {
  let _ = start_hardware(&app);
  let state = app.state::<HardwareState>();
  Ok(diagnose::run(&state))
}

#[tauri::command]
pub fn print_test_ticket(app: AppHandle) -> Result<bool, String> {
  let _ = start_hardware(&app);
  let state = app.state::<HardwareState>();
  let printer = state.printer.lock().map_err(|e| e.to_string())?;
  printer.print_test_slip()
}

#[tauri::command]
pub fn get_kiosk_hw_config(state: State<'_, HardwareState>) -> Result<KioskHwConfig, String> {
  Ok(state.config.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub fn set_shop_available_coins(amount: f64) {
  bill_acceptor::set_shop_available_coins(amount);
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PrintTicketInput {
  pub code: String,
  pub amount: f64,
  pub currency: String,
  pub currency_symbol: String,
  pub terminal_id: String,
}

#[tauri::command(async)]
pub fn print_cashout_ticket(
  state: State<'_, HardwareState>,
  ticket: PrintTicketInput,
) -> Result<bool, String> {
  let printer = state.printer.lock().map_err(|e| e.to_string())?;
  printer.print_cashout_ticket(&ticket)
}

pub fn emit_note_accepted(app: &AppHandle, amount: f64, currency: &str) {
  let _ = app.emit(
    "note-accepted",
    serde_json::json!({ "amount": amount, "currency": currency }),
  );
}

/// Note is in the reader and recognised; credit follows once it is stacked.
pub fn emit_note_reading(app: &AppHandle, amount: f64) {
  let _ = app.emit("note-reading", serde_json::json!({ "amount": amount }));
}

pub fn emit_note_rejected(app: &AppHandle, reason: &str) {
  let _ = app.emit("note-rejected", serde_json::json!({ "reason": reason }));
}

/// Note reader messages shown on screen — plain words, no model names or protocol terms.
/// The model / protocol detail is written to the log where each one is raised.
pub const NOTE_READER_NOT_RESPONDING: &str =
  "The note reader is not responding. Please do not insert cash. Call the cashier.";
pub const NOTE_READER_CASHBOX_FULL: &str =
  "The cash box is full, so no more notes can be taken. Please call the cashier.";
pub const NOTE_READER_JAM: &str =
  "A note is stuck in the note reader. Please do not insert more cash. Call the cashier.";
pub const NOTE_READER_FRAUD: &str =
  "The note reader rejected a suspicious note and has paused. Please call the cashier.";

pub fn emit_hardware_error(app: &AppHandle, device: &str, error: &str) {
  let _ = app.emit(
    "hardware-error",
    serde_json::json!({ "device": device, "error": error }),
  );
}
