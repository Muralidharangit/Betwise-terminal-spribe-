#!/usr/bin/env python3
"""Probe for an ITL NV10 (SSP protocol).

Usage:
  python3 tools/nv10_probe.py [/dev/ttyACM0]                 read-only, acceptance stays disabled
  python3 tools/nv10_probe.py [/dev/ttyACM0] --listen [secs]  enable, show note events, RETURN the note
  python3 tools/nv10_probe.py [/dev/ttyACM0] --listen --keep  same, but let the note stack into the cashbox
"""
import sys
import time

import serial

ARGS = [a for a in sys.argv[1:] if not a.startswith('--') and not a.isdigit()]
PORT = ARGS[0] if ARGS else '/dev/ttyACM0'
LISTEN = '--listen' in sys.argv
KEEP = '--keep' in sys.argv
LISTEN_SECS = next((int(a) for a in sys.argv[1:] if a.isdigit()), 60)
ADDR = 0x00
STX = 0x7F

CMD_SYNC = 0x11
CMD_HOST_PROTOCOL = 0x06
CMD_SETUP_REQUEST = 0x05
CMD_GET_SERIAL = 0x0C
CMD_POLL = 0x07

GENERIC = {0xF0: 'OK', 0xF2: 'UNKNOWN COMMAND', 0xF3: 'WRONG PARAMS', 0xF4: 'PARAM OUT OF RANGE',
           0xF5: 'CANNOT PROCESS', 0xF6: 'SOFTWARE ERROR', 0xF8: 'FAIL', 0xFA: 'KEY NOT SET'}
EVENTS = {0xF1: 'Slave reset', 0xEF: 'Read note', 0xEE: 'Credit note', 0xED: 'Rejecting', 0xEC: 'Rejected',
          0xCC: 'Stacking', 0xEB: 'Stacked', 0xEA: 'Safe jam', 0xE9: 'Unsafe jam', 0xE8: 'Disabled',
          0xE6: 'Fraud attempt', 0xE7: 'Stacker full', 0xE1: 'Note cleared from front',
          0xE2: 'Note cleared to cashbox', 0xE3: 'Cashbox removed', 0xE4: 'Cashbox replaced'}


def crc16(data):
    crc = 0xFFFF
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x8005) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


class SSP:
    def __init__(self, port):
        self.ser = serial.Serial(port, 9600, bytesize=8, parity='N', stopbits=2, timeout=0.05)
        self.seq = 0x80

    def send(self, payload):
        body = bytes([self.seq | ADDR, len(payload)]) + bytes(payload)
        c = crc16(body)
        body += bytes([c & 0xFF, c >> 8])
        stuffed = bytearray([STX])
        for b in body:
            stuffed.append(b)
            if b == STX:
                stuffed.append(STX)
        self.ser.reset_input_buffer()
        self.ser.write(stuffed)
        reply = self._read(time.time() + 1.0)
        if reply is not None:
            self.seq ^= 0x80
        return reply

    def _read(self, deadline):
        raw = bytearray()
        while time.time() < deadline:
            raw += self.ser.read(64)
            frame = self._parse(raw)
            if frame is not None:
                return frame
        return None

    @staticmethod
    def _parse(raw):
        try:
            start = raw.index(STX)
        except ValueError:
            return None
        out = bytearray()
        i = start + 1
        while i < len(raw):
            b = raw[i]
            if b == STX:
                if i + 1 < len(raw) and raw[i + 1] == STX:
                    out.append(STX)
                    i += 2
                    continue
                if i + 1 >= len(raw):
                    return None
            out.append(b)
            i += 1
            if len(out) >= 2 and len(out) == out[1] + 4:
                if crc16(out[:-2]) != (out[-2] | (out[-1] << 8)):
                    return 'CRC_ERROR'
                return bytes(out[2:-2])
        return None


def main():
    print(f'Opening {PORT} (SSP, 9600 8N2) ...')
    ssp = SSP(PORT)

    r = ssp.send([CMD_SYNC])
    print('SYNC           ->', 'no reply' if r is None else GENERIC.get(r[0], hex(r[0])))
    if r is None:
        print('\nNo SSP reply. The unit may be set to ccTalk/Parallel, or another app has the port.')
        return 1

    for ver in (8, 7, 6):
        r = ssp.send([CMD_HOST_PROTOCOL, ver])
        if r and r[0] == 0xF0:
            print(f'HOST PROTOCOL  -> using protocol version {ver}')
            break

    r = ssp.send([CMD_GET_SERIAL])
    if r and r[0] == 0xF0 and len(r) >= 5:
        print('SERIAL NUMBER  ->', int.from_bytes(r[1:5], 'big'))

    values = []
    r = ssp.send([CMD_SETUP_REQUEST])
    if r and r[0] == 0xF0:
        d = r[1:]
        unit_type = d[0]
        firmware = d[1:5].decode(errors='replace')
        country = d[5:8].decode(errors='replace')
        n = d[11]
        chan_vals = list(d[12:12 + n])
        real_mult = int.from_bytes(d[12 + 2 * n:15 + 2 * n], 'big')
        proto = d[15 + 2 * n]
        print(f'UNIT TYPE      -> {unit_type} (0 = banknote validator)')
        print(f'FIRMWARE       -> {firmware}')
        print(f'COUNTRY        -> {country}')
        print(f'PROTOCOL       -> {proto}')
        print(f'CHANNELS       -> {n}')
        if proto >= 6:
            base = 16 + 2 * n
            countries = [d[base + i * 3: base + i * 3 + 3].decode(errors='replace') for i in range(n)]
            vbase = base + 3 * n
            values = [int.from_bytes(d[vbase + i * 4: vbase + i * 4 + 4], 'little') for i in range(n)]
            for i in range(n):
                print(f'  channel {i + 1}: {values[i]} {countries[i]}')
        else:
            values = [v * real_mult for v in chan_vals]
            for i, v in enumerate(values):
                print(f'  channel {i + 1}: {v} {country}')

    if LISTEN:
        return listen(ssp, values)

    print('\nPolling 5 times (note acceptance stays DISABLED):')
    for _ in range(5):
        r = ssp.send([CMD_POLL])
        if r:
            ev = [EVENTS.get(b, hex(b)) for b in r[1:]]
            print('  POLL ->', GENERIC.get(r[0], hex(r[0])), ev if ev else '(no events)')
        time.sleep(0.25)
    return 0


REJECT_CODES = {0x00: 'accepted', 0x01: 'length fail', 0x02: 'average fail', 0x03: 'coastline fail',
                0x04: 'graph fail', 0x05: 'buried optics', 0x06: 'channel inhibited', 0x07: 'second note',
                0x08: 'rejected by host', 0x0B: 'note too long', 0x0D: 'mechanism slow/stalled',
                0x12: 'twisted note', 0x13: 'escrow timeout'}


def listen(ssp, values):
    def amount(ch):
        return values[ch - 1] if 0 < ch <= len(values) else f'channel {ch}'

    ssp.send([0x02, 0xFF, 0xFF])  # enable all channels
    ssp.send([0x03])              # bezel light on
    r = ssp.send([0x0A])          # enable
    print(f'\nENABLE -> {GENERIC.get(r[0], hex(r[0])) if r else "no reply"}')
    print(f'Insert a note now ({LISTEN_SECS}s). Mode: '
          f'{"KEEP (note goes to cashbox)" if KEEP else "RETURN (note comes back out)"}\n', flush=True)
    end = time.time() + LISTEN_SECS
    returned = False
    try:
        while time.time() < end:
            r = ssp.send([CMD_POLL])
            if r and r[0] == 0xF0 and len(r) > 1:
                ev, i = r[1:], 0
                while i < len(ev):
                    code = ev[i]
                    data = ev[i + 1] if code in (0xEF, 0xEE, 0xE6, 0xE1, 0xE2) and i + 1 < len(ev) else None
                    i += 2 if data is not None else 1
                    if code in (0xE8, 0xB5):
                        continue
                    name = EVENTS.get(code, hex(code))
                    if code == 0xEF and data:
                        print(f'  {name}: N$ {amount(data)} recognised (in escrow)', flush=True)
                        if not KEEP and not returned:
                            returned = True
                            rr = ssp.send([0x08])
                            print(f'  -> returning note: {GENERIC.get(rr[0], hex(rr[0])) if rr else "no reply"}', flush=True)
                    elif code == 0xEF:
                        print('  Reading note ...', flush=True)
                    elif code == 0xEE:
                        print(f'  {name}: N$ {amount(data)}  <-- the app would credit this', flush=True)
                        return 0
                    elif code == 0xEC:
                        rc = ssp.send([0x17])
                        why = REJECT_CODES.get(rc[1], hex(rc[1])) if rc and len(rc) > 1 else '?'
                        print(f'  {name} ({why})', flush=True)
                        if returned:
                            print('\nRESULT: note recognised and returned. NV10 read path works.')
                            return 0
                    else:
                        print(f'  {name}', flush=True)
            time.sleep(0.2)
        print('\nTimed out with no note.')
        return 2
    finally:
        ssp.send([0x09])  # disable
        print('NV10 disabled again.')


if __name__ == '__main__':
    sys.exit(main())
