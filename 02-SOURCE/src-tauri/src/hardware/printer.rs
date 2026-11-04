use super::config::{self, KioskHwConfig};
use super::{DeviceStatusDto, PrintTicketInput};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::time::Duration;

/// A ticket must have left the printer's queue by now, or the cash-out is cancelled.
pub const PRINT_TIMEOUT: Duration = Duration::from_secs(8);

/// IEEE 1284 status byte from a USB printer-class device: the same bits on Linux
/// (LPGETSTATUS) and Windows (IOCTL_USBPRINT_GET_LPT_STATUS).
const LPT_PAPER_EMPTY: u8 = 0x20;
const LPT_NOT_ERROR: u8 = 0x08;

/// Screen message when the printer reports it cannot print. A status of 0 means the
/// device does not report one, so nothing can be concluded from it.
pub fn port_status_error(status: u8) -> Option<&'static str> {
  if status == 0 {
    None
  } else if status & LPT_PAPER_EMPTY != 0 {
    Some(PRINTER_NO_PAPER)
  } else if status & LPT_NOT_ERROR == 0 {
    Some(PRINTER_NOT_RESPONDING)
  } else {
    None
  }
}

/// ESC/POS real-time status (DLE EOT n): 4 = roll sensor, 2 = why it stopped, 1 = printer.
/// Most specific first. The printer answers these while stopped and they use no paper, so
/// they see a finished roll or open cover that the USB port status may not report.
pub const REALTIME_QUERIES: [u8; 3] = [4, 2, 1];
pub const REALTIME_REPLY_TIMEOUT: Duration = Duration::from_millis(400);
/// The printer is still feeding when the last byte arrives; a roll can end during the ticket.
pub const PRINT_SETTLE: Duration = Duration::from_millis(1200);

/// What the printer answered in one check: its USB port status, and how many real-time
/// status queries it replied to.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PrinterAnswer {
  pub port: bool,
  pub realtime: usize,
}

impl PrinterAnswer {
  /// A printer that answered before the ticket and is silent after it was switched off or
  /// reset mid-ticket. The ticket is then lost or blank, so the cash-out must not stand.
  pub fn went_silent_since(self, before: PrinterAnswer) -> bool {
    (before.port && !self.port) || (before.realtime > 0 && self.realtime == 0)
  }
}

pub fn realtime_query(query: u8) -> [u8; 3] {
  [0x10, 0x04, query]
}

/// Screen message for a real-time status reply, None when it reports no fault.
pub fn realtime_status_error(query: u8, reply: u8) -> Option<&'static str> {
  // Every reply carries these fixed bits; anything else is not a status byte.
  if reply & 0x93 != 0x12 {
    return None;
  }
  match query {
    4 if reply & 0x60 != 0 => Some(PRINTER_NO_PAPER),
    2 if reply & 0x20 != 0 => Some(PRINTER_NO_PAPER),
    2 if reply & 0x04 != 0 => Some(PRINTER_COVER_OPEN),
    2 if reply & 0x40 != 0 => Some(PRINTER_NOT_RESPONDING),
    1 if reply & 0x08 != 0 => Some(PRINTER_NOT_RESPONDING),
    _ => None,
  }
}

pub struct PrinterHandle {
  connected: bool,
  device_path: String,
  printer_name: String,
  /// Windows: installed printer queue used for RAW printing (any brand with a driver).
  spool_printer: Option<String>,
}

impl PrinterHandle {
  pub fn new() -> Self {
    Self {
      connected: false,
      device_path: config::os_default_printer_device(),
      printer_name: "Receipt printer".into(),
      spool_printer: None,
    }
  }

  pub fn status(&self) -> DeviceStatusDto {
    let connected = self.is_connected();
    DeviceStatusDto {
      connected,
      enabled: connected,
      mode: "live".into(),
      detail: if connected {
        format!("{} · {}", self.printer_name, self.device_path)
      } else {
        format!("{} · not connected ({})", self.printer_name, self.device_path)
      },
    }
  }

  #[cfg(windows)]
  fn is_connected(&self) -> bool {
    match &self.spool_printer {
      Some(name) => self.connected && !super::printer_windows::is_offline(name),
      None => self.connected,
    }
  }

  #[cfg(not(windows))]
  fn is_connected(&self) -> bool {
    // Switching a USB printer off removes its device node, so connect()'s result goes stale.
    self.connected && Path::new(&self.device_path).exists()
  }

  pub fn connect(&mut self, cfg: &KioskHwConfig) {
    self.spool_printer = None;
    self.connected = false;
    self.printer_name = "Receipt printer".into();
    self.device_path = if config::is_auto_like(&cfg.printer_device) {
      config::os_default_printer_device()
    } else {
      cfg.printer_device.clone()
    };

    // Optional hint only — `Printer_Name: auto` (or empty) means full auto-detect on both OS.
    let name_hint = config::printer_name_preference(&cfg.printer_name).unwrap_or_default();

    #[cfg(windows)]
    {
      // Prefer Windows printer list (Epson / Xprinter / Generic Text Only on USB…).
      let preferred = if !name_hint.is_empty() {
        name_hint.clone()
      } else if !config::is_auto_like(&cfg.printer_device)
        && !cfg.printer_device.starts_with(r"\\.\")
        && !cfg.printer_device.to_uppercase().starts_with("USB")
        && !cfg.printer_device.to_uppercase().starts_with("LPT")
      {
        // Rare: Printer_Device holds a Windows printer queue name.
        cfg.printer_device.clone()
      } else {
        String::new()
      };
      if let Some(p) = super::printer_windows::pick_receipt_printer(&preferred) {
        log::info!(
          "printer_connected windows_queue=\"{}\" port={} offline={} auto={}",
          p.name,
          p.port,
          p.offline,
          preferred.is_empty()
        );
        self.printer_name = p.name.clone();
        self.device_path = p.port.clone();
        self.spool_printer = Some(p.name);
        self.connected = true;
        return;
      }
    }

    // Linux (and Windows fallback): open raw USB printer device.
    if let Some(path) = resolve_device_path(&cfg.printer_device) {
      if let Some(model) = usb_printer_model(&path) {
        self.printer_name = model;
      } else if !name_hint.is_empty() {
        self.printer_name = name_hint;
      }
      self.device_path = path;
      self.connected = true;
      log::info!(
        "printer_connected path={} model=\"{}\"",
        self.device_path,
        self.printer_name
      );
    } else {
      log::error!(
        "printer_connect_failed: no printer found (device={}). {}",
        self.device_path,
        printer_help_hint()
      );
    }
  }

  fn send(&self, payload: &[u8]) -> Result<String, String> {
    #[cfg(windows)]
    if let Some(name) = &self.spool_printer {
      super::printer_windows::write_raw(name, &self.device_path, payload)?;
      return Ok(name.clone());
    }
    let path = resolve_device_path(&self.device_path).unwrap_or_else(|| self.device_path.clone());
    write_raw(&path, payload)?;
    Ok(path)
  }

  pub fn print_cashout_ticket(&self, ticket: &PrintTicketInput) -> Result<bool, String> {
    if !self.is_connected() {
      return Err(self.not_connected_message());
    }

    let date = chrono_like_now();
    let text = format!(
      "================================\n\
Terminal : {}\n\
Amount   : {}{:.2} {}\n\
Ticket   : {}\n\
Date     : {}\n\
================================\n\
 Scan this ticket on any kiosk\n\
 to continue with this balance.\n\
================================",
      ticket.terminal_id,
      ticket.currency_symbol,
      ticket.amount,
      ticket.currency,
      ticket.code,
      date
    );

    let code: String = ticket
      .code
      .chars()
      .filter(|c| (*c as u32) >= 0x20 && (*c as u32) <= 0x7e)
      .collect();
    let mut code128 = Vec::from(b"{B" as &[u8]);
    code128.extend_from_slice(code.as_bytes());

    let mut payload: Vec<u8> = Vec::new();
    payload.extend_from_slice(&[0x1b, 0x40]);
    payload.extend_from_slice(&[0x1b, 0x61, 0x01]);
    payload.extend_from_slice(&[0x1b, 0x45, 0x01]);
    payload.extend_from_slice(b"CREDIT TICKET\n");
    payload.extend_from_slice(&[0x1b, 0x45, 0x00]);
    payload.extend_from_slice(&[0x1b, 0x61, 0x00]);
    payload.extend_from_slice(text.as_bytes());
    payload.push(b'\n');

    // Module 2 fits 80 mm TM-T88V. Module 3 clipped the bars so tickets would not scan.
    // New tickets are 9 chars (T + 8 hex), so width 2 is easier to read than the old 13-char codes.
    payload.extend_from_slice(b"\n");
    payload.extend_from_slice(&[0x1b, 0x61, 0x01]);
    payload.extend_from_slice(&[0x1d, 0x68, 96]);
    payload.extend_from_slice(&[0x1d, 0x77, 2]);
    payload.extend_from_slice(&[0x1d, 0x66, 0]);
    payload.extend_from_slice(&[0x1d, 0x48, 2]);
    payload.extend_from_slice(&[0x1d, 0x6b, 73, code128.len() as u8]);
    payload.extend_from_slice(&code128);
    payload.push(b'\n');
    payload.extend_from_slice(&[0x1b, 0x64, 0x04]);
    payload.extend_from_slice(&[0x1d, 0x56, 0x41, 0x04]);

    let target = self.send(&payload)?;
    log::info!("ticket_printed code={} printer={}", ticket.code, target);
    Ok(true)
  }

  /// Plain message for the screen. The device path and OS fix go to the log only.
  fn not_connected_message(&self) -> String {
    log::error!(
      "printer_not_connected device={} hint=\"{}\"",
      self.device_path,
      printer_help_hint()
    );
    PRINTER_NOT_CONNECTED.to_string()
  }

  pub fn print_test_slip(&self) -> Result<bool, String> {
    if !self.is_connected() {
      return Err(self.not_connected_message());
    }
    let mut payload: Vec<u8> = Vec::new();
    payload.extend_from_slice(&[0x1b, 0x40]);
    payload.extend_from_slice(&[0x1b, 0x61, 0x01]);
    payload.extend_from_slice(&[0x1b, 0x45, 0x01]);
    payload.extend_from_slice(b"HARDWARE TEST\n");
    payload.extend_from_slice(&[0x1b, 0x45, 0x00]);
    payload.extend_from_slice(&[0x1b, 0x61, 0x00]);
    payload.extend_from_slice(b"================================\n");
    payload.extend_from_slice(b"This is NOT a cash-out ticket.\n");
    payload.extend_from_slice(b"Printer is connected and working.\n");
    payload.extend_from_slice(b"================================\n");
    payload.extend_from_slice(&[0x1b, 0x64, 0x04]);
    payload.extend_from_slice(&[0x1d, 0x56, 0x41, 0x04]);
    let target = self.send(&payload)?;
    log::info!("test_slip_printed printer={}", target);
    Ok(true)
  }
}

/// Path the printer driver would use (exists or writable).
#[cfg_attr(windows, allow(dead_code))]
pub fn diagnose_printer_path(configured: &str) -> Option<String> {
  resolve_device_path(configured)
}

fn printer_help_hint() -> &'static str {
  if config::is_windows() {
    "Windows: install the printer's driver (Epson, Xprinter, …) so it appears in Printers & scanners."
  } else {
    "Linux: plug the printer USB and power; sudo usermod -aG lp $USER then log out/in."
  }
}

/// Linux: USB manufacturer + product for /dev/usb/lpN (e.g. "EPSON TM-T88V", "Xprinter XP-Q851L").
#[cfg(not(windows))]
pub fn usb_printer_model(path: &str) -> Option<String> {
  let node = Path::new(path).file_name()?.to_str()?.to_string();
  let usb_dev = fs::canonicalize(format!("/sys/class/usbmisc/{node}/device/..")).ok()?;
  let read = |f: &str| {
    fs::read_to_string(usb_dev.join(f))
      .ok()
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty())
  };
  match (read("manufacturer"), read("product")) {
    (Some(m), Some(p)) if p.to_lowercase().starts_with(&m.to_lowercase()) => Some(p),
    (Some(m), Some(p)) => Some(format!("{m} {p}")),
    (None, Some(p)) => Some(p),
    (Some(m), None) => Some(m),
    _ => None,
  }
}

#[cfg(windows)]
pub fn usb_printer_model(_path: &str) -> Option<String> {
  None
}

/// Linux: any USB printer-class device is plugged in (any brand).
#[cfg(not(windows))]
pub fn usb_printer_present() -> bool {
  fs::read_dir("/sys/class/usbmisc")
    .map(|d| d.flatten().any(|e| e.file_name().to_string_lossy().starts_with("lp")))
    .unwrap_or(false)
}

fn resolve_device_path(preferred: &str) -> Option<String> {
  let candidates = config::printer_candidates(preferred);
  // Prefer a path we can open for write (Windows device nodes often fail Path::exists)
  for p in &candidates {
    if OpenOptions::new().write(true).open(p).is_ok() {
      return Some(p.clone());
    }
  }
  // Linux: exists but not writable — still return so connect can report permission clearly
  if !config::is_windows() {
    for p in &candidates {
      if Path::new(p).exists() {
        return Some(p.clone());
      }
    }
  }
  None
}

#[cfg(not(unix))]
fn write_raw(path: &str, payload: &[u8]) -> Result<(), String> {
  let mut file = OpenOptions::new()
    .write(true)
    .open(path)
    .map_err(|e| map_io_err(path, e))?;
  file.write_all(payload).map_err(|e| map_io_err(path, e))?;
  let _ = fs::metadata(path);
  Ok(())
}

/// The kernel holds a blocking write until paper is loaded, and closing the device is what
/// drops a stuck ticket. So write non-blocking, wait with a deadline, and let the file close.
#[cfg(unix)]
fn write_raw(path: &str, payload: &[u8]) -> Result<(), String> {
  use std::io::ErrorKind;
  use std::os::unix::fs::OpenOptionsExt;
  use std::time::Instant;

  let mut file = OpenOptions::new()
    .read(true)
    .write(true)
    .custom_flags(libc::O_NONBLOCK)
    .open(path)
    .map_err(|e| map_io_err(path, e))?;
  let before = check_printer(&mut file, path)?;

  let deadline = Instant::now() + PRINT_TIMEOUT;
  let mut rest = payload;
  loop {
    // Also after the last byte: the data is only with the printer once the device is writable.
    wait_writable(&file, path, deadline)?;
    if rest.is_empty() {
      break;
    }
    match file.write(rest) {
      Ok(n) => rest = &rest[n..],
      Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::Interrupted) => {}
      Err(e) => return Err(map_io_err(path, e)),
    }
  }
  if before == PrinterAnswer::default() {
    return Ok(()); // Cannot report at all: nothing more to check.
  }
  std::thread::sleep(PRINT_SETTLE);
  let after = check_printer(&mut file, path)?;
  if after.went_silent_since(before) {
    log::error!("printer_lost_during_ticket path={path} before={before:?} after={after:?}");
    return Err(PRINTER_NOT_RESPONDING.into());
  }
  Ok(())
}

#[cfg(unix)]
fn wait_writable(file: &fs::File, path: &str, deadline: std::time::Instant) -> Result<(), String> {
  use std::os::fd::AsRawFd;

  let left = deadline.saturating_duration_since(std::time::Instant::now());
  let mut fd = libc::pollfd {
    fd: file.as_raw_fd(),
    events: libc::POLLOUT,
    revents: 0,
  };
  if left.is_zero() || unsafe { libc::poll(&mut fd, 1, left.as_millis() as libc::c_int) } == 0 {
    log::error!("printer_write_timeout path={path}");
    return Err(PRINTER_NOT_RESPONDING.into());
  }
  Ok(())
}

/// None for anything that is not a USB printer: other device types reject the ioctl.
#[cfg(unix)]
fn read_port_status(file: &fs::File) -> Option<u8> {
  use std::os::fd::AsRawFd;
  const LPGETSTATUS: libc::c_int = 0x060b;

  let mut status: libc::c_int = 0;
  (unsafe { libc::ioctl(file.as_raw_fd(), LPGETSTATUS as _, &mut status) } == 0).then_some(status as u8)
}

/// Ask for one real-time status byte. None when the printer does not answer, as some cannot.
#[cfg(unix)]
fn read_realtime_status(file: &mut fs::File, query: u8) -> Option<u8> {
  use std::io::Read;
  use std::os::fd::AsRawFd;
  use std::time::Instant;

  file.write_all(&realtime_query(query)).ok()?;
  let deadline = Instant::now() + REALTIME_REPLY_TIMEOUT;
  let mut reply = [0u8; 1];
  loop {
    if let Ok(1) = file.read(&mut reply) {
      return Some(reply[0]);
    }
    let left = deadline.saturating_duration_since(Instant::now());
    if left.is_zero() {
      return None;
    }
    let mut fd = libc::pollfd {
      fd: file.as_raw_fd(),
      events: libc::POLLIN,
      revents: 0,
    };
    unsafe { libc::poll(&mut fd, 1, left.as_millis().min(50) as libc::c_int) };
  }
}

/// Fails when the printer says it cannot print, and reports what it answered.
/// A device that cannot report answers nothing and passes.
#[cfg(unix)]
fn check_printer(file: &mut fs::File, path: &str) -> Result<PrinterAnswer, String> {
  let mut answer = PrinterAnswer::default();
  let Some(status) = read_port_status(file) else {
    return Ok(answer);
  };
  answer.port = true;
  if let Some(message) = port_status_error(status) {
    log::error!("printer_status_fault path={path} status=0x{status:02x}");
    return Err(message.into());
  }
  for query in REALTIME_QUERIES {
    let Some(reply) = read_realtime_status(file, query) else {
      continue;
    };
    answer.realtime += 1;
    if let Some(message) = realtime_status_error(query, reply) {
      log::error!("printer_realtime_fault path={path} query={query} reply=0x{reply:02x}");
      return Err(message.into());
    }
  }
  Ok(answer)
}

/// Screen messages — plain words only, no device paths, no commands.
/// Technical detail for support is written to the log next to each one.
pub const PRINTER_NOT_CONNECTED: &str =
  "The ticket printer is not connected. Check that it is switched on and the USB cable is plugged in, then try again.";
pub const PRINTER_NO_ACCESS: &str =
  "This machine is not allowed to use the ticket printer. Please call support.";
pub const PRINTER_NOT_RESPONDING: &str =
  "The ticket printer is not responding. Check the paper roll and that the printer is switched on, then try again.";
pub const PRINTER_NO_PAPER: &str =
  "The ticket printer is out of paper. Check the paper roll, then try again.";
pub const PRINTER_COVER_OPEN: &str =
  "The ticket printer cover is open. Close it, then try again.";

fn map_io_err(path: &str, err: std::io::Error) -> String {
  let msg = err.to_string();
  if msg.contains("Permission denied") || err.kind() == std::io::ErrorKind::PermissionDenied {
    let fix = if config::is_windows() {
      "run the terminal as a user that can open the USB printer port, or reinstall as Generic/Text Only on USB00x"
    } else {
      "sudo usermod -aG lp $USER then log out/in"
    };
    log::error!("printer_permission_denied path={path} fix=\"{fix}\"");
    PRINTER_NO_ACCESS.into()
  } else if err.kind() == std::io::ErrorKind::NotFound {
    log::error!("printer_not_found path={path}");
    PRINTER_NOT_CONNECTED.into()
  } else {
    log::error!("printer_io_error path={path} error=\"{msg}\"");
    PRINTER_NOT_RESPONDING.into()
  }
}

fn chrono_like_now() -> String {
  use std::time::{SystemTime, UNIX_EPOCH};
  let secs = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs())
    .unwrap_or(0);
  let days = secs / 86400;
  let tod = secs % 86400;
  let h = tod / 3600;
  let m = (tod % 3600) / 60;
  let mut y = 1970u32;
  let mut rem = days;
  loop {
    let diy = if is_leap(y) { 366 } else { 365 };
    if rem < diy {
      break;
    }
    rem -= diy;
    y += 1;
  }
  let months = [31u64, if is_leap(y) { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let mut mo = 1u32;
  for d in months {
    if rem < d {
      break;
    }
    rem -= d;
    mo += 1;
  }
  let day = rem + 1;
  format!("{y:04}-{mo:02}-{day:02} {h:02}:{m:02}")
}

fn is_leap(y: u32) -> bool {
  (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::{Error, ErrorKind};

  fn is_plain(msg: &str) {
    // Nothing a customer or cashier cannot read: no device paths, commands or codes.
    for junk in ["\\\\.", "/dev/", "USB00", "COM", "sudo", "usermod", "errno", "os error", "0x"] {
      assert!(!msg.contains(junk), "screen text contains technical text {junk:?}: {msg}");
    }
    assert!(msg.ends_with('.'), "must be a full sentence: {msg}");
    assert!(msg.len() < 200, "too long for a pop-up: {msg}");
  }

  #[test]
  fn screen_constants_are_plain_language() {
    is_plain(PRINTER_NOT_CONNECTED);
    is_plain(PRINTER_NO_ACCESS);
    is_plain(PRINTER_NOT_RESPONDING);
    is_plain(PRINTER_NO_PAPER);
    is_plain(PRINTER_COVER_OPEN);
  }

  #[test]
  fn a_printer_that_goes_silent_after_the_ticket_fails_the_cash_out() {
    let full = PrinterAnswer { port: true, realtime: 3 };
    // Switched off or USB reset mid-ticket (the cabinet case: device gone after printing).
    assert!(PrinterAnswer::default().went_silent_since(full));
    // Still on USB but no longer answering status queries.
    assert!(PrinterAnswer { port: true, realtime: 0 }.went_silent_since(full));
    // One missed reply out of three is not silence.
    assert!(!PrinterAnswer { port: true, realtime: 2 }.went_silent_since(full));
    assert!(!full.went_silent_since(full));
    // A printer that never answered real-time queries is judged on its port status only.
    let port_only = PrinterAnswer { port: true, realtime: 0 };
    assert!(!port_only.went_silent_since(port_only));
    assert!(PrinterAnswer::default().went_silent_since(port_only));
  }

  #[test]
  fn realtime_status_reads_paper_cover_and_errors() {
    // The replies a healthy TM-T88V gave on the cabinet.
    assert_eq!(realtime_status_error(1, 0x16), None);
    assert_eq!(realtime_status_error(2, 0x12), None);
    assert_eq!(realtime_status_error(4, 0x12), None);
    // Roll finished, by either sensor report.
    assert_eq!(realtime_status_error(4, 0x72), Some(PRINTER_NO_PAPER));
    assert_eq!(realtime_status_error(2, 0x32), Some(PRINTER_NO_PAPER));
    assert_eq!(realtime_status_error(2, 0x16), Some(PRINTER_COVER_OPEN));
    assert_eq!(realtime_status_error(2, 0x52), Some(PRINTER_NOT_RESPONDING));
    assert_eq!(realtime_status_error(1, 0x1e), Some(PRINTER_NOT_RESPONDING));
    // Roll getting low still prints.
    assert_eq!(realtime_status_error(4, 0x1e), None);
    // Not a status byte: cannot conclude anything.
    assert_eq!(realtime_status_error(4, 0xff), None);
  }

  /// Needs a real printer, prints nothing: `cargo test --lib printer_live -- --ignored --nocapture`
  #[cfg(unix)]
  #[test]
  #[ignore]
  fn printer_live_status() {
    use std::os::unix::fs::OpenOptionsExt;

    let path = fs::read_dir("/dev/usb")
      .unwrap()
      .flatten()
      .map(|e| e.path())
      .find(|p| p.to_string_lossy().contains("/lp"))
      .expect("no USB printer");
    let mut file = OpenOptions::new()
      .read(true)
      .write(true)
      .custom_flags(libc::O_NONBLOCK)
      .open(&path)
      .unwrap();
    println!("{} port status {:?}", path.display(), read_port_status(&file));
    for query in REALTIME_QUERIES {
      let reply = read_realtime_status(&mut file, query).expect("printer must answer");
      println!("query {query}: 0x{reply:02x} fault={:?}", realtime_status_error(query, reply));
    }
    println!("check_printer: {:?}", check_printer(&mut file, &path.to_string_lossy()));
  }

  #[test]
  fn port_status_flags_paper_and_errors_only() {
    // Selected + no error: ready.
    assert_eq!(port_status_error(0x18), None);
    assert_eq!(port_status_error(0x38), Some(PRINTER_NO_PAPER));
    assert_eq!(port_status_error(0x30), Some(PRINTER_NO_PAPER));
    // Cover open / printer fault.
    assert_eq!(port_status_error(0x10), Some(PRINTER_NOT_RESPONDING));
    // Printers without status support must not block every cash-out.
    assert_eq!(port_status_error(0x00), None);
  }

  #[cfg(unix)]
  #[test]
  fn a_device_node_that_disappears_reads_as_disconnected() {
    let path = std::env::temp_dir().join(format!("betwise-printer-test-{}", std::process::id()));
    fs::write(&path, b"").unwrap();
    let mut p = PrinterHandle::new();
    p.connected = true;
    p.device_path = path.to_string_lossy().into_owned();
    assert!(p.status().connected);

    fs::remove_file(&path).unwrap();
    assert!(!p.status().connected);
    assert_eq!(p.print_test_slip().unwrap_err(), PRINTER_NOT_CONNECTED);
  }

  #[cfg(unix)]
  #[test]
  fn write_raw_delivers_the_whole_ticket() {
    let path = std::env::temp_dir().join(format!("betwise-printer-write-{}", std::process::id()));
    fs::write(&path, b"").unwrap();
    let payload = vec![0x41u8; 64 * 1024];
    write_raw(path.to_str().unwrap(), &payload).unwrap();
    assert_eq!(fs::read(&path).unwrap(), payload);
    fs::remove_file(&path).unwrap();
  }

  #[cfg(unix)]
  #[test]
  fn a_printer_that_stops_taking_data_times_out_instead_of_hanging() {
    use std::ffi::CString;
    use std::time::{Duration, Instant};

    let path = std::env::temp_dir().join(format!("betwise-printer-fifo-{}", std::process::id()));
    let c_path = CString::new(path.to_str().unwrap()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(c_path.as_ptr(), 0o600) }, 0);
    // A reader that never reads: the pipe fills up like a printer with no paper.
    let _reader = OpenOptions::new()
      .read(true)
      .custom_flags_nonblock()
      .open(&path)
      .unwrap();

    let started = Instant::now();
    let err = write_raw(path.to_str().unwrap(), &vec![0u8; 8 * 1024 * 1024]).unwrap_err();
    assert_eq!(err, PRINTER_NOT_RESPONDING);
    assert!(started.elapsed() < PRINT_TIMEOUT + Duration::from_secs(2));
    fs::remove_file(&path).unwrap();
  }

  #[cfg(unix)]
  trait NonblockOpen {
    fn custom_flags_nonblock(&mut self) -> &mut Self;
  }

  #[cfg(unix)]
  impl NonblockOpen for OpenOptions {
    fn custom_flags_nonblock(&mut self) -> &mut Self {
      use std::os::unix::fs::OpenOptionsExt;
      self.custom_flags(libc::O_NONBLOCK)
    }
  }

  #[test]
  fn map_io_err_hides_paths_and_picks_the_right_sentence() {
    let path = if config::is_windows() { r"\\.\USB001" } else { "/dev/usb/lp0" };

    let denied = map_io_err(path, Error::new(ErrorKind::PermissionDenied, "Permission denied (os error 13)"));
    assert_eq!(denied, PRINTER_NO_ACCESS);

    let missing = map_io_err(path, Error::new(ErrorKind::NotFound, "No such file or directory (os error 2)"));
    assert_eq!(missing, PRINTER_NOT_CONNECTED);

    let other = map_io_err(path, Error::new(ErrorKind::Other, "Input/output error (os error 5)"));
    assert_eq!(other, PRINTER_NOT_RESPONDING);

    for m in [&denied, &missing, &other] {
      assert!(!m.contains(path));
      is_plain(m);
    }
  }

  #[test]
  fn printing_without_a_device_is_rejected_cleanly() {
    let p = PrinterHandle::new();
    assert!(!p.status().connected);
    let err = p.print_test_slip().unwrap_err();
    assert_eq!(err, PRINTER_NOT_CONNECTED);
    let err = p
      .print_cashout_ticket(&PrintTicketInput {
        code: "T1A2B3C4D".into(),
        amount: 170.0,
        currency: "NAD".into(),
        currency_symbol: "N$".into(),
        terminal_id: "CABIN-01".into(),
      })
      .unwrap_err();
    assert_eq!(err, PRINTER_NOT_CONNECTED);
  }

  #[test]
  fn date_helper_is_sane() {
    assert!(is_leap(2024));
    assert!(is_leap(2000));
    assert!(!is_leap(1900));
    assert!(!is_leap(2026));
    let now = chrono_like_now();
    // YYYY-MM-DD HH:MM
    assert_eq!(now.len(), 16, "{now}");
    assert!(now.starts_with("20"), "{now}");
  }
}
