# Betwise Terminal — Developer Handover

This folder is the complete package for **Betwise Terminal** (brand: Betwise).
It has the Windows installer, the full source code, all images the app uses, and the build notes.

## What is inside

| Folder | What it is |
|---|---|
| `01-INSTALL-Windows/` | Ready to install on Windows. `setup.exe` = installer, `betwise-terminal.exe` = portable app (run without installing). |
| `02-SOURCE/` | Clean source code. No `node_modules`, no `dist`, no Rust `target` folder — run `npm ci` first. |
| `03-ASSETS-REFERENCE/` | Brand logo and lobby reference pictures (full page, 13 game cards, 8 banners). |
| `04-DOCS/` | Build, config and hardware notes. `HARDWARE.md` and `Kiosk-Tauri-API.docx` are included here. |

## Brand details

| Item | Value |
|---|---|
| Product name | Betwise Terminal |
| App identifier | `com.betwise.terminal` |
| App binary | `betwise-terminal.exe` |
| Portal slug (`VITE_PORTAL_SLUG`) | `betwise` |
| Dev port | 5176 |
| Theme | Navy + green — Deep navy background, green buttons and borders. Logo: public/brand/betwise-logo.png |
| Version | 0.1.0 |

## Quick start — just install (Windows)

1. Copy `01-INSTALL-Windows/Betwise Terminal_0.1.0_x64-setup.exe` to the Windows PC and run it.
2. If Windows SmartScreen warns (the build is not signed): **More info → Run anyway**.
3. Plug in the receipt printer and bill acceptor. Keep the hardware settings on `auto` (see `04-DOCS/HARDWARE.md`).
4. Open the app and register the Terminal with the shop / portal for this brand (`betwise`).
5. Staff check: **Ctrl+Shift+D**, then run the printer / bill / scanner tests.

The installer already has the staging API baked in (`https://staging.iccpanel.com/api`).
For a different API, rebuild from source with a new `.env` (see `04-DOCS/BUILD-FROM-SOURCE.md`).

## Quick start — run the source

```bash
cd 02-SOURCE
npm ci
cp .env.example .env          # then edit: API URL, portal slug = betwise, Pusher key/cluster
npm run tauri:dev             # desktop app (needs Rust — see BUILD-FROM-SOURCE.md)
# or web only:
npm run dev -- --port 5176
```

## Games on the lobby (13)

Aviator, Pilot Chicken, Mines, Plinko, Dice, Goal, Hi-Lo, Keno, Balloon, Mini Roulette, Hotline, Keno 80, Trader

Promo banners on the lobby (8): Aviator, Pilot Chicken, Mines, Balloon, Plinko, Dice, Goal, Hotline

Keep these game names exactly as written. The lobby fits all 13 games on one page.

## Before live use

- Change `AdminPassword` in `config.json` (the sample value is `admin123`).
- Put the real production API URL and Pusher values in `.env`. Do not send real passwords or private keys in this zip.
- Test printer, bill acceptor and cash-out on the real cabinet before going live.
