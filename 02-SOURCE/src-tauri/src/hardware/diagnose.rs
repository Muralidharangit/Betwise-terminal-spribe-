//! New-device hardware checklist: groups, device nodes, USB, live handles.

use super::config::{self, KioskHwConfig};
use super::{DeviceStatusDto, HardwareState};
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::Duration;

#[derive(Clone, Serialize)]
pub struct DiagnoseCheck {
  pub id: String,
  pub name: String,
  pub ok: bool,
  pub detail: String,
}

#[derive(Clone, Serialize)]
pub struct DiagnoseReport {
  pub os: String,
  pub user: String,
  pub groups: Vec<String>,
  pub checks: Vec<DiagnoseCheck>,
  /// Model reported by the connected printer itself (not the config value).
  pub printer_model: Option<String>,
}

fn check(id: &str, name: &str, ok: bool, detail: impl Into<String>) -> DiagnoseCheck {
  DiagnoseCheck {
    id: id.into(),
    name: name.into(),
    ok,
    detail: detail.into(),
  }
}

pub fn run(state: &HardwareState) -> DiagnoseReport {
  let cfg = state.config.lock().ok().map(|g| g.clone()).unwrap_or_else(KioskHwConfig::default);
  let (user, groups) = current_user_groups();
  let mut checks = Vec::new();

  if config::is_windows() {
    checks.push(check(
      "groups",
      "User groups",
      true,
      "Windows — no lp/dialout groups. Run the terminal as a user that can open COM and USB printer ports.",
    ));
  } else {
    let has_lp = groups.iter().any(|g| g == "lp");
    let has_dialout = groups.iter().any(|g| g == "dialout");
    let ok = has_lp && has_dialout;
    let detail = if ok {
      format!("lp and dialout present ({})", groups.join(" "))
    } else {
      format!(
        "Need lp + dialout. Now: [{}]. Run: sudo usermod -aG lp,dialout {} && log out/in (or reboot).",
        groups.join(" "),
        if user.is_empty() { "$USER" } else { &user }
      )
    };
    checks.push(check("groups", "Linux groups (lp, dialout)", ok, detail));
  }

  let printer_model = printer_checks(&cfg, &mut checks);

  let bill_kind = state.bill.lock().ok().map(|b| b.kind());
  let bill_port = match (bill_kind, config::find_itl_port()) {
    (Some(config::BillKind::Nv10), Some(p)) => p,
    _ => config::resolve_bill_port(&cfg.bill_acceptor_port),
  };
  checks.push(check(
    "bill_model",
    "Bill acceptor model",
    bill_kind.is_some(),
    match bill_kind {
      Some(k) => format!(
        "{} (BillAcceptor_Type={})",
        k.label(),
        if cfg.bill_acceptor_type.trim().is_empty() { "auto" } else { cfg.bill_acceptor_type.trim() }
      ),
      None => "unavailable".into(),
    },
  ));
  let bill_exists = Path::new(&bill_port).exists() || config::is_windows();
  checks.push(check(
    "bill_device",
    "Bill acceptor port",
    bill_exists || config::is_windows(),
    if bill_exists || config::is_windows() {
      bill_port.clone()
    } else {
      format!("{bill_port} not found. Plug the bill acceptor USB (NV10 or GBA); set BillAcceptor_Port to auto.")
    },
  ));

  let bill_live = state
    .bill
    .lock()
    .ok()
    .map(|b| b.status())
    .unwrap_or(DeviceStatusDto {
      connected: false,
      enabled: false,
      mode: "offline".into(),
      detail: "unavailable".into(),
    });
  let bill_open = bill_live.connected || try_open_serial(&bill_port);
  checks.push(check(
    "bill_open",
    "Bill acceptor serial",
    bill_open,
    if bill_live.connected {
      bill_live.detail
    } else if bill_open {
      format!("Opened {bill_port}")
    } else {
      format!("Cannot open {bill_port}. Linux: add user to dialout, then log out/in.")
    },
  ));

  let printer_live = state
    .printer
    .lock()
    .ok()
    .map(|p| p.status())
    .unwrap_or(DeviceStatusDto {
      connected: false,
      enabled: false,
      mode: "offline".into(),
      detail: "unavailable".into(),
    });
  checks.push(check(
    "printer_live",
    "Printer ready in terminal",
    printer_live.connected,
    printer_live.detail,
  ));

  if config::is_windows() {
    checks.push(check(
      "usb_scanner",
      "HID barcode scanner",
      true,
      "Windows: use Scan test. The scanner works like a keyboard and cannot be probed.",
    ));
  } else {
    let hid = linux_hid_scanner();
    checks.push(check("usb_scanner", "HID barcode scanner", hid.0, hid.1));
  }

  DiagnoseReport {
    os: if config::is_windows() {
      "Windows".into()
    } else {
      "Linux".into()
    },
    user,
    groups,
    checks,
    printer_model,
  }
}

/// Printer checks. Returns the model/queue name of the detected printer.
#[cfg(not(windows))]
fn printer_checks(cfg: &KioskHwConfig, checks: &mut Vec<DiagnoseCheck>) -> Option<String> {
  let usb_present = super::printer::usb_printer_present();
  match super::printer::diagnose_printer_path(&cfg.printer_device) {
    Some(path) => {
      let writable = std::fs::OpenOptions::new().write(true).open(&path).is_ok();
      checks.push(check("printer_device", "Printer device", true, path.clone()));
      checks.push(check(
        "printer_write",
        "Printer permission",
        writable,
        if writable {
          format!("Can write {path}")
        } else {
          format!("Permission denied on {path}. Add the terminal user to the lp group, then log out/in.")
        },
      ));
      super::printer::usb_printer_model(&path)
    }
    None => {
      checks.push(check(
        "printer_device",
        "Printer device",
        false,
        if usb_present {
          "USB printer seen but no /dev/usb/lp* device. Re-plug the printer."
        } else {
          "No USB printer found. Plug the printer USB and switch it on."
        },
      ));
      None
    }
  }
}

#[cfg(windows)]
fn printer_checks(cfg: &KioskHwConfig, checks: &mut Vec<DiagnoseCheck>) -> Option<String> {
  use super::printer_windows as win;
  let preferred = config::printer_name_preference(&cfg.printer_name).unwrap_or_default();
  match win::pick_receipt_printer(&preferred) {
    Some(p) => {
      checks.push(check(
        "printer_driver",
        "Printer driver",
        true,
        format!("Installed: {} (port {})", p.name, p.port),
      ));
      checks.push(check(
        "printer_device",
        "Printer connected",
        !p.offline,
        if p.offline {
          format!("{} is offline — unplugged or switched off.", p.name)
        } else {
          format!("{} on {}", p.name, p.port)
        },
      ));
      Some(p.name)
    }
    None if win::usb_printer_needs_driver() => {
      checks.push(check(
        "printer_driver",
        "Printer driver",
        false,
        "A USB printer is plugged in but its Windows driver is not installed.",
      ));
      None
    }
    None => {
      checks.push(check(
        "printer_device",
        "Printer connected",
        false,
        "No receipt printer installed in Windows. Plug the printer USB and switch it on.",
      ));
      None
    }
  }
}

fn current_user_groups() -> (String, Vec<String>) {
  let user = std::env::var("USER")
    .or_else(|_| std::env::var("USERNAME"))
    .unwrap_or_default();
  if config::is_windows() {
    return (user, Vec::new());
  }
  let names = Command::new("id")
    .args(["-nG"])
    .output()
    .ok()
    .filter(|o| o.status.success())
    .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
    .unwrap_or_default();
  let groups = names
    .split_whitespace()
    .map(|s| s.to_string())
    .collect();
  (user, groups)
}

fn linux_hid_scanner() -> (bool, String) {
  let raw = fs::read_to_string("/proc/bus/input/devices").unwrap_or_default();
  let lower = raw.to_lowercase();
  if lower.contains("barcode") || lower.contains("zebex") || lower.contains("ultrascan") {
    let name = raw
      .lines()
      .find(|l| l.starts_with("N: Name=") && l.to_lowercase().contains("barcode"))
      .unwrap_or("HID barcode keyboard");
    return (true, name.trim().to_string());
  }
  (false, "No barcode HID in /proc/bus/input/devices. Plug the scanner USB.".into())
}

fn try_open_serial(path: &str) -> bool {
  serialport::new(path, 9600)
    .timeout(Duration::from_millis(50))
    .open()
    .is_ok()
}
