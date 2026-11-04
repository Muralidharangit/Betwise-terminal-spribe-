//! ITL NV10 (and other NV-series validators) — SSP protocol without encryption, address 0, 9600 8N2.
//! USB models enumerate as a CDC serial port (/dev/ttyACM*, COMx) with vendor id 0x191C.

use super::{
  emit_hardware_error, emit_note_accepted, emit_note_reading, emit_note_rejected,
  NOTE_READER_CASHBOX_FULL, NOTE_READER_FRAUD, NOTE_READER_JAM, NOTE_READER_NOT_RESPONDING,
};
use serialport::SerialPort;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::AppHandle;

pub const ITL_USB_VID: u16 = 0x191C;

const STX: u8 = 0x7F;
const SSP_ADDR: u8 = 0x00;

const CMD_SET_INHIBITS: u8 = 0x02;
const CMD_DISPLAY_ON: u8 = 0x03;
const CMD_SETUP_REQUEST: u8 = 0x05;
const CMD_HOST_PROTOCOL: u8 = 0x06;
const CMD_POLL: u8 = 0x07;
const CMD_REJECT: u8 = 0x08;
const CMD_DISABLE: u8 = 0x09;
const CMD_ENABLE: u8 = 0x0A;
const CMD_GET_SERIAL: u8 = 0x0C;
const CMD_SYNC: u8 = 0x11;
const CMD_LAST_REJECT_CODE: u8 = 0x17;

const RESP_OK: u8 = 0xF0;

const EV_SLAVE_RESET: u8 = 0xF1;
const EV_READ: u8 = 0xEF;
const EV_CREDIT: u8 = 0xEE;
const EV_REJECTING: u8 = 0xED;
const EV_REJECTED: u8 = 0xEC;
const EV_STACKED: u8 = 0xEB;
const EV_SAFE_JAM: u8 = 0xEA;
const EV_UNSAFE_JAM: u8 = 0xE9;
const EV_DISABLED: u8 = 0xE8;
const EV_STACKER_FULL: u8 = 0xE7;
const EV_FRAUD: u8 = 0xE6;
const EV_CASHBOX_REMOVED: u8 = 0xE3;
const EV_CASHBOX_REPLACED: u8 = 0xE4;
const EV_NOTE_CLEARED_FRONT: u8 = 0xE1;
const EV_NOTE_CLEARED_CASHBOX: u8 = 0xE2;
const EV_CHANNEL_DISABLE: u8 = 0xB5;

/// Events followed by one data byte (channel number).
fn event_data_len(code: u8) -> usize {
  match code {
    EV_READ | EV_CREDIT | EV_FRAUD | EV_NOTE_CLEARED_FRONT | EV_NOTE_CLEARED_CASHBOX => 1,
    _ => 0,
  }
}

fn crc16(data: &[u8]) -> u16 {
  let mut crc: u16 = 0xFFFF;
  for &b in data {
    crc ^= (b as u16) << 8;
    for _ in 0..8 {
      crc = if crc & 0x8000 != 0 { (crc << 1) ^ 0x8005 } else { crc << 1 };
    }
  }
  crc
}

pub fn open(path: &str) -> Result<Box<dyn SerialPort>, String> {
  serialport::new(path, 9600)
    .data_bits(serialport::DataBits::Eight)
    .parity(serialport::Parity::None)
    .stop_bits(serialport::StopBits::Two)
    .timeout(Duration::from_millis(40))
    .open()
    .map_err(|e| e.to_string())
}

/// True when an SSP validator answers SYNC on this port.
pub fn probe(path: &str) -> bool {
  match open(path) {
    Ok(port) => {
      let mut link = SspLink::new(port);
      link.transact(&[CMD_SYNC]).map(|r| r.first() == Some(&RESP_OK)).unwrap_or(false)
    }
    Err(_) => false,
  }
}

struct SspLink {
  port: Box<dyn SerialPort>,
  seq: bool,
}

impl SspLink {
  fn new(port: Box<dyn SerialPort>) -> Self {
    Self { port, seq: true }
  }

  /// Send one command; retries with the same sequence bit (SSP rule) until a valid reply.
  fn transact(&mut self, payload: &[u8]) -> Option<Vec<u8>> {
    for _ in 0..3 {
      let seq_addr = if self.seq { 0x80 | SSP_ADDR } else { SSP_ADDR };
      let mut body = vec![seq_addr, payload.len() as u8];
      body.extend_from_slice(payload);
      let crc = crc16(&body);
      body.push((crc & 0xFF) as u8);
      body.push((crc >> 8) as u8);

      let mut frame = vec![STX];
      for b in body {
        frame.push(b);
        if b == STX {
          frame.push(STX);
        }
      }
      let _ = self.port.clear(serialport::ClearBuffer::Input);
      if self.port.write_all(&frame).is_err() {
        continue;
      }
      if let Some(reply) = self.read_reply(Instant::now() + Duration::from_millis(400)) {
        self.seq = !self.seq;
        return Some(reply);
      }
    }
    None
  }

  fn read_reply(&mut self, deadline: Instant) -> Option<Vec<u8>> {
    let mut raw: Vec<u8> = Vec::new();
    let mut buf = [0u8; 128];
    while Instant::now() < deadline {
      if let Ok(n) = self.port.read(&mut buf) {
        raw.extend_from_slice(&buf[..n]);
        if let Some(data) = parse_frame(&raw) {
          return Some(data);
        }
      }
    }
    None
  }
}

/// Returns the reply data (without seq/len/crc) once a complete, CRC-valid frame is buffered.
fn parse_frame(raw: &[u8]) -> Option<Vec<u8>> {
  let start = raw.iter().position(|&b| b == STX)?;
  let mut out: Vec<u8> = Vec::new();
  let mut i = start + 1;
  while i < raw.len() {
    let b = raw[i];
    if b == STX {
      match raw.get(i + 1) {
        Some(&STX) => {
          out.push(STX);
          i += 2;
          continue;
        }
        Some(_) => {
          out.clear();
          i += 1;
          continue;
        }
        None => return None,
      }
    }
    out.push(b);
    i += 1;
    if out.len() >= 2 && out.len() == out[1] as usize + 4 {
      let n = out.len();
      let crc = crc16(&out[..n - 2]);
      if crc != (out[n - 2] as u16 | ((out[n - 1] as u16) << 8)) {
        return None;
      }
      return Some(out[2..n - 2].to_vec());
    }
  }
  None
}

struct Setup {
  currency: String,
  channel_values: Vec<f64>,
}

fn parse_setup(r: &[u8]) -> Option<Setup> {
  if r.first() != Some(&RESP_OK) || r.len() < 17 {
    return None;
  }
  let d = &r[1..];
  let country = String::from_utf8_lossy(&d[5..8]).to_string();
  let n = d[11] as usize;
  if d.len() < 16 + 2 * n {
    return None;
  }
  let real_mult = u32::from_be_bytes([0, d[12 + 2 * n], d[13 + 2 * n], d[14 + 2 * n]]).max(1);
  let protocol = d[15 + 2 * n];
  let mut values = Vec::with_capacity(n);
  let vbase = 16 + 2 * n + 3 * n;
  if protocol >= 6 && d.len() >= vbase + 4 * n {
    for i in 0..n {
      let o = vbase + i * 4;
      values.push(u32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]]) as f64);
    }
  } else {
    for i in 0..n {
      values.push((d[12 + i] as u32 * real_mult) as f64);
    }
  }
  Some(Setup { currency: country, channel_values: values })
}

fn reject_reason(code: u8) -> &'static str {
  match code {
    0x06 => "code_4_inhibited_serial",
    0x07 | 0x0B | 0x0D | 0x12 | 0x13 | 0x1C => "code_3_transport",
    _ => "code_2_validation",
  }
}

struct Session {
  link: SspLink,
  setup: Setup,
  serial: u32,
}

fn initialise(port: Box<dyn SerialPort>) -> Result<Session, (Box<dyn SerialPort>, String)> {
  let mut link = SspLink::new(port);
  if link.transact(&[CMD_SYNC]).map(|r| r.first() == Some(&RESP_OK)) != Some(true) {
    return Err((link.port, "NV10 not answering SSP SYNC".into()));
  }
  for ver in [8u8, 7, 6] {
    if link.transact(&[CMD_HOST_PROTOCOL, ver]).map(|r| r.first() == Some(&RESP_OK)) == Some(true) {
      break;
    }
  }
  let serial = link
    .transact(&[CMD_GET_SERIAL])
    .filter(|r| r.first() == Some(&RESP_OK) && r.len() >= 5)
    .map(|r| u32::from_be_bytes([r[1], r[2], r[3], r[4]]))
    .unwrap_or(0);
  let setup = match link.transact(&[CMD_SETUP_REQUEST]).as_deref().and_then(parse_setup) {
    Some(s) => s,
    None => {
      log::error!("nv10_setup_request_failed");
      return Err((link.port, NOTE_READER_NOT_RESPONDING.into()));
    }
  };
  enable(&mut link);
  Ok(Session { link, setup, serial })
}

fn enable(link: &mut SspLink) {
  link.transact(&[CMD_SET_INHIBITS, 0xFF, 0xFF]);
  link.transact(&[CMD_DISPLAY_ON]);
  link.transact(&[CMD_ENABLE]);
}

/// Worker thread body. `ready` mirrors whether the validator is enabled and answering.
pub fn run(app: AppHandle, port: Box<dyn SerialPort>, stop: Arc<AtomicBool>, ready: Arc<AtomicBool>) {
  let mut session = match initialise(port) {
    Ok(s) => s,
    Err((_, err)) => {
      log::error!("nv10_init_failed: {err}");
      emit_hardware_error(&app, "bill", &err);
      return;
    }
  };
  log::info!(
    "nv10_ready serial={} currency={} channels={:?}",
    session.serial,
    session.setup.currency,
    session.setup.channel_values
  );
  ready.store(true, Ordering::SeqCst);

  let mut misses = 0u32;
  let mut host_rejected = false;
  let mut escrow_checked = false;
  let mut last_reenable = Instant::now() - Duration::from_secs(10);

  while !stop.load(Ordering::SeqCst) {
    std::thread::sleep(Duration::from_millis(200));

    let Some(reply) = session.link.transact(&[CMD_POLL]) else {
      misses += 1;
      if misses == 5 {
        ready.store(false, Ordering::SeqCst);
        log::error!("nv10_no_reply");
        emit_hardware_error(&app, "bill", NOTE_READER_NOT_RESPONDING);
      }
      if misses >= 5 && misses % 10 == 0 {
        session.link.seq = true;
        if session.link.transact(&[CMD_SYNC]).is_some() {
          enable(&mut session.link);
          misses = 0;
          ready.store(true, Ordering::SeqCst);
          log::info!("nv10_link_restored");
        }
      }
      continue;
    };
    misses = 0;
    if reply.first() != Some(&RESP_OK) {
      continue;
    }

    let events = &reply[1..];
    let mut i = 0;
    while i < events.len() {
      let code = events[i];
      let len = event_data_len(code);
      let data = events.get(i + 1).copied().unwrap_or(0);
      i += 1 + len;

      match code {
        EV_SLAVE_RESET => {
          log::warn!("nv10_slave_reset");
          enable(&mut session.link);
        }
        EV_READ if data > 0 && !escrow_checked => {
          escrow_checked = true;
          let amount = channel_amount(&session.setup, data);
          if amount > super::bill_acceptor::shop_available() + 0.001 {
            host_rejected = true;
            session.link.transact(&[CMD_REJECT]);
            emit_note_rejected(&app, "shop_balance_too_low");
          } else {
            emit_note_reading(&app, amount);
          }
        }
        EV_CREDIT => {
          escrow_checked = false;
          let amount = channel_amount(&session.setup, data);
          log::info!("bill_credit nv10 channel={data} amount={amount}");
          emit_note_accepted(&app, amount, &session.setup.currency);
        }
        EV_REJECTED => {
          escrow_checked = false;
          if host_rejected {
            host_rejected = false;
          } else {
            let code = session
              .link
              .transact(&[CMD_LAST_REJECT_CODE])
              .filter(|r| r.first() == Some(&RESP_OK) && r.len() >= 2)
              .map(|r| r[1])
              .unwrap_or(0xFF);
            log::info!("nv10_rejected code={code:#04x}");
            emit_note_rejected(&app, reject_reason(code));
          }
        }
        EV_REJECTING | EV_STACKED => {}
        EV_STACKER_FULL => {
          log::error!("nv10_cashbox_full");
          emit_hardware_error(&app, "bill", NOTE_READER_CASHBOX_FULL);
        }
        EV_SAFE_JAM | EV_UNSAFE_JAM => {
          log::error!("nv10_note_jam code={code:#04x}");
          emit_hardware_error(&app, "bill", NOTE_READER_JAM);
        }
        EV_FRAUD => {
          log::error!("nv10_fraud_attempt");
          emit_hardware_error(&app, "bill", NOTE_READER_FRAUD);
        }
        EV_CASHBOX_REMOVED => log::warn!("nv10_cashbox_removed"),
        EV_CASHBOX_REPLACED => log::info!("nv10_cashbox_replaced"),
        EV_DISABLED | EV_CHANNEL_DISABLE => {
          if last_reenable.elapsed() > Duration::from_secs(2) {
            last_reenable = Instant::now();
            enable(&mut session.link);
          }
        }
        _ => {}
      }
    }
  }

  session.link.transact(&[CMD_DISABLE]);
  ready.store(false, Ordering::SeqCst);
  log::info!("nv10_stopped");
}

fn channel_amount(setup: &Setup, channel: u8) -> f64 {
  setup
    .channel_values
    .get(channel.saturating_sub(1) as usize)
    .copied()
    .unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn crc_matches_itl_sync_frame() {
    // ITL reference: SYNC with seq bit set -> 7F 80 01 11 65 82
    let c = crc16(&[0x80, 0x01, 0x11]);
    assert_eq!([(c & 0xFF) as u8, (c >> 8) as u8], [0x65, 0x82]);
  }

  /// Needs a real validator: `cargo test --lib nv10_live -- --ignored --nocapture`
  #[test]
  #[ignore]
  fn nv10_live_detect_and_setup() {
    let (kind, port) = crate::hardware::config::detect_bill_device(&Default::default());
    println!("detected {kind:?} on {port}");
    assert_eq!(kind, crate::hardware::config::BillKind::Nv10);
    let mut link = SspLink::new(open(&port).expect("open"));
    assert_eq!(link.transact(&[CMD_SYNC]).unwrap()[0], RESP_OK);
    link.transact(&[CMD_HOST_PROTOCOL, 7]);
    let setup = parse_setup(&link.transact(&[CMD_SETUP_REQUEST]).unwrap()).expect("setup");
    println!("currency={} channels={:?}", setup.currency, setup.channel_values);
    assert!(!setup.channel_values.is_empty());
  }

  #[test]
  fn parses_stuffed_frame() {
    let body = [0x80u8, 0x02, 0xF0, 0x7F];
    let c = crc16(&body);
    let mut raw = vec![STX, 0x80, 0x02, 0xF0, 0x7F, 0x7F];
    raw.push((c & 0xFF) as u8);
    raw.push((c >> 8) as u8);
    assert_eq!(parse_frame(&raw), Some(vec![0xF0, 0x7F]));
  }
  #[test]
  fn parse_frame_rejects_bad_crc_and_waits_for_more_bytes() {
    let body = [0x80u8, 0x01, 0xF0];
    let c = crc16(&body);
    let mut good = vec![STX, 0x80, 0x01, 0xF0, (c & 0xFF) as u8, (c >> 8) as u8];
    assert_eq!(parse_frame(&good), Some(vec![0xF0]));

    // Flip a CRC byte → rejected
    let last = good.len() - 1;
    good[last] ^= 0xFF;
    assert_eq!(parse_frame(&good), None);

    // Incomplete frame → not yet
    assert_eq!(parse_frame(&[STX, 0x80, 0x01, 0xF0]), None);
    // Garbage before STX is skipped
    let mut noisy = vec![0x00, 0x12];
    noisy.extend_from_slice(&[STX, 0x80, 0x01, 0xF0, (c & 0xFF) as u8, (c >> 8) as u8]);
    assert_eq!(parse_frame(&noisy), Some(vec![0xF0]));
    assert_eq!(parse_frame(&[]), None);
  }

  #[test]
  fn reject_reasons_group_codes() {
    assert_eq!(reject_reason(0x06), "code_4_inhibited_serial");
    for c in [0x07u8, 0x0B, 0x0D, 0x12, 0x13, 0x1C] {
      assert_eq!(reject_reason(c), "code_3_transport", "{c:#x}");
    }
    assert_eq!(reject_reason(0x01), "code_2_validation");
    assert_eq!(reject_reason(0xFF), "code_2_validation");
  }

  #[test]
  fn channel_amount_is_one_based_and_safe() {
    let setup = Setup { currency: "NAD".into(), channel_values: vec![10.0, 20.0, 50.0] };
    assert_eq!(channel_amount(&setup, 1), 10.0);
    assert_eq!(channel_amount(&setup, 3), 50.0);
    assert_eq!(channel_amount(&setup, 0), 10.0); // saturating
    assert_eq!(channel_amount(&setup, 9), 0.0);
    assert_eq!(setup.currency, "NAD");
  }

  #[test]
  fn event_data_len_only_for_note_events() {
    for c in [EV_READ, EV_CREDIT, EV_FRAUD, EV_NOTE_CLEARED_FRONT, EV_NOTE_CLEARED_CASHBOX] {
      assert_eq!(event_data_len(c), 1);
    }
    for c in [EV_STACKER_FULL, EV_SAFE_JAM, EV_UNSAFE_JAM, EV_DISABLED, EV_CASHBOX_REMOVED, EV_CASHBOX_REPLACED, EV_CHANNEL_DISABLE] {
      assert_eq!(event_data_len(c), 0);
    }
  }

  #[test]
  fn parse_setup_rejects_short_or_failed_replies() {
    assert!(parse_setup(&[0xF5]).is_none());
    assert!(parse_setup(&[RESP_OK, 0, 1, 2]).is_none());
  }

  #[test]
  fn note_reader_screen_messages_are_plain() {
    for m in [
      super::super::NOTE_READER_NOT_RESPONDING,
      super::super::NOTE_READER_CASHBOX_FULL,
      super::super::NOTE_READER_JAM,
      super::super::NOTE_READER_FRAUD,
    ] {
      for junk in ["NV10", "SSP", "ccTalk", "COM", "/dev/", "0x"] {
        assert!(!m.contains(junk), "{m}");
      }
      assert!(m.ends_with('.'));
      assert!(m.contains("cashier"), "staff action must be clear: {m}");
    }
  }
}
