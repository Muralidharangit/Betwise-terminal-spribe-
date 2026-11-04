use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KioskHwConfig {
  #[serde(rename = "API_URL", default = "default_api")]
  pub api_url: String,
  #[serde(rename = "Terminal_ID", default = "default_terminal")]
  pub terminal_id: String,
  #[serde(rename = "Printer_Name", default = "default_printer_name")]
  pub printer_name: String,
  /// Linux: `/dev/usb/lp0` · Windows: `\\.\USB001` · or `auto`
  #[serde(rename = "Printer_Device", default = "default_printer_device")]
  pub printer_device: String,
  /// Linux: `/dev/ttyUSB0` · Windows: `COM3` · or `auto`
  #[serde(rename = "BillAcceptor_Port", default = "default_bill_port")]
  pub bill_acceptor_port: String,
  /// `auto` (detect NV10 / GBA ST2) · `nv10` · `gba_st2`
  #[serde(rename = "BillAcceptor_Type", default = "default_bill_type")]
  pub bill_acceptor_type: String,
  #[serde(rename = "CoinAcceptor_Port", default)]
  pub coin_acceptor_port: String,
  #[serde(rename = "Currency", default = "default_currency")]
  pub currency: String,
  #[serde(rename = "CurrencySymbol", default = "default_symbol")]
  pub currency_symbol: String,
  #[serde(rename = "AdminPassword", default = "default_admin_password")]
  pub admin_password: String,
}

fn default_api() -> String {
  "http://127.0.0.1:8000/api".into()
}
fn default_terminal() -> String {
  "TERMINAL-001".into()
}
fn default_printer_name() -> String {
  "auto".into()
}

/// Optional Windows/Linux name hint. `auto` / empty = pick whatever is plugged in.
pub fn printer_name_preference(value: &str) -> Option<String> {
  let v = value.trim();
  if v.is_empty() || is_auto_like(v) {
    None
  } else {
    Some(v.to_string())
  }
}
fn default_printer_device() -> String {
  "auto".into()
}
fn default_bill_port() -> String {
  "auto".into()
}
fn default_bill_type() -> String {
  "auto".into()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BillKind {
  Nv10,
  GbaSt2,
}

impl BillKind {
  pub fn label(self) -> &'static str {
    match self {
      BillKind::Nv10 => "NV10 (SSP)",
      BillKind::GbaSt2 => "GBA ST2 (ccTalk)",
    }
  }
}

/// `None` = auto-detect.
pub fn configured_bill_kind(value: &str) -> Option<BillKind> {
  match value.trim().to_ascii_lowercase().replace(['-', ' '], "_").as_str() {
    "nv10" | "nv" | "itl" | "ssp" => Some(BillKind::Nv10),
    "gba_st2" | "gba" | "st2" | "cctalk" => Some(BillKind::GbaSt2),
    _ => None,
  }
}

/// Serial port of a connected ITL validator, found by USB vendor id (no traffic sent).
pub fn find_itl_port() -> Option<String> {
  serialport::available_ports().ok()?.into_iter().find_map(|p| match p.port_type {
    serialport::SerialPortType::UsbPort(info) if info.vid == super::nv10::ITL_USB_VID => Some(p.port_name),
    _ => None,
  })
}

fn usb_serial_ports() -> Vec<String> {
  serialport::available_ports()
    .map(|ports| {
      ports
        .into_iter()
        .filter(|p| matches!(p.port_type, serialport::SerialPortType::UsbPort(_)))
        .map(|p| p.port_name)
        .collect()
    })
    .unwrap_or_default()
}

fn is_itl_port(path: &str) -> bool {
  find_itl_port().as_deref() == Some(path)
}

/// Decide which bill acceptor driver to run and on which port.
/// Auto order: ITL USB vendor id → SSP answer on a USB serial port → GBA ST2 on the usual port.
pub fn detect_bill_device(cfg: &KioskHwConfig) -> (BillKind, String) {
  let forced = configured_bill_kind(&cfg.bill_acceptor_type);
  let explicit_port = !is_auto(&cfg.bill_acceptor_port);

  if explicit_port {
    let port = resolve_bill_port(&cfg.bill_acceptor_port);
    let kind = forced.unwrap_or_else(|| {
      if is_itl_port(&port) || super::nv10::probe(&port) {
        BillKind::Nv10
      } else {
        BillKind::GbaSt2
      }
    });
    log::info!("bill_device kind={kind:?} port={port} (port from config)");
    return (kind, port);
  }

  if forced != Some(BillKind::GbaSt2) {
    if let Some(port) = find_itl_port() {
      log::info!("bill_device kind=Nv10 port={port} (ITL USB id)");
      return (BillKind::Nv10, port);
    }
    for port in usb_serial_ports() {
      if super::nv10::probe(&port) {
        log::info!("bill_device kind=Nv10 port={port} (SSP answer)");
        return (BillKind::Nv10, port);
      }
    }
  }

  let port = resolve_bill_port(&cfg.bill_acceptor_port);
  let kind = forced.unwrap_or(BillKind::GbaSt2);
  log::info!("bill_device kind={kind:?} port={port}");
  (kind, port)
}
fn default_currency() -> String {
  "NAD".into()
}
fn default_symbol() -> String {
  "N$".into()
}
fn default_admin_password() -> String {
  "admin123".into()
}

pub fn is_windows() -> bool {
  cfg!(target_os = "windows")
}

pub fn os_default_bill_port() -> String {
  if is_windows() {
    "COM3".into()
  } else {
    "/dev/ttyUSB0".into()
  }
}

pub fn os_default_printer_device() -> String {
  if is_windows() {
    r"\\.\USB001".into()
  } else {
    "/dev/usb/lp0".into()
  }
}

pub fn is_auto_like(value: &str) -> bool {
  let v = value.trim();
  v.is_empty() || v.eq_ignore_ascii_case("auto")
}

fn is_auto(value: &str) -> bool {
  is_auto_like(value)
}

fn looks_like_windows_serial(value: &str) -> bool {
  let u = value.trim().to_ascii_uppercase();
  u.starts_with("COM") || u.starts_with(r"\\.\COM")
}

fn looks_like_unix_serial(value: &str) -> bool {
  let v = value.trim();
  v.starts_with("/dev/tty") || v.starts_with("/dev/serial")
}

fn looks_like_windows_printer(value: &str) -> bool {
  let v = value.trim();
  let u = v.to_ascii_uppercase();
  v.starts_with(r"\\.\") || u.starts_with("USB") || u.starts_with("LPT")
}

fn looks_like_unix_printer(value: &str) -> bool {
  value.trim().starts_with("/dev/usb/lp") || value.trim().starts_with("/dev/usb/")
}

/// Pick a usable serial port for the bill acceptor on this OS.
pub fn resolve_bill_port(configured: &str) -> String {
  let cfg = configured.trim();
  if !is_auto(cfg) {
    if is_windows() && looks_like_unix_serial(cfg) {
      log::warn!(
        "BillAcceptor_Port={cfg} is a Linux path on Windows — auto-detecting COM port"
      );
    } else if !is_windows() && looks_like_windows_serial(cfg) {
      log::warn!(
        "BillAcceptor_Port={cfg} is a Windows COM port on Linux — auto-detecting tty"
      );
    } else {
      return cfg.to_string();
    }
  }

  if let Some(port) = detect_serial_port() {
    log::info!("bill_port_resolved path={port}");
    return port;
  }

  let fallback = os_default_bill_port();
  log::warn!("bill_port_fallback path={fallback}");
  fallback
}

/// Candidate printer device paths for the current OS (preferred first).
pub fn printer_candidates(configured: &str) -> Vec<String> {
  let mut out = Vec::new();
  let cfg = configured.trim();
  if !is_auto(cfg) {
    let wrong_os = (is_windows() && looks_like_unix_printer(cfg))
      || (!is_windows() && looks_like_windows_printer(cfg));
    if wrong_os {
      log::warn!(
        "Printer_Device={cfg} does not match this OS — trying platform defaults"
      );
    } else {
      out.push(cfg.to_string());
    }
  }

  if is_windows() {
    for p in [
      r"\\.\USB001",
      r"\\.\USB002",
      r"\\.\USB003",
      r"\\.\USB004",
      "USB001",
      "USB002",
      "USB003",
      r"\\.\LPT1",
    ] {
      if !out.iter().any(|x| x == p) {
        out.push(p.into());
      }
    }
  } else {
    for p in ["/dev/usb/lp0", "/dev/usb/lp1", "/dev/usb/lp2"] {
      if !out.iter().any(|x| x == p) {
        out.push(p.into());
      }
    }
  }
  out
}

fn detect_serial_port() -> Option<String> {
  let ports = serialport::available_ports().ok()?;
  // Prefer USB serial adapters (typical for GBA ST2)
  for p in &ports {
    if matches!(p.port_type, serialport::SerialPortType::UsbPort { .. }) {
      return Some(p.port_name.clone());
    }
  }
  ports.into_iter().next().map(|p| p.port_name)
}

/// All serial ports to try if the preferred one fails.
pub fn bill_port_fallbacks(preferred: &str) -> Vec<String> {
  let mut out = vec![preferred.to_string()];
  if let Ok(ports) = serialport::available_ports() {
    for p in ports {
      if !out.iter().any(|x| x == &p.port_name) {
        out.push(p.port_name);
      }
    }
  }
  let os_default = os_default_bill_port();
  if !out.iter().any(|x| x == &os_default) {
    out.push(os_default);
  }
  out
}

impl Default for KioskHwConfig {
  fn default() -> Self {
    Self {
      api_url: default_api(),
      terminal_id: default_terminal(),
      printer_name: default_printer_name(),
      printer_device: default_printer_device(),
      bill_acceptor_port: default_bill_port(),
      bill_acceptor_type: default_bill_type(),
      coin_acceptor_port: String::new(),
      currency: default_currency(),
      currency_symbol: default_symbol(),
      admin_password: default_admin_password(),
    }
  }
}

/// Shipped inside the .exe so Windows/Linux installs work with no manual copy.
const EMBEDDED_CONFIG: &str = include_str!("../../resources/config.json");

impl KioskHwConfig {
  pub fn load() -> Self {
    for path in Self::candidate_paths() {
      if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(cfg) = serde_json::from_str::<KioskHwConfig>(&raw) {
          log::info!("Loaded kiosk hardware config from {}", path.display());
          return cfg;
        }
      }
    }
    if let Ok(cfg) = serde_json::from_str::<KioskHwConfig>(EMBEDDED_CONFIG) {
      log::info!("Loaded embedded config.json (shipped inside the app)");
      return cfg;
    }
    log::warn!("No config.json found — using OS defaults (auto devices)");
    Self::default()
  }

  fn candidate_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
      paths.push(cwd.join("config.json"));
      paths.push(cwd.join("../config.json"));
      paths.push(cwd.join("../../config.json"));
    }
    if let Ok(exe) = std::env::current_exe() {
      if let Some(dir) = exe.parent() {
        // Prefer a file next to the program (staff can edit without rebuilding).
        paths.push(dir.join("config.json"));
        paths.push(dir.join("resources").join("config.json"));
        paths.push(dir.join("../config.json"));
        paths.push(dir.join("../Resources").join("config.json"));
      }
    }
    paths
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn embedded_config_json_is_valid() {
    // The config shipped inside the .exe/.deb must always parse, otherwise every
    // install would silently fall back to defaults.
    let cfg: KioskHwConfig = serde_json::from_str(EMBEDDED_CONFIG).expect("resources/config.json must parse");
    assert!(!cfg.currency.is_empty());
    assert!(!cfg.currency_symbol.is_empty());
    assert!(!cfg.admin_password.is_empty());
  }

  #[test]
  fn defaults_are_auto_detect() {
    let cfg = KioskHwConfig::default();
    assert!(is_auto_like(&cfg.printer_device));
    assert!(is_auto_like(&cfg.bill_acceptor_port));
    assert!(is_auto_like(&cfg.bill_acceptor_type));
    assert_eq!(cfg.currency_symbol, "N$");
  }

  #[test]
  fn auto_like_accepts_blank_and_any_case() {
    for v in ["", "  ", "auto", "AUTO", " Auto "] {
      assert!(is_auto_like(v), "{v:?}");
    }
    assert!(!is_auto_like("COM3"));
    assert!(!is_auto_like("/dev/usb/lp0"));
  }

  #[test]
  fn printer_name_preference_drops_auto() {
    assert_eq!(printer_name_preference("auto"), None);
    assert_eq!(printer_name_preference(""), None);
    assert_eq!(printer_name_preference(" EPSON TM-T20 "), Some("EPSON TM-T20".into()));
  }

  #[test]
  fn bill_kind_parsing_is_forgiving() {
    for v in ["nv10", "NV10", "nv", "ITL", "ssp"] {
      assert_eq!(configured_bill_kind(v), Some(BillKind::Nv10), "{v}");
    }
    for v in ["gba_st2", "GBA-ST2", "gba st2", "gba", "st2", "ccTalk"] {
      assert_eq!(configured_bill_kind(v), Some(BillKind::GbaSt2), "{v}");
    }
    assert_eq!(configured_bill_kind("auto"), None);
    assert_eq!(configured_bill_kind(""), None);
    assert_eq!(configured_bill_kind("unknown"), None);
    assert_eq!(BillKind::Nv10.label(), "NV10 (SSP)");
    assert_eq!(BillKind::GbaSt2.label(), "GBA ST2 (ccTalk)");
  }

  #[test]
  fn path_shape_detection() {
    assert!(looks_like_windows_serial("COM3"));
    assert!(looks_like_windows_serial(r"\\.\COM12"));
    assert!(!looks_like_windows_serial("/dev/ttyUSB0"));
    assert!(looks_like_unix_serial("/dev/ttyUSB0"));
    assert!(looks_like_unix_serial("/dev/serial/by-id/usb-ITL"));
    assert!(!looks_like_unix_serial("COM3"));
    assert!(looks_like_windows_printer(r"\\.\USB001"));
    assert!(looks_like_windows_printer("USB002"));
    assert!(looks_like_windows_printer("LPT1"));
    assert!(!looks_like_windows_printer("/dev/usb/lp0"));
    assert!(looks_like_unix_printer("/dev/usb/lp0"));
    assert!(!looks_like_unix_printer("USB001"));
  }

  #[test]
  fn printer_candidates_prefers_config_then_os_defaults_without_duplicates() {
    let os_first = os_default_printer_device();
    let auto = printer_candidates("auto");
    assert_eq!(auto.first(), Some(&os_first));
    assert!(auto.len() >= 3);

    // A valid path for this OS is tried first.
    let custom = if is_windows() { r"\\.\USB009".to_string() } else { "/dev/usb/lp7".to_string() };
    let list = printer_candidates(&custom);
    assert_eq!(list[0], custom);
    assert_eq!(list.iter().filter(|p| **p == custom).count(), 1);

    // Configuring the OS default must not duplicate it.
    let dup = printer_candidates(&os_first);
    assert_eq!(dup.iter().filter(|p| **p == os_first).count(), 1);

    // A path from the other OS is ignored and defaults are used.
    let wrong = if is_windows() { "/dev/usb/lp0" } else { r"\\.\USB001" };
    let list = printer_candidates(wrong);
    assert!(!list.iter().any(|p| p == wrong));
    assert_eq!(list.first(), Some(&os_first));
  }

  #[test]
  fn resolve_bill_port_keeps_explicit_native_path() {
    let native = if is_windows() { "COM7" } else { "/dev/ttyUSB3" };
    assert_eq!(resolve_bill_port(native), native);
    assert_eq!(resolve_bill_port(&format!("  {native}  ")), native);
  }

  #[test]
  fn resolve_bill_port_never_returns_empty() {
    let wrong = if is_windows() { "/dev/ttyUSB0" } else { "COM3" };
    assert!(!resolve_bill_port(wrong).is_empty());
    assert!(!resolve_bill_port("auto").is_empty());
  }

  #[test]
  fn bill_port_fallbacks_start_with_preferred_and_end_with_os_default() {
    let list = bill_port_fallbacks("PREFERRED");
    assert_eq!(list[0], "PREFERRED");
    assert!(list.contains(&os_default_bill_port()));
    let unique: std::collections::HashSet<_> = list.iter().collect();
    assert_eq!(unique.len(), list.len(), "no duplicate ports");
  }
}
