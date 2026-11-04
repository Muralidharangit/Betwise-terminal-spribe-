#!/usr/bin/env bash
# Build Windows installer (.exe) from Ubuntu/Linux.
# Note: .msi files can ONLY be built on Windows. This produces NSIS setup.exe instead.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v makensis &>/dev/null; then
  echo "Installing build dependencies (needs sudo password)..."
  sudo apt-get update
  sudo apt-get install -y nsis clang lld llvm
fi

if ! rustup target list --installed | grep -q 'x86_64-pc-windows-msvc'; then
  echo "Adding Windows Rust target..."
  rustup target add x86_64-pc-windows-msvc
fi

if ! command -v cargo-xwin &>/dev/null; then
  echo "Installing cargo-xwin (first time may take several minutes)..."
  cargo install cargo-xwin --locked
fi

if [[ ! -f .env ]]; then
  echo "ERROR: Create tauri-client/.env with:"
  echo "  VITE_API_BASE_URL=http://YOUR-SERVER-IP:8000/api"
  exit 1
fi

echo "Building Windows installer using API: $(grep VITE_API_BASE_URL .env)"
export CARGO_TARGET_DIR="$ROOT/src-tauri/target"
npm run build
npm run tauri -- build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis

OUT="$ROOT/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis"
RELEASES="$ROOT/releases"
mkdir -p "$RELEASES"
if compgen -G "$OUT"/*-setup.exe > /dev/null; then
  cp "$OUT"/*-setup.exe "$RELEASES/"
fi
echo ""
echo "Done! Copy this file to your Windows PC and run it:"
ls -lh "$RELEASES"/*-setup.exe 2>/dev/null || ls -1 "$OUT"/*-setup.exe 2>/dev/null || ls -1 "$OUT"/
