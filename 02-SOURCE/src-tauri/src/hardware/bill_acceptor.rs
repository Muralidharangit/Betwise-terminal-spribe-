//! Bill acceptor front-end: picks NV10 (SSP, see nv10.rs) or GBA ST2.
//! GBA ST2 — ccTalk Plain (addr 40), 9600 8N1. Port of Electron billAcceptor.ts.

use super::config::{BillKind, KioskHwConfig};
use super::{emit_hardware_error, emit_note_accepted, emit_note_reading, emit_note_rejected, DeviceStatusDto};
use serialport::SerialPort;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::AppHandle;

const BV_ADDR: u8 = 40;
const HOST_ADDR: u8 = 1;

/// Shop available coins in cents. u64::MAX = not yet loaded (allow notes).
static SHOP_AVAILABLE_CENTS: AtomicU64 = AtomicU64::new(u64::MAX);

pub fn set_shop_available_coins(amount: f64) {
  let cents = if !amount.is_finite() || amount < 0.0 {
    0
  } else {
    (amount * 100.0).round() as u64
  };
  SHOP_AVAILABLE_CENTS.store(cents, Ordering::Relaxed);
}

pub(super) fn shop_available() -> f64 {
  let cents = SHOP_AVAILABLE_CENTS.load(Ordering::Relaxed);
  if cents == u64::MAX {
    f64::MAX
  } else {
    cents as f64 / 100.0
  }
}

fn default_channels() -> HashMap<u8, f64> {
  HashMap::from([
    (1, 10.0),
    (2, 10.0),
    (3, 20.0),
    (4, 20.0),
    (5, 50.0),
    (6, 50.0),
    (7, 100.0),
  ])
}

fn crc16_ccitt(bytes: &[u8]) -> u16 {
  let mut crc: u16 = 0;
  for &b in bytes {
    crc ^= (b as u16) << 8;
    for _ in 0..8 {
      crc = if crc & 0x8000 != 0 {
        ((crc << 1) ^ 0x1021) & 0xffff
      } else {
        (crc << 1) & 0xffff
      };
    }
  }
  crc
}

fn checksum8(bytes: &[u8]) -> u8 {
  let sum: u16 = bytes.iter().map(|b| *b as u16).sum();
  ((256 - (sum & 0xff)) & 0xff) as u8
}

struct LiveState {
  port: Box<dyn SerialPort>,
  rx: Vec<u8>,
  pending_echo: Vec<u8>,
  use_crc16: bool,
  last_event_counter: i16,
  channels: HashMap<u8, f64>,
  enabled: bool,
  ready: bool,
  saw_host_reply: bool,
}

pub struct BillAcceptorHandle {
  kind: BillKind,
  connected: bool,
  mode: String,
  port_path: String,
  ready: bool,
  enabled: bool,
  stop: Arc<AtomicBool>,
  worker: Option<JoinHandle<()>>,
  shared: Arc<Mutex<Option<LiveState>>>,
  nv10_ready: Arc<AtomicBool>,
}

impl BillAcceptorHandle {
  pub fn new() -> Self {
    Self {
      kind: BillKind::GbaSt2,
      connected: false,
      mode: "offline".into(),
      port_path: String::new(),
      ready: false,
      enabled: false,
      stop: Arc::new(AtomicBool::new(false)),
      worker: None,
      shared: Arc::new(Mutex::new(None)),
      nv10_ready: Arc::new(AtomicBool::new(false)),
    }
  }

  pub fn kind(&self) -> BillKind {
    self.kind
  }

  pub fn status(&self) -> DeviceStatusDto {
    // Worker may have exited (init fail / USB unplug) while `connected` was still true.
    // Treat a finished thread as disconnected so reconnect can open the NV10 again.
    let worker_alive = self.worker.as_ref().is_some_and(|h| !h.is_finished());
    let ready = match self.kind {
      BillKind::Nv10 => self.nv10_ready.load(Ordering::SeqCst),
      BillKind::GbaSt2 => self.ready,
    };
    let connected = self.connected && worker_alive;
    DeviceStatusDto {
      connected,
      enabled: connected && self.enabled && ready,
      mode: self.mode.clone(),
      detail: if connected {
        format!(
          "{} on {}{}",
          self.kind.label(),
          self.port_path,
          if ready { " · ready" } else { " · init" }
        )
      } else {
        format!("{} not connected ({})", self.kind.label(), self.port_path)
      },
    }
  }

  pub fn connect(&mut self, app: AppHandle, cfg: &KioskHwConfig) {
    self.disconnect();
    self.mode = "live".into();
    self.ready = false;
    self.enabled = false;

    let (kind, preferred) = super::config::detect_bill_device(cfg);
    self.kind = kind;
    if kind == BillKind::Nv10 {
      self.connect_nv10(app, preferred);
      return;
    }

    let candidates = super::config::bill_port_fallbacks(&preferred);
    self.port_path = preferred.clone();

    let mut opened: Option<(String, Box<dyn SerialPort>)> = None;
    let mut last_err = String::new();
    for path in &candidates {
      match serialport::new(path, 9600)
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .timeout(Duration::from_millis(50))
        .open()
      {
        Ok(port) => {
          opened = Some((path.clone(), port));
          break;
        }
        Err(err) => {
          last_err = err.to_string();
          log::warn!("bill_port_try_failed path={path} err={err}");
        }
      }
    }

    match opened {
      Some((path, port)) => {
        self.port_path = path;
        self.connected = true;
        self.stop = Arc::new(AtomicBool::new(false));
        let stop = self.stop.clone();
        let shared = self.shared.clone();
        {
          let mut guard = shared.lock().unwrap();
          *guard = Some(LiveState {
            port,
            rx: Vec::new(),
            pending_echo: Vec::new(),
            use_crc16: true,
            last_event_counter: -1,
            channels: default_channels(),
            enabled: false,
            ready: false,
            saw_host_reply: false,
          });
        }
        log::info!("bill_connected port={}", self.port_path);
        let app2 = app.clone();
        let shared2 = shared.clone();
        self.worker = Some(thread::spawn(move || {
          worker_loop(app2, shared2, stop);
        }));
        self.enabled = true;
        self.ready = true;
      }
      None => {
        self.connected = false;
        self.ready = false;
        self.enabled = false;
        self.mode = "offline".into();
        let hint = if super::config::is_windows() {
          "Windows: set BillAcceptor_Port to COM3 (Device Manager → Ports) or auto"
        } else {
          "Linux: set BillAcceptor_Port to /dev/ttyUSB0 or auto; user in dialout group"
        };
        log::error!(
          "bill_connect_failed on {}: {last_err}. {hint}",
          self.port_path
        );
        let _ = app;
      }
    }
  }

  fn connect_nv10(&mut self, app: AppHandle, path: String) {
    self.port_path = path.clone();
    match super::nv10::open(&path) {
      Ok(port) => {
        self.connected = true;
        self.enabled = true;
        self.ready = true;
        self.stop = Arc::new(AtomicBool::new(false));
        self.nv10_ready = Arc::new(AtomicBool::new(false));
        let stop = self.stop.clone();
        let ready = self.nv10_ready.clone();
        log::info!("bill_connected nv10 port={path}");
        self.worker = Some(thread::spawn(move || super::nv10::run(app, port, stop, ready)));
      }
      Err(err) => {
        self.connected = false;
        self.mode = "offline".into();
        log::error!(
          "bill_connect_failed nv10 on {path}: {err}. {}",
          if super::config::is_windows() {
            "Windows: install the ITL USB driver, check the COM port in Device Manager"
          } else {
            "Linux: user must be in dialout group"
          }
        );
      }
    }
  }

  pub fn disconnect(&mut self) {
    self.stop.store(true, Ordering::SeqCst);
    if let Some(handle) = self.worker.take() {
      let _ = handle.join();
    }
    if let Ok(mut g) = self.shared.lock() {
      *g = None;
    }
    self.nv10_ready.store(false, Ordering::SeqCst);
    self.connected = false;
    self.enabled = false;
    self.ready = false;
  }
}

impl Drop for BillAcceptorHandle {
  fn drop(&mut self) {
    self.disconnect();
  }
}

fn worker_loop(app: AppHandle, shared: Arc<Mutex<Option<LiveState>>>, stop: Arc<AtomicBool>) {
  // Init
  {
    let mut guard = match shared.lock() {
      Ok(g) => g,
      Err(_) => return,
    };
    let Some(state) = guard.as_mut() else { return };
    if !initialize_validator(state) {
      log::error!("gba_st2_init_failed: no ccTalk reply");
      emit_hardware_error(&app, "bill", super::NOTE_READER_NOT_RESPONDING);
      return;
    }
    state.ready = true;
    state.enabled = true;
    log::info!("bill_ready channels={:?}", state.channels);
  }

  let mut ticks = 0u32;
  while !stop.load(Ordering::SeqCst) {
    {
      let mut guard = match shared.lock() {
        Ok(g) => g,
        Err(_) => break,
      };
      let Some(state) = guard.as_mut() else { break };

      // Read available bytes
      let mut buf = [0u8; 256];
      match state.port.read(&mut buf) {
        Ok(n) if n > 0 => on_data(state, &buf[..n], &app),
        _ => {}
      }

      ticks += 1;
      if ticks % 10 == 0 {
        write_cmd(state, 231, &[0xff, 0xff]);
        write_cmd(state, 228, &[1]);
      }
      write_cmd(state, 159, &[]);
    }
    thread::sleep(Duration::from_millis(200));
  }
}

fn initialize_validator(state: &mut LiveState) -> bool {
  state.use_crc16 = true;
  let mut ok = false;
  for _ in 0..3 {
    ok = try_simple_poll(state);
    if !ok {
      state.use_crc16 = false;
      ok = try_simple_poll(state);
      if !ok {
        state.use_crc16 = true;
      }
    }
    if ok {
      break;
    }
    thread::sleep(Duration::from_millis(300));
  }
  if !ok {
    log::error!("bill_no_reply");
    return false;
  }
  log::info!(
    "bill_link_ok checksum={}",
    if state.use_crc16 { "crc16" } else { "sum8" }
  );

  write_cmd(state, 153, &[0x02]);
  thread::sleep(Duration::from_millis(120));
  write_cmd(state, 231, &[0xff, 0xff]);
  thread::sleep(Duration::from_millis(100));
  write_cmd(state, 228, &[1]);
  thread::sleep(Duration::from_millis(100));
  write_cmd(state, 159, &[]);
  thread::sleep(Duration::from_millis(150));
  true
}

fn try_simple_poll(state: &mut LiveState) -> bool {
  state.saw_host_reply = false;
  write_cmd(state, 254, &[]);
  let deadline = std::time::Instant::now() + Duration::from_millis(500);
  while std::time::Instant::now() < deadline {
    let mut buf = [0u8; 256];
    if let Ok(n) = state.port.read(&mut buf) {
      if n > 0 {
        // Minimal parse without app emit during probe
        strip_and_buffer(state, &buf[..n]);
        drain_rx_probe(state);
      }
    }
    if state.saw_host_reply {
      return true;
    }
    thread::sleep(Duration::from_millis(20));
  }
  state.saw_host_reply
}

fn build_packet(use_crc16: bool, header: u8, data: &[u8]) -> Vec<u8> {
  if use_crc16 {
    let mut for_crc = vec![BV_ADDR, data.len() as u8, header];
    for_crc.extend_from_slice(data);
    let crc = crc16_ccitt(&for_crc);
    let mut pkt = vec![BV_ADDR, data.len() as u8, (crc & 0xff) as u8, header];
    pkt.extend_from_slice(data);
    pkt.push((crc >> 8) as u8);
    pkt
  } else {
    let mut body = vec![BV_ADDR, data.len() as u8, HOST_ADDR, header];
    body.extend_from_slice(data);
    let cs = checksum8(&body);
    body.push(cs);
    body
  }
}

fn write_cmd(state: &mut LiveState, header: u8, data: &[u8]) {
  let pkt = build_packet(state.use_crc16, header, data);
  state.pending_echo.extend_from_slice(&pkt);
  let _ = state.port.write_all(&pkt);
}

fn on_data(state: &mut LiveState, chunk: &[u8], app: &AppHandle) {
  strip_and_buffer(state, chunk);
  drain_rx(state, app);
}

fn strip_and_buffer(state: &mut LiveState, chunk: &[u8]) {
  let mut buf = chunk.to_vec();
  while !state.pending_echo.is_empty() && !buf.is_empty() {
    if buf[0] == state.pending_echo[0] {
      state.pending_echo.remove(0);
      buf.remove(0);
    } else {
      state.pending_echo.remove(0);
    }
  }
  if !buf.is_empty() {
    state.rx.extend_from_slice(&buf);
  }
}

fn drain_rx_probe(state: &mut LiveState) {
  while state.rx.len() >= 5 {
    let start = match state.rx.iter().position(|&b| b == HOST_ADDR) {
      Some(i) => i,
      None => {
        state.rx.clear();
        return;
      }
    };
    if start > 0 {
      state.rx.drain(0..start);
    }
    let n = state.rx[1] as usize;
    if n > 32 {
      state.rx.remove(0);
      continue;
    }
    let frame_len = 5 + n;
    if state.rx.len() < frame_len {
      return;
    }
    state.rx.drain(0..frame_len);
    state.saw_host_reply = true;
  }
}

fn drain_rx(state: &mut LiveState, app: &AppHandle) {
  while state.rx.len() >= 5 {
    let start = match state.rx.iter().position(|&b| b == HOST_ADDR) {
      Some(i) => i,
      None => {
        state.rx.clear();
        return;
      }
    };
    if start > 0 {
      state.rx.drain(0..start);
    }
    let n = state.rx[1] as usize;
    if n > 32 {
      state.rx.remove(0);
      continue;
    }
    let frame_len = 5 + n;
    if state.rx.len() < frame_len {
      return;
    }
    let frame: Vec<u8> = state.rx.drain(0..frame_len).collect();
    let header = frame[3];
    let data = frame[4..4 + n].to_vec();
    state.saw_host_reply = true;
    handle_reply(state, header, &data, app);
  }
}

fn handle_reply(state: &mut LiveState, header: u8, data: &[u8], app: &AppHandle) {
  if header == 6 {
    return;
  }
  if data.len() == 11 {
    process_event_buffer(state, data, app);
    return;
  }
  let _ = header;
}

fn process_event_buffer(state: &mut LiveState, data: &[u8], app: &AppHandle) {
  let counter = data[0] as i16;
  if state.last_event_counter < 0 {
    state.last_event_counter = counter;
    return;
  }
  if counter == state.last_event_counter {
    return;
  }
  let mut new_count = counter - state.last_event_counter;
  if new_count < 0 {
    new_count += 255;
  }
  if new_count > 5 {
    new_count = 5;
  }
  state.last_event_counter = counter;

  for i in (0..new_count).rev() {
    let a = data[1 + (i as usize) * 2];
    let b = data[2 + (i as usize) * 2];
    handle_event(state, a, b, app);
  }
}

fn handle_event(state: &mut LiveState, result_a: u8, result_b: u8, app: &AppHandle) {
  log::info!("bill_event a={result_a} b={result_b}");
  if result_a >= 1 {
    if result_b == 1 {
      let amount = *state.channels.get(&result_a).unwrap_or(&(result_a as f64 * 10.0));
      if amount > shop_available() + 0.001 {
        write_cmd(state, 154, &[0]); // return escrow
        emit_note_rejected(app, "shop_balance_too_low");
        return;
      }
      write_cmd(state, 154, &[1]); // stack escrow
      emit_note_reading(app, amount);
      return;
    }
    if result_b == 0 {
      let amount = *state.channels.get(&result_a).unwrap_or(&(result_a as f64 * 10.0));
      if !state.enabled {
        return;
      }
      log::info!("bill_credit channel={result_a} amount={amount}");
      emit_note_accepted(app, amount, "NAD");
      return;
    }
  }
  if result_a == 0 {
    if result_b == 0 {
      write_cmd(state, 231, &[0xff, 0xff]);
      write_cmd(state, 228, &[1]);
    } else if result_b == 2 || result_b == 3 || result_b == 4 || result_b == 5 {
      let reason = match result_b {
        2 => "code_2_validation",
        3 => "code_3_transport",
        4 => "code_4_inhibited_serial",
        5 => "code_5_inhibited_dip",
        _ => "rejected",
      };
      emit_note_rejected(app, reason);
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn default_channels_match_accepted_namibian_notes() {
    let ch = default_channels();
    let mut values: Vec<f64> = ch.values().copied().collect();
    values.sort_by(|a, b| a.partial_cmp(b).unwrap());
    values.dedup();
    assert_eq!(values, vec![10.0, 20.0, 50.0, 100.0]);
  }

  #[test]
  fn cctalk_checksum8_makes_packet_sum_to_zero() {
    let body = [BV_ADDR, 0u8, HOST_ADDR, 254u8];
    let cs = checksum8(&body);
    let total: u32 = body.iter().map(|b| *b as u32).sum::<u32>() + cs as u32;
    assert_eq!(total % 256, 0);
  }

  #[test]
  fn crc16_ccitt_reference_vector() {
    // "123456789" with poly 0x1021, init 0 → 0x31C3 (CRC-16/XMODEM)
    assert_eq!(crc16_ccitt(b"123456789"), 0x31C3);
  }

  #[test]
  fn simple_packet_layout_is_cctalk() {
    // Simple poll (header 254) with checksum
    let pkt = build_packet(false, 254, &[]);
    assert_eq!(pkt.len(), 5);
    assert_eq!(&pkt[..4], &[BV_ADDR, 0, HOST_ADDR, 254]);
    let total: u32 = pkt.iter().map(|b| *b as u32).sum();
    assert_eq!(total % 256, 0);

    // With data bytes the length byte is updated.
    let pkt = build_packet(false, 231, &[0xFF, 0x00]);
    assert_eq!(pkt[1], 2);
    assert_eq!(pkt.len(), 7);
  }

  #[test]
  fn crc16_packet_layout_is_cctalk() {
    let pkt = build_packet(true, 254, &[]);
    assert_eq!(pkt.len(), 5);
    assert_eq!(pkt[0], BV_ADDR);
    assert_eq!(pkt[1], 0);
    assert_eq!(pkt[3], 254);
    let crc = crc16_ccitt(&[BV_ADDR, 0, 254]);
    assert_eq!(pkt[2], (crc & 0xff) as u8);
    assert_eq!(pkt[4], (crc >> 8) as u8);
  }

  #[test]
  fn fresh_handle_reports_not_connected() {
    let h = BillAcceptorHandle::new();
    let st = h.status();
    assert!(!st.connected);
    assert!(!st.enabled);
  }
}
