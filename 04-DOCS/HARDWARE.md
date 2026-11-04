# Hardware — Linux & Windows

Keep **`auto`** for printer and bill acceptor so the same build works on both OSes.

| Setting | Linux | Windows | Auto |
|---------|-------|---------|------|
| `Printer_Name` | ignored when `auto` (name comes from USB) | ignored when `auto` (picked from Printers & scanners) | `"auto"` |
| `Printer_Device` | `/dev/usb/lp0` … | Windows printer queue / USB port | Scans USB printers |
| `BillAcceptor_Port` | `/dev/ttyACM0` (NV10) · `/dev/ttyUSB0` (GBA) | `COMx` | Scans serial ports |
| `BillAcceptor_Type` | `nv10` or `gba_st2` | same | Detects at start-up |
| Barcode scanner | HID keyboard wedge | Same | No config |

## Printer auto-detect

**Linux:** finds a writable `/dev/usb/lp*` and reads the USB model (e.g. EPSON TM-T88V, Xprinter XP-Q851L).

**Windows:** lists installed printers and picks, in order:

1. Online printer whose name matches `Printer_Name` (only if you set a real name, not `auto`)
2. Online USB printer whose name looks like a receipt printer (Epson, XP-, POS, Generic / Text Only, …)
3. Any other online USB printer

Tickets are sent as raw ESC/POS. On Windows, **Generic / Text Only** on the USB port is the most reliable if the brand driver prints nothing.

Recommended `config.json`:

```json
"Printer_Name": "auto",
"Printer_Device": "auto",
"BillAcceptor_Port": "auto",
"BillAcceptor_Type": "auto"
```

After installing a Windows driver, restart the app (or open **Ctrl+Shift+D** → Check again). The app re-scans printers every status refresh.

## Bill acceptors (NV10 and GBA ST2)

1. **ITL NV10** — USB id `191c`, SSP on `/dev/ttyACM*` (Linux) or ITL COM port (Windows). Needs the ITL USB driver on Windows.
2. If no ITL id, ports are probed with SSP sync.
3. Otherwise **GBA ST2** — ccTalk on the first USB serial port.

## Examples

- `config.linux.example.json` — Linux (all `auto`)
- `config.windows.example.json` — Windows (all `auto`)

## Linux permissions

```bash
sudo usermod -aG lp,dialout $USER
# log out / in
```

## Staff terminal check

**Ctrl+Shift+D**, password `admin123` (or `AdminPassword` in `config.json`). Runs printer / note reader / scanner checks.

## Windows notes

1. Printer must appear in **Printers & scanners** (brand driver or Generic / Text Only).
2. Bill acceptor → Device Manager → Ports (COM & LPT). Install the ITL driver for NV10.
3. Restart the app after plugging devices.
