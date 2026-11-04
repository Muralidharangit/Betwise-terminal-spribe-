#!/usr/bin/env bash
# Kiosk Tauri client — Ubuntu/Debian system dependencies
# Run once from tauri-client folder: bash scripts/setup-linux.sh

set -euo pipefail

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required to install system packages."
  exit 1
fi

echo "=== Step 1: apt update (allow PPA label changes) ==="
sudo apt-get update --allow-releaseinfo-change || sudo apt-get update -o Acquire::AllowReleaseInfoChange::Label=true

echo ""
echo "=== Step 2: Install Tauri build dependencies ==="
sudo apt-get install -y \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  pkg-config \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  libwebkit2gtk-4.1-dev

echo ""
echo "=== Step 3: Verify ==="
if ! command -v pkg-config >/dev/null 2>&1; then
  echo "ERROR: pkg-config still missing."
  exit 1
fi

if pkg-config --exists webkit2gtk-4.1; then
  echo "OK: webkit2gtk-4.1 found"
else
  echo "WARNING: webkit2gtk-4.1 not found via pkg-config."
  echo "Try: sudo apt-get install -y libwebkit2gtk-4.1-dev"
  exit 1
fi

if ! command -v rustc >/dev/null 2>&1; then
  echo "=== Step 4: Install Rust ==="
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
else
  echo "OK: Rust already installed ($(rustc --version))"
fi

echo ""
echo "============================================"
echo "Setup complete. Start the Tauri app:"
echo ""
echo "  source \"\$HOME/.cargo/env\""
echo "  cd tauri-client"
echo "  npm run tauri:dev"
echo ""
echo "First compile takes 3–8 minutes — wait for the desktop window."
echo "============================================"
