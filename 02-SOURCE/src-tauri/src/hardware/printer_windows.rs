//! Windows: print ESC/POS bytes through the print spooler (RAW datatype) by printer name.
//! Works with any receipt printer whose Windows driver is installed (Epson, Xprinter, …).

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::ptr;
use std::time::{Duration, Instant};
use windows_sys::core::GUID;
use windows_sys::Win32::Devices::DeviceAndDriverInstallation::{
  SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInterfaces, SetupDiGetClassDevsW,
  SetupDiGetDeviceInterfaceDetailW, SetupDiOpenDeviceInterfaceRegKey, DIGCF_DEVICEINTERFACE,
  DIGCF_PRESENT, SP_DEVICE_INTERFACE_DATA, SP_DEVICE_INTERFACE_DETAIL_DATA_W,
};
use windows_sys::Win32::Foundation::{
  CloseHandle, GetLastError, ERROR_IO_PENDING, GENERIC_READ, GENERIC_WRITE, HANDLE,
  INVALID_HANDLE_VALUE, WAIT_OBJECT_0,
};
use windows_sys::Win32::Graphics::Printing::{
  ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, GetJobW, OpenPrinterW, SetJobW,
  StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W, JOB_CONTROL_DELETE, JOB_INFO_1W,
  JOB_STATUS_BLOCKED_DEVQ, JOB_STATUS_DELETED, JOB_STATUS_DELETING, JOB_STATUS_ERROR,
  JOB_STATUS_OFFLINE, JOB_STATUS_PAPEROUT, JOB_STATUS_PRINTED, JOB_STATUS_USER_INTERVENTION,
  PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_5W,
};
use windows_sys::Win32::Storage::FileSystem::{
  CreateFileW, ReadFile, WriteFile, FILE_FLAG_OVERLAPPED, FILE_SHARE_READ, FILE_SHARE_WRITE,
  OPEN_EXISTING,
};
use windows_sys::Win32::System::Registry::{RegCloseKey, RegQueryValueExW, KEY_READ};
use windows_sys::Win32::System::Threading::{CreateEventW, WaitForSingleObject};
use windows_sys::Win32::System::IO::{CancelIoEx, DeviceIoControl, GetOverlappedResult, OVERLAPPED};

const PRINTER_ATTRIBUTE_WORK_OFFLINE: u32 = 0x0000_0400;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const GUID_DEVINTERFACE_USBPRINT: GUID = GUID::from_u128(0x28d78fad_5a12_11d1_ae5b_0000f803a8c2);
const IOCTL_USBPRINT_GET_LPT_STATUS: u32 = 0x0022_0030;
const JOB_FAILED: u32 = JOB_STATUS_ERROR
  | JOB_STATUS_OFFLINE
  | JOB_STATUS_PAPEROUT
  | JOB_STATUS_USER_INTERVENTION
  | JOB_STATUS_BLOCKED_DEVQ
  | JOB_STATUS_DELETING
  | JOB_STATUS_DELETED;

/// Queues that are never receipt printers.
const VIRTUAL_PRINTERS: [&str; 6] = ["pdf", "xps", "onenote", "fax", "send to", "document writer"];
const RECEIPT_HINTS: [&str; 12] = [
  "receipt", "pos", "thermal", "tm-", "xp-", "80mm", "58mm", "esc", "xprinter", "epson", "generic",
  "text only",
];

#[derive(Clone, Debug)]
pub struct InstalledPrinter {
  pub name: String,
  pub port: String,
  pub offline: bool,
}

fn wide(s: &str) -> Vec<u16> {
  OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

unsafe fn from_wide(p: *const u16) -> String {
  if p.is_null() {
    return String::new();
  }
  let mut len = 0usize;
  while *p.add(len) != 0 {
    len += 1;
  }
  String::from_utf16_lossy(std::slice::from_raw_parts(p, len))
}

pub fn list_printers() -> Vec<InstalledPrinter> {
  let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
  let mut needed: u32 = 0;
  let mut count: u32 = 0;
  unsafe {
    EnumPrintersW(flags, ptr::null(), 5, ptr::null_mut(), 0, &mut needed, &mut count);
    if needed == 0 {
      return Vec::new();
    }
    // u64 storage keeps the PRINTER_INFO_5W array aligned.
    let mut buf = vec![0u64; (needed as usize).div_ceil(8)];
    if EnumPrintersW(flags, ptr::null(), 5, buf.as_mut_ptr() as *mut u8, needed, &mut needed, &mut count) == 0 {
      return Vec::new();
    }
    let items = std::slice::from_raw_parts(buf.as_ptr() as *const PRINTER_INFO_5W, count as usize);
    let usb = present_usb_printers();
    items
      .iter()
      .map(|p| {
        let port = from_wide(p.pPortName);
        InstalledPrinter {
          name: from_wide(p.pPrinterName),
          offline: p.Attributes & PRINTER_ATTRIBUTE_WORK_OFFLINE != 0
            || matches!(usb_presence(&usb, &port), UsbPresence::Absent),
          port,
        }
      })
      .collect()
  }
}

/// A USB printer that is switched off has no device; Windows keeps its queue and spools
/// into it, printing every waiting job the moment the printer comes back.
enum UsbPresence<'a> {
  /// Not a USB port, or Windows could not say.
  Unknown,
  Absent,
  Present(&'a str),
}

struct UsbPrinterDevice {
  /// N of the USB00N port; None when the device does not publish it.
  port_number: Option<u32>,
  path: String,
}

fn usb_presence<'a>(devices: &'a Option<Vec<UsbPrinterDevice>>, port: &str) -> UsbPresence<'a> {
  let upper = port.trim().to_uppercase();
  let (Some(digits), Some(devices)) = (upper.strip_prefix("USB"), devices) else {
    return UsbPresence::Unknown;
  };
  let Ok(number) = digits.parse::<u32>() else {
    return UsbPresence::Unknown;
  };
  if let Some(device) = devices.iter().find(|d| d.port_number == Some(number)) {
    return UsbPresence::Present(&device.path);
  }
  if devices.iter().any(|d| d.port_number.is_none()) {
    return UsbPresence::Unknown;
  }
  UsbPresence::Absent
}

/// USB printer-class devices that are plugged in and powered on right now.
fn present_usb_printers() -> Option<Vec<UsbPrinterDevice>> {
  unsafe {
    let set = SetupDiGetClassDevsW(
      &GUID_DEVINTERFACE_USBPRINT,
      ptr::null(),
      ptr::null_mut(),
      DIGCF_PRESENT | DIGCF_DEVICEINTERFACE,
    );
    if set == INVALID_HANDLE_VALUE as isize {
      return None;
    }
    let mut devices = Vec::new();
    let mut index = 0;
    loop {
      let mut iface: SP_DEVICE_INTERFACE_DATA = std::mem::zeroed();
      iface.cbSize = std::mem::size_of::<SP_DEVICE_INTERFACE_DATA>() as u32;
      if SetupDiEnumDeviceInterfaces(set, ptr::null(), &GUID_DEVINTERFACE_USBPRINT, index, &mut iface) == 0 {
        break;
      }
      index += 1;
      let mut needed: u32 = 0;
      SetupDiGetDeviceInterfaceDetailW(set, &iface, ptr::null_mut(), 0, &mut needed, ptr::null_mut());
      // u64 storage keeps the detail struct aligned.
      let mut buf = vec![0u64; (needed as usize).div_ceil(8).max(2)];
      let detail = buf.as_mut_ptr() as *mut SP_DEVICE_INTERFACE_DETAIL_DATA_W;
      (*detail).cbSize = std::mem::size_of::<SP_DEVICE_INTERFACE_DETAIL_DATA_W>() as u32;
      if SetupDiGetDeviceInterfaceDetailW(set, &iface, detail, needed, ptr::null_mut(), ptr::null_mut()) == 0 {
        continue;
      }
      let path = from_wide(ptr::addr_of!((*detail).DevicePath) as *const u16);

      let mut port_number = None;
      let key = SetupDiOpenDeviceInterfaceRegKey(set, &iface, 0, KEY_READ);
      if key != INVALID_HANDLE_VALUE as _ {
        let value = wide("Port Number");
        let mut number: u32 = 0;
        let mut size = std::mem::size_of::<u32>() as u32;
        if RegQueryValueExW(
          key,
          value.as_ptr(),
          ptr::null(),
          ptr::null_mut(),
          &mut number as *mut u32 as *mut u8,
          &mut size,
        ) == 0
        {
          port_number = Some(number);
        }
        RegCloseKey(key);
      }
      devices.push(UsbPrinterDevice { port_number, path });
    }
    SetupDiDestroyDeviceInfoList(set);
    Some(devices)
  }
}

/// Live status byte from the printer itself; a queue cannot tell that the paper ran out.
fn usb_port_status(port: &str) -> Option<u8> {
  let devices = present_usb_printers();
  let UsbPresence::Present(path) = usb_presence(&devices, port) else {
    return None;
  };
  let path = wide(path);
  unsafe {
    let device = CreateFileW(
      path.as_ptr(),
      GENERIC_READ | GENERIC_WRITE,
      FILE_SHARE_READ | FILE_SHARE_WRITE,
      ptr::null(),
      OPEN_EXISTING,
      0,
      ptr::null_mut(),
    );
    if device == INVALID_HANDLE_VALUE {
      return None;
    }
    let mut status: u8 = 0;
    let mut returned: u32 = 0;
    let ok = DeviceIoControl(
      device,
      IOCTL_USBPRINT_GET_LPT_STATUS,
      ptr::null(),
      0,
      &mut status as *mut u8 as *mut _,
      1,
      &mut returned,
      ptr::null_mut(),
    );
    CloseHandle(device);
    (ok != 0 && returned == 1).then_some(status)
  }
}

/// Wait for an overlapped read or write, cancelling it if the printer does not answer.
unsafe fn finish_io(device: HANDLE, ov: *mut OVERLAPPED, started: i32) -> Option<u32> {
  if started == 0 && GetLastError() != ERROR_IO_PENDING {
    return None;
  }
  let mut done: u32 = 0;
  let timeout = super::printer::REALTIME_REPLY_TIMEOUT.as_millis() as u32;
  if WaitForSingleObject((*ov).hEvent, timeout) != WAIT_OBJECT_0 {
    CancelIoEx(device, ov);
    // The kernel still owns the buffers until the cancelled call has finished.
    GetOverlappedResult(device, ov, &mut done, 1);
    return None;
  }
  (GetOverlappedResult(device, ov, &mut done, 0) != 0).then_some(done)
}

unsafe fn realtime_status(device: HANDLE, event: HANDLE, query: u8) -> Option<u8> {
  let command = super::printer::realtime_query(query);
  let mut ov: OVERLAPPED = std::mem::zeroed();
  ov.hEvent = event;
  let started = WriteFile(device, command.as_ptr(), command.len() as u32, ptr::null_mut(), &mut ov);
  finish_io(device, &mut ov, started)?;

  let mut reply: u8 = 0;
  let mut ov: OVERLAPPED = std::mem::zeroed();
  ov.hEvent = event;
  let started = ReadFile(device, &mut reply, 1, ptr::null_mut(), &mut ov);
  (finish_io(device, &mut ov, started)? == 1).then_some(reply)
}

/// Screen message if the printer itself reports a finished roll, open cover or error.
/// The spooler cannot see these: it hands the ticket over and calls the job printed.
/// Also returns how many queries the printer answered.
fn realtime_fault(printer: &str, port: &str) -> (Option<&'static str>, usize) {
  let devices = present_usb_printers();
  let UsbPresence::Present(path) = usb_presence(&devices, port) else {
    return (None, 0);
  };
  let path = wide(path);
  unsafe {
    let device = CreateFileW(
      path.as_ptr(),
      GENERIC_READ | GENERIC_WRITE,
      FILE_SHARE_READ | FILE_SHARE_WRITE,
      ptr::null(),
      OPEN_EXISTING,
      FILE_FLAG_OVERLAPPED,
      ptr::null_mut(),
    );
    if device == INVALID_HANDLE_VALUE {
      return (None, 0);
    }
    let event = CreateEventW(ptr::null(), 1, 0, ptr::null());
    let mut fault = None;
    let mut answered = 0;
    if !event.is_null() {
      for query in super::printer::REALTIME_QUERIES {
        let Some(reply) = realtime_status(device, event, query) else {
          continue;
        };
        answered += 1;
        fault = super::printer::realtime_status_error(query, reply);
        if fault.is_some() {
          log::error!("printer_realtime_fault queue=\"{printer}\" query={query} reply=0x{reply:02x}");
          break;
        }
      }
      CloseHandle(event);
    }
    CloseHandle(device);
    (fault, answered)
  }
}

/// Fails when the printer says it cannot print, and reports what it answered.
fn check_printer(printer: &str, port: &str) -> Result<super::printer::PrinterAnswer, String> {
  let mut answer = super::printer::PrinterAnswer::default();
  if let Some(status) = usb_port_status(port) {
    answer.port = true;
    if let Some(message) = super::printer::port_status_error(status) {
      log::error!("printer_status_fault queue=\"{printer}\" status=0x{status:02x}");
      return Err(message.into());
    }
  }
  let (fault, answered) = realtime_fault(printer, port);
  answer.realtime = answered;
  match fault {
    Some(message) => Err(message.into()),
    None => Ok(answer),
  }
}

fn is_virtual(p: &InstalledPrinter) -> bool {
  let n = p.name.to_lowercase();
  let port = p.port.to_lowercase();
  VIRTUAL_PRINTERS.iter().any(|v| n.contains(v))
    || port.starts_with("portprompt")
    || port.starts_with("nul")
    || port.ends_with(".pdf")
}

/// Pick the receipt printer: configured name (if online) → online USB → name that looks like a receipt printer.
pub fn pick_receipt_printer(preferred: &str) -> Option<InstalledPrinter> {
  let all: Vec<InstalledPrinter> = list_printers().into_iter().filter(|p| !is_virtual(p)).collect();
  let looks_receipt = |p: &InstalledPrinter| {
    let n = p.name.to_lowercase();
    RECEIPT_HINTS.iter().any(|h| n.contains(h))
  };
  let pref = preferred.trim().to_lowercase();
  // Exact name from config — but skip it when Windows marks that queue Offline
  // (common after installing Generic / Text Only while the old Epson queue is still listed).
  if !pref.is_empty() && pref != "auto" {
    if let Some(p) = all.iter().find(|p| p.name.to_lowercase() == pref && !p.offline) {
      return Some(p.clone());
    }
  }
  let usb: Vec<&InstalledPrinter> = all.iter().filter(|p| p.port.to_uppercase().starts_with("USB")).collect();
  if let Some(p) = usb.iter().find(|p| !p.offline && looks_receipt(p)) {
    return Some((*p).clone());
  }
  if let Some(p) = usb.iter().find(|p| !p.offline) {
    return Some((*p).clone());
  }
  // Last resorts: offline preferred name, then any USB / receipt-named queue
  if !pref.is_empty() && pref != "auto" {
    if let Some(p) = all.iter().find(|p| p.name.to_lowercase() == pref) {
      return Some(p.clone());
    }
  }
  usb.first().map(|p| (*p).clone()).or_else(|| all.iter().find(|p| looks_receipt(p)).cloned())
}

pub fn is_offline(name: &str) -> bool {
  list_printers()
    .iter()
    .find(|p| p.name.eq_ignore_ascii_case(name))
    .map(|p| p.offline)
    .unwrap_or(true)
}

/// The spooler accepts a job whatever state the printer is in, so a finished WritePrinter
/// proves nothing. Follow the job until it has printed; on any failure delete it, otherwise
/// a cancelled ticket would still come out when the printer is next switched on.
unsafe fn wait_for_job(handle: HANDLE, printer: &str, job: u32) -> Result<(), String> {
  let deadline = Instant::now() + super::printer::PRINT_TIMEOUT;
  loop {
    let Some(status) = job_status(handle, job) else {
      return Ok(()); // Left the queue: finished.
    };
    if status & JOB_STATUS_PRINTED != 0 {
      return Ok(());
    }
    let failed = status & JOB_FAILED != 0;
    if failed || Instant::now() >= deadline {
      log::error!("printer_job_failed queue=\"{printer}\" job={job} status=0x{status:x} timed_out={}", !failed);
      SetJobW(handle, job, 0, ptr::null(), JOB_CONTROL_DELETE);
      return Err(if status & JOB_STATUS_PAPEROUT != 0 {
        super::printer::PRINTER_NO_PAPER.into()
      } else {
        super::printer::PRINTER_NOT_RESPONDING.into()
      });
    }
    std::thread::sleep(Duration::from_millis(100));
  }
}

unsafe fn job_status(handle: HANDLE, job: u32) -> Option<u32> {
  let mut needed: u32 = 0;
  GetJobW(handle, job, 1, ptr::null_mut(), 0, &mut needed);
  if needed == 0 {
    return None;
  }
  // u64 storage keeps JOB_INFO_1W aligned.
  let mut buf = vec![0u64; (needed as usize).div_ceil(8)];
  if GetJobW(handle, job, 1, buf.as_mut_ptr() as *mut u8, needed, &mut needed) == 0 {
    return None;
  }
  Some((*(buf.as_ptr() as *const JOB_INFO_1W)).Status)
}

/// Send raw ESC/POS bytes to an installed printer queue and wait until they are printed.
pub fn write_raw(printer: &str, port: &str, payload: &[u8]) -> Result<(), String> {
  let before = check_printer(printer, port)?;
  let name = wide(printer);
  let doc_name = wide("Betwise ticket");
  let datatype = wide("RAW");
  unsafe {
    let mut handle = ptr::null_mut();
    if OpenPrinterW(name.as_ptr(), &mut handle, ptr::null()) == 0 {
      log::error!("printer_open_failed queue=\"{printer}\"");
      return Err(super::printer::PRINTER_NOT_CONNECTED.into());
    }
    let doc = DOC_INFO_1W {
      pDocName: doc_name.as_ptr() as *mut u16,
      pOutputFile: ptr::null_mut(),
      pDatatype: datatype.as_ptr() as *mut u16,
    };
    let result = (|| {
      let job = StartDocPrinterW(handle, 1, &doc);
      if job == 0 {
        log::error!("printer_start_doc_failed queue=\"{printer}\"");
        return Err(super::printer::PRINTER_NOT_RESPONDING.into());
      }
      let mut ok = StartPagePrinter(handle) != 0;
      let mut written: u32 = 0;
      if ok {
        ok = WritePrinter(handle, payload.as_ptr() as *const _, payload.len() as u32, &mut written) != 0;
        EndPagePrinter(handle);
      }
      EndDocPrinter(handle);
      if !ok || written as usize != payload.len() {
        log::error!(
          "printer_write_failed queue=\"{printer}\" written={written} expected={}",
          payload.len()
        );
        SetJobW(handle, job, 0, ptr::null(), JOB_CONTROL_DELETE);
        return Err(super::printer::PRINTER_NOT_RESPONDING.into());
      }
      wait_for_job(handle, printer, job)
    })();
    ClosePrinter(handle);
    result?;
    if before == super::printer::PrinterAnswer::default() {
      return Ok(()); // Cannot report at all: the finished job is all there is to go on.
    }
    std::thread::sleep(super::printer::PRINT_SETTLE);
    let after = check_printer(printer, port)?;
    if after.went_silent_since(before) {
      log::error!("printer_lost_during_ticket queue=\"{printer}\" before={before:?} after={after:?}");
      return Err(super::printer::PRINTER_NOT_RESPONDING.into());
    }
    Ok(())
  }
}

/// A USB printer is plugged in (Windows loaded "USB Printing Support") but no printer queue uses it.
pub fn usb_printer_needs_driver() -> bool {
  let usb_queue = list_printers()
    .iter()
    .any(|p| !is_virtual(p) && p.port.to_uppercase().starts_with("USB"));
  if usb_queue {
    return false;
  }
  Command::new("powershell")
    .args([
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "@(Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -like '*USB Printing Support*' -or ($_.PNPClass -eq 'Printer' -and $_.ConfigManagerErrorCode -ne 0) }).Count",
    ])
    .creation_flags(CREATE_NO_WINDOW)
    .output()
    .ok()
    .map(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<u32>().unwrap_or(0) > 0)
    .unwrap_or(false)
}
