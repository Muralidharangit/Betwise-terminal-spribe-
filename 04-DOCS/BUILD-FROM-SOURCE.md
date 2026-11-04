# Build from source — Betwise Terminal

## What you need

| Tool | Version used | Notes |
|---|---|---|
| Node.js | 24.x | `node -v` |
| npm | 11.x | comes with Node |
| Rust (stable) | 1.96.x | install from https://rustup.rs |
| Tauri system deps | — | Windows: Visual Studio Build Tools + WebView2. Linux: run `bash scripts/setup-linux.sh`. |

## Install and run

```bash
cd 02-SOURCE
npm ci
cp .env.example .env
# Edit .env:
#   VITE_API_BASE_URL   e.g. https://staging.iccpanel.com/api  (include /api, no portal slug)
#   VITE_PORTAL_SLUG    betwise
#   VITE_PUSHER_APP_KEY / VITE_PUSHER_APP_CLUSTER   from the iccpanel host for that API
npm run tauri:dev
```

Web only (no desktop window):

```bash
npm run dev -- --port 5176
```

## Build the Windows installer

**On a Windows PC (recommended):**

```powershell
cd 02-SOURCE
npm ci
# create .env.production with the production values, then copy it to .env
npm run build
npm run tauri build -- --target x86_64-pc-windows-msvc --bundles nsis
# Installer appears under src-tauri/target/.../release/bundle/nsis/
```

**From Ubuntu/Linux (cross build, as used for the supplied installer):**

```bash
bash scripts/build-windows-from-ubuntu.sh
# or: npm run tauri:build:windows   (needs cargo-xwin, nsis, clang/lld — the script checks these)
```

The supplied installer in `01-INSTALL-Windows/` was built this way and is not code-signed,
so Windows SmartScreen may warn once on first install.

## Other useful commands

```bash
npm run build        # web build only (tsc + vite) -> dist/
npm test             # unit tests (vitest)
npm run test:rust    # Rust tests
npm run tauri:build:deb   # Linux .deb (on Linux)
```

## How the code is laid out

| Path | What it does |
|---|---|
| `src/` | React + TypeScript app (screens, components, lobby, game panels, API client). |
| `src/games/catalog.ts` | Game list and game card images. |
| `src/components/BettingLobby.tsx` | Lobby: promo banners + the 13 Spribe game cards. |
| `src/components/TopPromoBannerSlider.tsx` | The 8 promo banners. |
| `public/assets/games/SPRIBE/` | Game card images used by the lobby. |
| `public/assets/banner/` | Promo banner images (`promo-*.jpg`). |
| `public/brand/` | Brand logo. |
| `src-tauri/` | Tauri / Rust side: window, kiosk lock, printer, bill acceptor, scanner. |
| `src-tauri/tauri.conf.json` | Product name, app identifier, window and bundle settings. |
| `config.json` + `src-tauri/resources/config.json` | Runtime hardware settings (see CONFIGURATION.md). |
