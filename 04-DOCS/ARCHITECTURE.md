# How it fits together — Betwise Terminal

```
Player / Cashier
      |
Betwise Terminal  (this app: React UI + Tauri/Rust shell, fullscreen kiosk)
      |
      +-- iccpanel API (VITE_API_BASE_URL)  — registration, balance, games, cash in/out
      +-- Pusher (VITE_PUSHER_*)             — live updates to the Terminal
      +-- Spribe games                       — launched from the lobby cards
      +-- Cabinet hardware (Rust side)       — receipt printer, bill acceptor, barcode scanner
```

- The **React side** (`02-SOURCE/src/`) draws every screen: register Terminal, lobby with
  banners and 13 game cards, game play, cash out.
- The **Tauri/Rust side** (`02-SOURCE/src-tauri/`) owns the window, kiosk lock and the
  hardware, so the same build works with the printer and bill acceptor on the cabinet.
- Money and game results come from the API. The Terminal does not keep its own game maths.
- Images are plain files under `02-SOURCE/public/`. Replace a file with the same name and
  rebuild to change a card or banner. Keep the game names in `src/games/catalog.ts` and
  `src/components/BettingLobby.tsx` as they are.
