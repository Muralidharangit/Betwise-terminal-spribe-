# Configuration — Betwise Terminal

## 1) `.env` (build time — set before you build)

Copy `.env.example` to `.env` and fill it in. For a production build also copy the same
values to `.env.production` (see `.env.production.example` in `02-SOURCE/`).

| Key | Example | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | `https://staging.iccpanel.com/api` | API root. Include `/api`. Do not add the portal slug. |
| `VITE_PORTAL_SLUG` | `betwise` | Default portal for Terminal registration. Can be changed on the register screen. |
| `VITE_PUSHER_APP_KEY` | *(from the API host)* | Pusher key of the iccpanel host you point at. |
| `VITE_PUSHER_APP_CLUSTER` | `ap2` | Pusher cluster. |
| `VITE_HW_SIMULATOR` | `false` | Hardware demo overlay. Keep `false` on a real cabinet. |
| `VITE_PERF_MODE` | `auto` | `full` / `lite` / `auto` animations. `auto` uses lite on slow PCs. |

If you change the API host, also allow that host in `connect-src` in
`02-SOURCE/src-tauri/tauri.conf.json`.

## 2) `config.json` (run time — hardware)

Sample files: `04-DOCS/config.windows.example.json` and `config.linux.example.json`.
Keep printer and bill acceptor on `auto` so one build works on Windows and Linux.

| Field | Sample | Meaning |
|---|---|---|
| `API_URL` | `http://127.0.0.1:8000/api` | Local API override when used. |
| `Terminal_ID` | `TERMINAL-001` | Terminal label. Real ID is set at registration. |
| `Printer_Name` / `Printer_Device` | `auto` | Auto-detect the receipt printer. |
| `BillAcceptor_Port` / `BillAcceptor_Type` | `auto` | Auto-detect NV10 / GBA ST2. |
| `AdminPassword` | `admin123` | Staff screens (Ctrl+Shift+D / H). **Change this before live use.** |
| `Currency` / `CurrencySymbol` | `NAD` / `N$` | Money shown on the Terminal. |
| `SessionTimeoutSeconds` | `120` | Idle session timeout. |
| `KioskLockdown` | `false` | Lock the cabinet to the app when `true`. |

Full hardware notes (drivers, Linux permissions, Windows printer notes): `04-DOCS/HARDWARE.md`.

## 3) Useful staff keys (on the Terminal)

| Keys | What it opens |
|---|---|
| Ctrl+Shift+D | Terminal check — printer / bill / scanner tests. |
| Ctrl+Shift+H | Hardware demo overlay (only when the simulator is on). |
